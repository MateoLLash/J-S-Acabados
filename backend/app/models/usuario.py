from sqlalchemy import Column, Integer, String, Enum, DateTime, TIMESTAMP, func

from app.database import Base


class Usuario(Base):
    __tablename__ = "usuarios"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(120), nullable=False)
    email = Column(String(150), nullable=False, unique=True, index=True)
    password_hash = Column(String(255), nullable=False)
    rol = Column(Enum("admin", "vendedor", "almacen", name="rol_enum"), default="vendedor")
    estado = Column(Enum("activo", "inactivo", name="estado_enum"), default="activo")
    ultimo_login = Column(DateTime, nullable=True)
    creado_en = Column(TIMESTAMP, server_default=func.now())