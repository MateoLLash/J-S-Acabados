from datetime import datetime
from decimal import Decimal
from typing import List, Optional, Literal
from pydantic import BaseModel, Field

from app.schemas.catalogo import ClienteOut, MetodoPagoOut

TIPO_COMPROBANTE_A_DOCUMENTO = {
    "boleta": "03",
    "factura": "01",
}


class VentaDetalleCreate(BaseModel):
    producto_id: int
    cantidad: int = Field(gt=0)
    precio_unitario: Decimal = Field(ge=0)


class VentaDetalleOut(VentaDetalleCreate):
    id: int

    class Config:
        from_attributes = True


class VentaCreate(BaseModel):
    cliente_id: int
    tipo_comprobante: Literal["boleta", "factura"] = "boleta"
    metodo_pago_id: Optional[int] = None
    items: List[VentaDetalleCreate] = Field(min_length=1)


class VentaOut(BaseModel):
    id: int
    cliente_id: Optional[int] = None
    cliente: Optional[ClienteOut] = None
    tipo_comprobante: str
    tipo_documento_id: str
    serie: Optional[str] = None
    numero: Optional[int] = None
    documento_referencia_id: Optional[int] = None  # <-- AGREGADO PARA LAS NOTAS DE CRÉDITO
    estado_sunat: str
    usuario_id: int
    total: Decimal
    metodo_pago_id: Optional[int] = None
    metodo_pago: Optional[MetodoPagoOut] = None
    fecha: datetime
    items: List[VentaDetalleOut] = []

    class Config:
        from_attributes = True