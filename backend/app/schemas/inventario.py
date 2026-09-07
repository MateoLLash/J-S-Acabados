from datetime import datetime
from typing import Optional, Literal
from pydantic import BaseModel


class MovimientoCreate(BaseModel):
    producto_id: int
    tipo: Literal["entrada", "salida", "ajuste"]
    cantidad: int
    detalle: Optional[str] = None


class MovimientoOut(BaseModel):
    id: int
    producto_id: int
    venta_id: Optional[int] = None
    compra_id: Optional[int] = None
    guia_id: Optional[int] = None
    tipo: str
    cantidad: int
    usuario_id: int
    detalle: Optional[str] = None
    fecha: datetime
    
    # --- NUEVOS CAMPOS PARA TRAZABILIDAD FRONTEND ---
    usuario_nombre: Optional[str] = None
    producto_nombre: Optional[str] = None

    class Config:
        from_attributes = True