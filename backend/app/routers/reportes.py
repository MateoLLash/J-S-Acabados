from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth.dependencies import get_current_user
from app.models.venta import Venta, VentaDetalle
from app.models.compra import Compra
from app.models.producto import Producto
from app.models.usuario import Usuario
from app.models.catalogo import Proveedor

router = APIRouter(prefix="/reportes", tags=["Reportes"])

# Cuántos días hacia atrás mirar según el periodo elegido en el filtro del frontend.
DIAS_POR_PERIODO = {
    "semanal": 7,
    "mensual": 30,
    "anual": 365,
}

# Cómo agrupar la tendencia según el periodo (formato de PostgreSQL TO_CHAR).
FORMATO_TENDENCIA_POR_PERIODO = {
    "semanal": "DD/MM",       # un punto por día
    "mensual": 'IYYY-"S"IW',  # un punto por semana ISO (ej: 2026-S29)
    "anual": "YYYY-MM",       # un punto por mes
}


def _pct_cambio(actual: float, anterior: float):
    """% de cambio de 'anterior' a 'actual'. None si no hay base para comparar."""
    if anterior == 0:
        return None
    return round(((actual - anterior) / anterior) * 100, 1)


@router.get("/")
def obtener_reportes(
    periodo: str = Query("semanal"),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    periodo = periodo.lower()
    dias = DIAS_POR_PERIODO.get(periodo, 7)
    formato_fecha = FORMATO_TENDENCIA_POR_PERIODO.get(periodo, "DD/MM")
    ahora = datetime.utcnow()
    desde = ahora - timedelta(days=dias)
    # Periodo anterior de igual duración, para la comparativa de crecimiento.
    desde_anterior = desde - timedelta(days=dias)

    # --- Ingresos y egresos reales del periodo ---
    ingresos = db.query(func.coalesce(func.sum(Venta.total), 0)).filter(Venta.fecha >= desde).scalar()
    egresos = db.query(func.coalesce(func.sum(Compra.total), 0)).filter(Compra.fecha >= desde).scalar()

    # --- Ingresos y egresos del periodo anterior (para % de crecimiento) ---
    ingresos_anterior = (
        db.query(func.coalesce(func.sum(Venta.total), 0))
        .filter(Venta.fecha >= desde_anterior, Venta.fecha < desde)
        .scalar()
    )
    egresos_anterior = (
        db.query(func.coalesce(func.sum(Compra.total), 0))
        .filter(Compra.fecha >= desde_anterior, Compra.fecha < desde)
        .scalar()
    )

    # --- Top 5 productos más vendidos del periodo ---
    filas_top = (
        db.query(Producto.nombre, func.coalesce(func.sum(VentaDetalle.cantidad), 0).label("cantidad"))
        .join(VentaDetalle, VentaDetalle.producto_id == Producto.id)
        .join(Venta, Venta.id == VentaDetalle.venta_id)
        .filter(Venta.fecha >= desde)
        .group_by(Producto.id, Producto.nombre)
        .order_by(func.sum(VentaDetalle.cantidad).desc())
        .limit(5)
        .all()
    )
    productos_mas_vendidos = [{"name": nombre, "cantidad": int(cantidad)} for nombre, cantidad in filas_top]

    # --- Tendencia de ventas agrupada según el periodo ---
    # Reemplazado func.date_format (MySQL) por func.to_char (PostgreSQL)
    etiqueta = func.to_char(Venta.fecha, formato_fecha).label("etiqueta")
    filas_tendencia = (
        db.query(etiqueta, func.coalesce(func.sum(Venta.total), 0).label("monto"))
        .filter(Venta.fecha >= desde)
        .group_by(etiqueta)
        .order_by(func.min(Venta.fecha))
        .all()
    )
    tendencia = [{"name": nombre_punto, "monto": float(monto)} for nombre_punto, monto in filas_tendencia]

    # --- Ranking de vendedores (quién vende más) ---
    filas_vendedores = (
        db.query(
            Usuario.nombre,
            func.coalesce(func.sum(Venta.total), 0).label("total_vendido"),
            func.count(Venta.id).label("cantidad_ventas"),
        )
        .join(Venta, Venta.usuario_id == Usuario.id)
        .filter(Venta.fecha >= desde)
        .group_by(Usuario.id, Usuario.nombre)
        .order_by(func.sum(Venta.total).desc())
        .limit(5)
        .all()
    )
    ranking_vendedores = [
        {"nombre": nombre, "totalVendido": float(total), "cantidadVentas": int(cantidad)}
        for nombre, total, cantidad in filas_vendedores
    ]

    # --- Compras por proveedor ---
    filas_proveedores = (
        db.query(
            Proveedor.nombre,
            func.coalesce(func.sum(Compra.total), 0).label("total_comprado"),
            func.count(Compra.id).label("cantidad_compras"),
        )
        .join(Compra, Compra.proveedor_id == Proveedor.id)
        .filter(Compra.fecha >= desde)
        .group_by(Proveedor.id, Proveedor.nombre)
        .order_by(func.sum(Compra.total).desc())
        .limit(5)
        .all()
    )
    compras_por_proveedor = [
        {"nombre": nombre, "totalComprado": float(total), "cantidadCompras": int(cantidad)}
        for nombre, total, cantidad in filas_proveedores
    ]

    return {
        "ingresos": float(ingresos or 0),
        "egresos": float(egresos or 0),
        "productosMasVendidos": productos_mas_vendidos,
        "tendenciaSemanal": tendencia,
        "comparativa": {
            "ingresosAnterior": float(ingresos_anterior or 0),
            "egresosAnterior": float(egresos_anterior or 0),
            "pctIngresos": _pct_cambio(float(ingresos or 0), float(ingresos_anterior or 0)),
            "pctEgresos": _pct_cambio(float(egresos or 0), float(egresos_anterior or 0)),
        },
        "rankingVendedores": ranking_vendedores,
        "comprasPorProveedor": compras_por_proveedor,
    }