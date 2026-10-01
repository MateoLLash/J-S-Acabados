from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth.dependencies import get_current_user
from app.models.catalogo import Categoria, Proveedor
from app.models.producto import Producto
from app.integrations.lina_client import (
    consultar_productos_lina,
    consultar_proveedores_lina,
    confirmar_recepcion_lina,
)

router = APIRouter(prefix="/api/v1/sync", tags=["sincronizacion"])


def obtener_o_crear_categoria(db: Session, nombre_categoria: str) -> Categoria:
    categoria = db.query(Categoria).filter(Categoria.nombre == nombre_categoria).first()
    if categoria is None:
        categoria = Categoria(nombre=nombre_categoria)
        db.add(categoria)
        db.flush()
    return categoria


@router.post("/lina/proveedores")
def sincronizar_proveedores_lina(
    db: Session = Depends(get_db),
    usuario_actual=Depends(get_current_user),
):
    data = consultar_proveedores_lina()
    recibidos = data.get("proveedores", [])

    ids_guardados = []
    for p in recibidos:
        existente = db.query(Proveedor).filter(Proveedor.nombre == p["razonSocial"]).first()
        if existente:
            continue

        nuevo = Proveedor(
            nombre=p["razonSocial"],
            contacto=p.get("nombreContacto"),
            telefono=p.get("telefono"),
            origen="equipo_kanari",
        )
        db.add(nuevo)
        ids_guardados.append(p["id"])

    db.commit()

    confirmacion = confirmar_recepcion_lina(producto_ids=[], proveedor_ids=ids_guardados) if ids_guardados else {"confirmado": 0}
    return {"proveedores_guardados": len(ids_guardados), "confirmacion_lina": confirmacion}


@router.post("/lina/productos")
def sincronizar_productos_lina(
    db: Session = Depends(get_db),
    usuario_actual=Depends(get_current_user),
):
    data = consultar_productos_lina()
    recibidos = data.get("productos", [])

    ids_guardados = []
    for p in recibidos:
        existente = db.query(Producto).filter(Producto.codigo == p["codigo"]).first()
        if existente:
            continue

        categoria = obtener_o_crear_categoria(db, p["categoria"])

        nuevo = Producto(
            codigo=p["codigo"],
            nombre=p["nombre"],
            categoria_id=categoria.id,
            precio_compra=0,  # Lina no manda precio de compra, solo venta
            precio_venta=p["precioVenta"],
            stock=p["stock"],
            stock_minimo=0,
            unidad="unidad",
            origen="equipo_kanari",
        )
        db.add(nuevo)
        ids_guardados.append(p["id"])

    db.commit()

    confirmacion = confirmar_recepcion_lina(producto_ids=ids_guardados, proveedor_ids=[]) if ids_guardados else {"confirmado": 0}
    return {"productos_guardados": len(ids_guardados), "confirmacion_lina": confirmacion}