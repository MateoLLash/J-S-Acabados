from sqlalchemy.orm import Session
from sqlalchemy import text # <-- IMPORTANTE: importar text
from fastapi import HTTPException

from app.models.venta import Venta, VentaDetalle
from app.models.producto import Producto
from app.models.catalogo import Cliente
from app.models.inventario import MovimientoInventario
from app.schemas.venta import VentaCreate, TIPO_COMPROBANTE_A_DOCUMENTO
from app.services.stock_service import validar_movimiento

def crear_venta(db: Session, data: VentaCreate, usuario_id: int) -> Venta:
    try:
        # ---> AQUÍ AVISAS A POSTGRESQL QUIÉN HARÁ LA TRANSACCIÓN <---
        db.execute(text("SELECT set_config('app.current_user_id', :user_id, true)"), {"user_id": str(usuario_id)})

        cliente = db.query(Cliente).filter(Cliente.id == data.cliente_id).first()
        if cliente is None:
            raise HTTPException(status_code=404, detail="Cliente no encontrado")

        total = sum(item.cantidad * item.precio_unitario for item in data.items)

        venta = Venta(
            cliente_id=data.cliente_id,
            tipo_comprobante=data.tipo_comprobante,
            tipo_documento_id=TIPO_COMPROBANTE_A_DOCUMENTO[data.tipo_comprobante],
            usuario_id=usuario_id,
            total=total,
            metodo_pago_id=data.metodo_pago_id,
        )
        db.add(venta)
        db.flush()

        for item in data.items:
            producto = db.query(Producto).filter(Producto.id == item.producto_id).first()
            if producto is None:
                raise HTTPException(status_code=404, detail=f"Producto {item.producto_id} no existe")

            validar_movimiento(producto, "salida", item.cantidad)

            db.add(VentaDetalle(
                venta_id=venta.id,
                producto_id=item.producto_id,
                cantidad=item.cantidad,
                precio_unitario=item.precio_unitario,
            ))
            db.add(MovimientoInventario(
                producto_id=producto.id,
                venta_id=venta.id,
                tipo="salida",
                cantidad=item.cantidad,
                usuario_id=usuario_id,
                detalle=f"Venta #{venta.id}",
            ))

        db.commit()
        db.refresh(venta)
        return venta
        
    finally:
        # ---> LIMPIEZA OBLIGATORIA DE LA CONEXIÓN <---
        db.execute(text("SELECT set_config('app.current_user_id', '', true)"))