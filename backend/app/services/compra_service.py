from sqlalchemy.orm import Session
from sqlalchemy import text
from fastapi import HTTPException, status

from app.models.compra import Compra, CompraDetalle
from app.models.producto import Producto
from app.models.inventario import MovimientoInventario
from app.schemas.compra import CompraCreate
from app.services.stock_service import validar_movimiento


def crear_compra(db: Session, data: CompraCreate, usuario_id: int) -> Compra:
    total = sum(item.cantidad * item.precio_unitario for item in data.items)

    compra = Compra(
        proveedor_id=data.proveedor_id,
        usuario_id=usuario_id,
        total=total,
        estado="pendiente",
    )
    db.add(compra)
    db.flush()  # para obtener compra.id antes del commit

    for item in data.items:
        db.add(CompraDetalle(
            compra_id=compra.id,
            producto_id=item.producto_id,
            cantidad=item.cantidad,
            precio_unitario=item.precio_unitario,
        ))

    db.commit()
    db.refresh(compra)
    return compra


def recibir_compra(db: Session, compra_id: int, usuario_id: int) -> Compra:
    # Configurar el ID del usuario actual para PostgreSQL (compatible con set_config)
    db.execute(text("SELECT set_config('app.current_user_id', :user_id, true)"), {"user_id": str(usuario_id)})

    try:
        compra = db.query(Compra).filter(Compra.id == compra_id).first()
        if compra is None:
            raise HTTPException(status_code=404, detail="Compra no encontrada")
        if compra.estado == "recibido":
            raise HTTPException(status_code=400, detail="Esta compra ya fue recibida")
        if compra.estado == "cancelado":
            raise HTTPException(status_code=400, detail="No se puede recibir una compra cancelada")

        for item in compra.items:
            producto = db.query(Producto).filter(Producto.id == item.producto_id).first()
            validar_movimiento(producto, "entrada", item.cantidad)
            db.add(MovimientoInventario(
                producto_id=producto.id,
                compra_id=compra.id,
                tipo="entrada",
                cantidad=item.cantidad,
                usuario_id=usuario_id,
                detalle=f"Compra #{compra.id} recibida",
            ))

        # Este es el UPDATE que disparará la auditoría
        compra.estado = "recibido"
        
        db.commit()
        db.refresh(compra)
        return compra
    finally:
        db.execute(text("SELECT set_config('app.current_user_id', '', true)"))