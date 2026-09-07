from datetime import datetime
from decimal import Decimal
from typing import List
from pydantic import BaseModel, Field


class CompraDetalleCreate(BaseModel):
    producto_id: int
    cantidad: int = Field(gt=0)
    precio_unitario: Decimal = Field(ge=0)


class CompraDetalleOut(CompraDetalleCreate):
    id: int

    class Config:
        from_attributes = True


class CompraCreate(BaseModel):
    proveedor_id: int
    items: List[CompraDetalleCreate] = Field(min_length=1)


class CompraOut(BaseModel):
    id: int
    proveedor_id: int
    usuario_id: int
    total: Decimal
    estado: str
    fecha: datetime
    items: List[CompraDetalleOut] = []

    class Config:
        from_attributes = True