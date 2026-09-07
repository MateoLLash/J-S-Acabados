"""
Router de Analítica de Negocio
--------------------------------
Dos features "wow" que van más allá del CRUD:

1. /analitica/prediccion-stock
   En vez de una alerta fija de "stock bajo", calcula la VELOCIDAD real de
   venta de cada producto (usando venta_detalle + fecha de venta) y estima
   en cuántos días se agota, al ritmo actual.

2. /analitica/rentabilidad
   Margen real (precio_venta - precio_compra) generado por cada venta ya
   registrada, agrupado por categoría y por marca, más una rotación de
   inventario calculada con datos reales (no números de adorno).

Ambos endpoints son de solo lectura y reutilizan las tablas que ya existen
(productos, ventas, venta_detalle) — no requieren migraciones nuevas.
"""

from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.producto import Producto
from app.models.venta import Venta, VentaDetalle
from app.models.catalogo import Categoria
from app.auth.dependencies import get_current_user

router = APIRouter(prefix="/analitica", tags=["analitica"])


# ---------------------------------------------------------------------------
# 1) PREDICCIÓN DE QUIEBRE DE STOCK
# ---------------------------------------------------------------------------
@router.get("/prediccion-stock")
def prediccion_quiebre_stock(
    dias_analisis: int = Query(30, ge=7, le=180, description="Ventana histórica para medir velocidad de venta"),
    solo_riesgo: bool = Query(False, description="Si es true, solo devuelve productos en riesgo (críticos o en alerta)"),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    desde = datetime.utcnow() - timedelta(days=dias_analisis)

    # Unidades vendidas por producto en la ventana de análisis
    ventas_por_producto = dict(
        db.query(VentaDetalle.producto_id, func.sum(VentaDetalle.cantidad))
        .join(Venta, Venta.id == VentaDetalle.venta_id)
        .filter(Venta.fecha >= desde)
        .group_by(VentaDetalle.producto_id)
        .all()
    )

    productos = db.query(Producto).all()
    resultado = []

    for p in productos:
        vendidas = int(ventas_por_producto.get(p.id, 0) or 0)
        velocidad_diaria = vendidas / dias_analisis if dias_analisis > 0 else 0

        if velocidad_diaria > 0:
            dias_restantes = round(p.stock / velocidad_diaria, 1)
        elif p.stock <= p.stock_minimo:
            # No se vendió en el período pero ya está en (o bajo) su mínimo:
            # no hay velocidad para proyectar, pero igual es una alerta.
            dias_restantes = None
        else:
            dias_restantes = None  # sin ventas recientes -> no se puede proyectar

        # Clasificación del riesgo
        if dias_restantes is not None and dias_restantes <= 7:
            estado = "critico"
        elif dias_restantes is not None and dias_restantes <= 15:
            estado = "alerta"
        elif dias_restantes is None and p.stock <= p.stock_minimo:
            estado = "alerta"  # stock bajo mínimo aunque no haya rotación medible
        else:
            estado = "normal"

        if solo_riesgo and estado == "normal":
            continue

        resultado.append({
            "producto_id": p.id,
            "codigo": p.codigo,
            "nombre": p.nombre,
            "categoria": p.categoria.nombre if p.categoria else None,
            "marca": p.marca.nombre if p.marca else None,
            "stock": p.stock,
            "stock_minimo": p.stock_minimo,
            "unidades_vendidas_periodo": vendidas,
            "velocidad_diaria": round(velocidad_diaria, 2),
            "dias_restantes": dias_restantes,
            "estado": estado,
        })

    # Los más urgentes primero (None = sin riesgo proyectable, va al final)
    resultado.sort(key=lambda r: (r["dias_restantes"] is None, r["dias_restantes"]))

    return {
        "dias_analisis": dias_analisis,
        "total_productos": len(resultado),
        "criticos": sum(1 for r in resultado if r["estado"] == "critico"),
        "en_alerta": sum(1 for r in resultado if r["estado"] == "alerta"),
        "items": resultado,
    }


# ---------------------------------------------------------------------------
# 2) PANEL DE RENTABILIDAD
# ---------------------------------------------------------------------------
@router.get("/rentabilidad")
def panel_rentabilidad(
    dias_analisis: Optional[int] = Query(None, ge=1, description="Si se omite, usa todo el historial de ventas"),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    query = (
        db.query(
            VentaDetalle.producto_id,
            func.sum(VentaDetalle.cantidad).label("unidades"),
            func.sum(VentaDetalle.cantidad * VentaDetalle.precio_unitario).label("ingreso"),
        )
        .join(Venta, Venta.id == VentaDetalle.venta_id)
    )
    if dias_analisis:
        desde = datetime.utcnow() - timedelta(days=dias_analisis)
        query = query.filter(Venta.fecha >= desde)

    filas = query.group_by(VentaDetalle.producto_id).all()

    productos_map = {p.id: p for p in db.query(Producto).all()}

    por_categoria = {}
    por_marca = {}
    ranking_productos = []
    total_ingreso = 0.0
    total_costo = 0.0

    for producto_id, unidades, ingreso in filas:
        producto = productos_map.get(producto_id)
        if producto is None or unidades is None:
            continue

        unidades = int(unidades)
        ingreso = float(ingreso or 0)
        costo = float(producto.precio_compra) * unidades
        margen = ingreso - costo

        total_ingreso += ingreso
        total_costo += costo

        cat_nombre = producto.categoria.nombre if producto.categoria else "Sin categoría"
        marca_nombre = producto.marca.nombre if producto.marca else "Sin marca"

        cat = por_categoria.setdefault(cat_nombre, {"categoria": cat_nombre, "unidades": 0, "ingreso": 0.0, "margen": 0.0})
        cat["unidades"] += unidades
        cat["ingreso"] += ingreso
        cat["margen"] += margen

        marca = por_marca.setdefault(marca_nombre, {"marca": marca_nombre, "unidades": 0, "ingreso": 0.0, "margen": 0.0})
        marca["unidades"] += unidades
        marca["ingreso"] += ingreso
        marca["margen"] += margen

        # Ganancia por m² vendido (solo tiene sentido si el producto tiene rendimiento_m2
        # configurado). Este campo es opcional y puede no existir aún en el modelo/BD,
        # por eso se usa getattr en vez de acceso directo.
        rendimiento_m2 = getattr(producto, "rendimiento_m2", None)
        ganancia_por_m2 = None
        if rendimiento_m2 and float(rendimiento_m2) > 0:
            margen_unitario = (float(producto.precio_venta) - float(producto.precio_compra))
            ganancia_por_m2 = round(margen_unitario / float(rendimiento_m2), 2)

        # Rotación aproximada: qué % de lo que "pasó" por el producto (vendido + lo que
        # queda en stock) ya se vendió. Un producto con 90% ya rotó casi todo su lote;
        # uno con 10% se está quedando estancado en el almacén.
        base_rotacion = unidades + producto.stock
        rotacion_pct = round((unidades / base_rotacion) * 100, 1) if base_rotacion > 0 else 0

        ranking_productos.append({
            "producto_id": producto.id,
            "nombre": producto.nombre,
            "categoria": cat_nombre,
            "marca": marca_nombre,
            "unidades_vendidas": unidades,
            "ingreso": round(ingreso, 2),
            "margen": round(margen, 2),
            "margen_pct": round((margen / ingreso) * 100, 1) if ingreso > 0 else 0,
            "ganancia_por_m2": ganancia_por_m2,
            "rotacion_pct": rotacion_pct,
            "stock_actual": producto.stock,
        })

    for d in por_categoria.values():
        d["unidades"] = int(d["unidades"])
        d["ingreso"] = round(d["ingreso"], 2)
        d["margen"] = round(d["margen"], 2)
        d["margen_pct"] = round((d["margen"] / d["ingreso"]) * 100, 1) if d["ingreso"] > 0 else 0

    for d in por_marca.values():
        d["unidades"] = int(d["unidades"])
        d["ingreso"] = round(d["ingreso"], 2)
        d["margen"] = round(d["margen"], 2)
        d["margen_pct"] = round((d["margen"] / d["ingreso"]) * 100, 1) if d["ingreso"] > 0 else 0

    ranking_por_margen = sorted(ranking_productos, key=lambda r: r["margen"], reverse=True)
    ranking_por_m2 = sorted(
        [r for r in ranking_productos if r["ganancia_por_m2"] is not None],
        key=lambda r: r["ganancia_por_m2"],
        reverse=True,
    )
    ranking_por_rotacion = sorted(ranking_productos, key=lambda r: r["rotacion_pct"])  # los que menos rotan primero

    return {
        "resumen": {
            "ingreso_total": round(total_ingreso, 2),
            "costo_total": round(total_costo, 2),
            "margen_total": round(total_ingreso - total_costo, 2),
            "margen_pct": round(((total_ingreso - total_costo) / total_ingreso) * 100, 1) if total_ingreso > 0 else 0,
        },
        "por_categoria": sorted(por_categoria.values(), key=lambda d: d["margen"], reverse=True),
        "por_marca": sorted(por_marca.values(), key=lambda d: d["margen"], reverse=True),
        "top_margen": ranking_por_margen[:5],
        "top_ganancia_m2": ranking_por_m2[:5],
        "menor_rotacion": ranking_por_rotacion[:5],
    }