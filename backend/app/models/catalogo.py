from sqlalchemy import Column, Integer, String, TIMESTAMP, func

from app.database import Base


class Categoria(Base):
    __tablename__ = "categorias"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(80), nullable=False, unique=True)


class Proveedor(Base):
    __tablename__ = "proveedores"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(120), nullable=False)
    contacto = Column(String(120), nullable=True)
    telefono = Column(String(20), nullable=True)
    email = Column(String(120), nullable=True)
    creado_en = Column(TIMESTAMP, server_default=func.now())


class Marca(Base):
    __tablename__ = "marcas"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(80), nullable=False)


class Cliente(Base):
    __tablename__ = "clientes"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(150), nullable=False)
    telefono = Column(String(20), nullable=True)
    documento = Column(String(20), nullable=True)
    email = Column(String(120), nullable=True)
    direccion = Column(String(255), nullable=True)
    creado_en = Column(TIMESTAMP, server_default=func.now())
    origen = Column(String(50), nullable=False, server_default="acabados_js")


class MetodoPago(Base):
    __tablename__ = "metodos_pago"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(40), nullable=False)