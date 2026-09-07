from datetime import datetime
from typing import Optional, Literal
from pydantic import BaseModel, EmailStr

RolUsuario = Literal["admin", "vendedor", "almacen"]


class UsuarioBase(BaseModel):
    nombre: str
    email: EmailStr
    rol: RolUsuario = "vendedor"


class UsuarioCreate(UsuarioBase):
    password: str


class UsuarioOut(UsuarioBase):
    id: int
    estado: str
    ultimo_login: Optional[datetime] = None

    class Config:
        from_attributes = True


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    usuario: UsuarioOut