from sqlalchemy import Column, Integer, String, Enum, ForeignKey, TIMESTAMP, func
from sqlalchemy.orm import relationship

from app.database import Base


class MovimientoInventario(Base):
    __tablename__ = "movimientos_inventario"

    id = Column(Integer, primary_key=True, index=True)
    producto_id = Column(Integer, ForeignKey("productos.id", ondelete="CASCADE"), nullable=False)
    # Origen del movimiento (kardex): a lo sumo uno de los tres está seteado.
    venta_id = Column(Integer, ForeignKey("ventas.id", ondelete="SET NULL"), nullable=True)
    compra_id = Column(Integer, ForeignKey("compras.id", ondelete="SET NULL"), nullable=True)
    guia_id = Column(Integer, nullable=True)  # FK a guias_remision, se agrega cuando exista ese módulo
    tipo = Column(Enum("entrada", "salida", "ajuste", name="tipo_movimiento_enum"), nullable=False)
    cantidad = Column(Integer, nullable=False)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    detalle = Column(String(255), nullable=True)
    fecha = Column(TIMESTAMP, server_default=func.now())

    producto = relationship("Producto")
    usuario = relationship("Usuario")
    venta = relationship("Venta")
    compra = relationship("Compra")