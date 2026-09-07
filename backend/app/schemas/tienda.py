from datetime import datetime
from decimal import Decimal
from typing import List, Literal, Optional
from pydantic import BaseModel

from app.schemas.catalogo import CategoriaOut, MarcaOut


class ProductoTiendaOut(BaseModel):
    id: int
    codigo: str
    nombre: str
    marca: Optional[MarcaOut] = None
    precio_venta: Decimal
    stock: int
    unidad: str
    imagen_url: Optional[str] = None
    categoria: Optional[CategoriaOut] = None

    class Config:
        from_attributes = True


class ClienteTienda(BaseModel):
    nombre: str
    telefono: str
    email: str
    direccion: str
    # DNI (boleta, 8 dígitos) o RUC (factura, 11 dígitos). Opcional en boleta.
    documento: Optional[str] = None


class ItemPedido(BaseModel):
    producto_id: int
    cantidad: int


class PedidoCreate(BaseModel):
    cliente: ClienteTienda
    metodo_pago: Optional[str] = None
    tipo_comprobante: Literal["boleta", "factura"] = "boleta"
    items: List[ItemPedido]


# --- Datos de salida: lo que necesita el frontend para poder imprimir/  ---
# --- descargar la boleta o factura del pedido recién creado.            ---
class ClientePedidoOut(BaseModel):
    nombre: str
    telefono: Optional[str] = None
    email: Optional[str] = None
    direccion: Optional[str] = None
    documento: Optional[str] = None

    class Config:
        from_attributes = True


class ItemPedidoOut(BaseModel):
    producto_id: int
    codigo: str
    nombre: str
    cantidad: int
    precio_unitario: Decimal

    class Config:
        from_attributes = True


class PedidoOut(BaseModel):
    id: int
    total: Decimal
    fecha: datetime
    tipo_comprobante: str
    tipo_documento_id: str
    serie: Optional[str] = None
    numero: Optional[int] = None
    cliente: Optional[ClientePedidoOut] = None
    items: List[ItemPedidoOut] = []

    class Config:
        from_attributes = True
