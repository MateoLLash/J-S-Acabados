from typing import Optional
from pydantic import BaseModel


class CategoriaBase(BaseModel):
    nombre: str


class CategoriaCreate(CategoriaBase):
    pass


class CategoriaOut(CategoriaBase):
    id: int

    class Config:
        from_attributes = True


class ProveedorBase(BaseModel):
    nombre: str
    contacto: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None


class ProveedorCreate(ProveedorBase):
    pass


class ProveedorOut(ProveedorBase):
    id: int
    origen: str

    class Config:
        from_attributes = True


class MarcaBase(BaseModel):
    nombre: str


class MarcaCreate(MarcaBase):
    pass


class MarcaOut(MarcaBase):
    id: int

    class Config:
        from_attributes = True


class ClienteBase(BaseModel):
    nombre: str
    telefono: Optional[str] = None
    documento: Optional[str] = None
    email: Optional[str] = None
    direccion: Optional[str] = None


class ClienteCreate(ClienteBase):
    pass


class ClienteOut(ClienteBase):
    id: int
    origen: str

    class Config:
        from_attributes = True


class MetodoPagoOut(BaseModel):
    id: int
    nombre: str

    class Config:
        from_attributes = True

class ClienteWebhookIn(BaseModel):
    '''Lo que el otro sistema te manda cuando ELLOS crean un cliente.'''
    nombre: str
    documento: str | None = None
    telefono: str | None = None
    email: str | None = None
    origen: str | None = None     