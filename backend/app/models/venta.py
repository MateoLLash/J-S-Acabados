from sqlalchemy import Column, Integer, String, DECIMAL, Enum, ForeignKey, TIMESTAMP, func
from sqlalchemy.orm import relationship

from app.database import Base


class Venta(Base):
    __tablename__ = "ventas"

    id = Column(Integer, primary_key=True, index=True)
    cliente_id = Column(Integer, ForeignKey("clientes.id"), nullable=True)
    tipo_comprobante = Column(Enum("boleta", "factura", name="tipo_comprobante_enum"), default="boleta")
    # Catálogo SUNAT (migración 2): '03' boleta, '01' factura. Por ahora solo
    # se usan estos dos; el resto de tipos (notas, guías) se agregan después.
    tipo_documento_id = Column(String(2), nullable=False, default="03")
    serie = Column(String(4), nullable=True)
    numero = Column(Integer, nullable=True)
    documento_referencia_id = Column(Integer, nullable=True)
    motivo_nota_id = Column(String(2), nullable=True)
    estado_sunat = Column(
        Enum("pendiente", "enviado", "aceptado", "rechazado", "anulado", name="estado_sunat_enum"),
        default="pendiente",
    )
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    total = Column(DECIMAL(10, 2), nullable=False, default=0)
    metodo_pago_id = Column(Integer, ForeignKey("metodos_pago.id"), nullable=True)
    fecha = Column(TIMESTAMP(timezone=True), server_default=func.now())
    hash_cpe = Column(String(100), nullable=True)
    xml_path = Column(String(255), nullable=True)
    cdr_path = Column(String(255), nullable=True)
    observaciones_sunat = Column(String(255), nullable=True)

    usuario = relationship("Usuario")
    cliente = relationship("Cliente")
    metodo_pago = relationship("MetodoPago")
    items = relationship("VentaDetalle", backref="venta", cascade="all, delete-orphan")


class VentaDetalle(Base):
    __tablename__ = "venta_detalle"

    id = Column(Integer, primary_key=True, index=True)
    venta_id = Column(Integer, ForeignKey("ventas.id", ondelete="CASCADE"), nullable=False)
    producto_id = Column(Integer, ForeignKey("productos.id"), nullable=False)
    cantidad = Column(Integer, nullable=False)
    precio_unitario = Column(DECIMAL(10, 2), nullable=False)

    producto = relationship("Producto")