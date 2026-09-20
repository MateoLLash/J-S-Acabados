from sqlalchemy import Column, Integer, String, Date, ForeignKey, TIMESTAMP, func
from sqlalchemy.orm import relationship
from app.database import Base

class ComunicacionBaja(Base):
    __tablename__ = "comunicaciones_baja"

    id = Column(Integer, primary_key=True, index=True)
    numero_ticket = Column(String, nullable=True)
    fecha_generacion = Column(Date, nullable=False)
    fecha_referencia = Column(Date, nullable=False)
    motivo = Column(String, nullable=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    estado = Column(String, default="pendiente")
    fecha = Column(TIMESTAMP(timezone=True), server_default=func.now())

    detalles = relationship("ComunicacionBajaDetalle", backref="comunicacion", cascade="all, delete-orphan")

class ComunicacionBajaDetalle(Base):
    __tablename__ = "comunicacion_baja_detalle"

    id = Column(Integer, primary_key=True, index=True)
    comunicacion_baja_id = Column(Integer, ForeignKey("comunicaciones_baja.id", ondelete="CASCADE"), nullable=False)
    venta_id = Column(Integer, ForeignKey("ventas.id"), nullable=False)
    motivo_baja = Column(String, nullable=False)