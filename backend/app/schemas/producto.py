from typing import Optional
from decimal import Decimal
from pydantic import BaseModel

from app.schemas.catalogo import MarcaOut


class ProductoBase(BaseModel):
    codigo: str
    nombre: str
    categoria_id: Optional[int] = None
    marca_id: Optional[int] = None
    precio_compra: Decimal
    precio_venta: Decimal
    stock_minimo: int = 0
    unidad: str = "unidad"


class ProductoCreate(ProductoBase):
    stock: int = 0


class ProductoUpdate(BaseModel):
    codigo: Optional[str] = None
    nombre: Optional[str] = None
    categoria_id: Optional[int] = None
    marca_id: Optional[int] = None
    precio_compra: Optional[Decimal] = None
    precio_venta: Optional[Decimal] = None
    stock_minimo: Optional[int] = None
    unidad: Optional[str] = None


class ProductoOut(ProductoBase):
    id: int
    stock: int
    imagen_url: Optional[str] = None
    marca: Optional[MarcaOut] = None
    origen: str

    class Config:
        from_attributes = True