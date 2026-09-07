from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text  # <-- IMPORTANTE: Agregar la importación

from app.database import get_db
from app.models.producto import Producto
from app.models.inventario import MovimientoInventario
from app.models.usuario import Usuario  # <-- IMPORTANTE: Agregado para extraer el nombre
from app.schemas.inventario import MovimientoCreate, MovimientoOut
from app.auth.dependencies import get_current_user
from app.services.stock_service import validar_movimiento

router = APIRouter(prefix="/inventario", tags=["inventario"])


@router.get("/movimientos", response_model=List[MovimientoOut])
def listar_movimientos(db: Session = Depends(get_db), _=Depends(get_current_user)):
    # 1. Hacemos el JOIN para traer los nombres legibles
    resultados = db.query(
        MovimientoInventario,
        Usuario.nombre.label("usuario_nombre"),
        Producto.nombre.label("producto_nombre")
    ).outerjoin(
        Usuario, MovimientoInventario.usuario_id == Usuario.id
    ).outerjoin(
        Producto, MovimientoInventario.producto_id == Producto.id
    ).order_by(
        MovimientoInventario.fecha.desc()
    ).all()

    # 2. Empaquetamos la respuesta para enviarla a React
    movimientos_formateados = []
    for movimiento, usuario_nombre, producto_nombre in resultados:
        item = movimiento.__dict__.copy()
        item["usuario_nombre"] = usuario_nombre if usuario_nombre else "Sistema"
        item["producto_nombre"] = producto_nombre if producto_nombre else "Desconocido"
        movimientos_formateados.append(item)

    return movimientos_formateados


@router.post("/movimientos", response_model=MovimientoOut, status_code=201)
def registrar_movimiento(
    data: MovimientoCreate, db: Session = Depends(get_db), user=Depends(get_current_user)
):
    producto = db.query(Producto).filter(Producto.id == data.producto_id).first()
    if producto is None:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    validar_movimiento(producto, data.tipo, data.cantidad)

    movimiento = MovimientoInventario(
        producto_id=producto.id,
        tipo=data.tipo,
        cantidad=data.cantidad,
        usuario_id=user.id,
        detalle=data.detalle,
    )
    db.add(movimiento)
    
    # ---> AQUÍ AVISAMOS A POSTGRESQL QUIÉN INSERTA EL MOVIMIENTO <---
    try:
        db.execute(text("SELECT set_config('app.current_user_id', :user_id, true)"), {"user_id": str(user.id)})
        db.commit()
        db.refresh(movimiento)
    finally:
        db.execute(text("SELECT set_config('app.current_user_id', '', true)"))
    
    # Preparamos la respuesta inyectando los nombres para que el frontend 
    # tenga la información completa inmediatamente después de guardar
    respuesta = movimiento.__dict__.copy()
    respuesta["usuario_nombre"] = user.nombre
    respuesta["producto_nombre"] = producto.nombre
    
    return respuesta