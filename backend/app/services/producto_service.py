from sqlalchemy.orm import Session
from sqlalchemy import text
from fastapi import HTTPException
from app.models.producto import Producto
from app.schemas.producto import ProductoUpdate

def actualizar_producto(db: Session, producto_id: int, data: ProductoUpdate, usuario_id: int) -> Producto:
    try:
        # 1. Configuramos el ID del usuario actual para PostgreSQL
        db.execute(text("SELECT set_config('app.current_user_id', :user_id, true)"), {"user_id": str(usuario_id)})
        
        # 2. Buscamos el producto en la BD
        producto = db.query(Producto).filter(Producto.id == producto_id).first()
        if not producto:
            raise HTTPException(status_code=404, detail="Producto no encontrado")
            
        # 3. Extraemos SOLO los campos que el frontend envió (ignora los None no intencionales)
        # Nota: Si usas Pydantic v2 usa model_dump(exclude_unset=True)
        update_data = data.dict(exclude_unset=True) 
        
        # 4. Actualizamos los atributos dinámicamente
        for key, value in update_data.items():
            setattr(producto, key, value)
            
        # 5. Confirmar transacción (Aquí el Trigger SQL captura el JSON con los cambios)
        db.commit()
        db.refresh(producto)
        
        return producto
        
    finally:
        # 6. Limpiamos la configuración de la sesión (Vital para el pool de SQLAlchemy)
        db.execute(text("SELECT set_config('app.current_user_id', '', true)"))