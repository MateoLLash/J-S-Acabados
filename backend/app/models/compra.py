from sqlalchemy import Column, Integer, String, DECIMAL, Enum, ForeignKey, TIMESTAMP, func
from sqlalchemy.orm import relationship

from app.database import Base


class Compra(Base):
    __tablename__ = "compras"

    id = Column(Integer, primary_key=True, index=True)
    proveedor_id = Column(Integer, ForeignKey("proveedores.id"), nullable=False)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    total = Column(DECIMAL(10, 2), nullable=False, default=0)
    estado = Column(Enum("pendiente", "recibido", "cancelado", name="estado_compra_enum"), default="pendiente")
    tipo_documento_id = Column(String(2), nullable=True)
    serie = Column(String(4), nullable=True)
    numero = Column(Integer, nullable=True)
    fecha = Column(TIMESTAMP, server_default=func.now())

    proveedor = relationship("Proveedor")
    usuario = relationship("Usuario")
    items = relationship("CompraDetalle", backref="compra", cascade="all, delete-orphan")


class CompraDetalle(Base):
    __tablename__ = "compra_detalle"

    id = Column(Integer, primary_key=True, index=True)
    compra_id = Column(Integer, ForeignKey("compras.id", ondelete="CASCADE"), nullable=False)
    producto_id = Column(Integer, ForeignKey("productos.id"), nullable=False)
    cantidad = Column(Integer, nullable=False)
    precio_unitario = Column(DECIMAL(10, 2), nullable=False)

    producto = relationship("Producto")