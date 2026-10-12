import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth.dependencies import get_current_user
from app.models.catalogo import Categoria, Proveedor
from app.models.producto import Producto
from app.integrations.auditoria_integracion import registrar_evento, medir
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


def _auditar_sync(operacion, endpoint, correlacion_id, usuario_id, duracion_ms,
                  recibidos=None, procesados=None, omitidos=None, error=None, fecha_inicio=None):
    """Una fila resumen por sincronización: tiempo total de punta a punta y conteo de registros."""
    registrar_evento(
        fecha=fecha_inicio, fecha_fin=datetime.now(timezone.utc),
        correlacion_id=correlacion_id,
        direccion="interna",
        alcance_duracion="sincronizacion_completa",
        sistema="lina",
        operacion=operacion,
        metodo="POST",
        endpoint=endpoint,
        status_code=200 if error is None else 500,
        resultado="exito" if error is None else "error",
        duracion_ms=duracion_ms,
        registros_recibidos=recibidos,
        registros_procesados=procesados,
        registros_omitidos=omitidos,
        usuario_id=usuario_id,
        error_tipo=type(error).__name__ if error else None,
        error_mensaje="Error en sincronización; revisar el tipo y la traza de las llamadas asociadas." if error else None,
    )


@router.post("/lina/proveedores")
def sincronizar_proveedores_lina(
    db: Session = Depends(get_db),
    usuario_actual=Depends(get_current_user),
):
    correlacion_id = str(uuid.uuid4())
    recibidos, ids_guardados = [], []
    with medir() as ms:
        try:
            data = consultar_proveedores_lina(correlacion_id, usuario_actual.id)
            recibidos = data.get("proveedores", [])

            for p in recibidos:
                existente = db.query(Proveedor).filter(Proveedor.nombre == p["razonSocial"]).first()
                if existente:
                    continue

                nuevo = Proveedor(
                    nombre=p["razonSocial"],
                    contacto=p.get("nombreContacto"),
                    telefono=p.get("telefono"),
                    origen="lina",
                )
                db.add(nuevo)
                ids_guardados.append(p["id"])

            db.commit()

            confirmacion = (
                confirmar_recepcion_lina([], ids_guardados, correlacion_id, usuario_actual.id)
                if ids_guardados else {"confirmado": 0}
            )
        except Exception as exc:
            db.rollback()
            _auditar_sync("sync.proveedores", "/api/v1/sync/lina/proveedores", correlacion_id,
                          usuario_actual.id, ms(), len(recibidos), len(ids_guardados),
                          len(recibidos) - len(ids_guardados), error=exc, fecha_inicio=ms.fecha)
            raise

        _auditar_sync("sync.proveedores", "/api/v1/sync/lina/proveedores", correlacion_id,
                      usuario_actual.id, ms(), len(recibidos), len(ids_guardados),
                      len(recibidos) - len(ids_guardados), fecha_inicio=ms.fecha)

    return {"proveedores_guardados": len(ids_guardados), "confirmacion_lina": confirmacion}


@router.post("/lina/productos")
def sincronizar_productos_lina(
    db: Session = Depends(get_db),
    usuario_actual=Depends(get_current_user),
):
    correlacion_id = str(uuid.uuid4())
    recibidos, ids_guardados = [], []
    with medir() as ms:
        try:
            data = consultar_productos_lina(correlacion_id, usuario_actual.id)
            recibidos = data.get("productos", [])

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
                    origen="lina",
                )
                db.add(nuevo)
                ids_guardados.append(p["id"])

            db.commit()

            confirmacion = (
                confirmar_recepcion_lina(ids_guardados, [], correlacion_id, usuario_actual.id)
                if ids_guardados else {"confirmado": 0}
            )
        except Exception as exc:
            db.rollback()
            _auditar_sync("sync.productos", "/api/v1/sync/lina/productos", correlacion_id,
                          usuario_actual.id, ms(), len(recibidos), len(ids_guardados),
                          len(recibidos) - len(ids_guardados), error=exc, fecha_inicio=ms.fecha)
            raise

        _auditar_sync("sync.productos", "/api/v1/sync/lina/productos", correlacion_id,
                      usuario_actual.id, ms(), len(recibidos), len(ids_guardados),
                      len(recibidos) - len(ids_guardados), fecha_inicio=ms.fecha)

    return {"productos_guardados": len(ids_guardados), "confirmacion_lina": confirmacion}