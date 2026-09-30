from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Date, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base

class GuiaRemision(Base):
    __tablename__ = "guias_remision"

    id = Column(Integer, primary_key=True, index=True)
    serie = Column(String(4), default="T002") # Serie oficial para Guías de Remisión Remitente
    numero = Column(Integer)
    fecha_emision = Column(DateTime, default=datetime.now)
    fecha_traslado = Column(Date, nullable=False)
    
    # 01: Venta, 02: Compra, 04: Traslado entre establecimientos, 14: Venta sujeta a confirmación...
    motivo_traslado = Column(String(2), default="01") 
    descripcion_motivo = Column(String(100))

    # Peso bruto total en Kilos (KGM)
    peso_total = Column(Float, nullable=False)
    
    # Datos de los puntos de traslado (Ubigeo es clave para SUNAT)
    ubigeo_partida = Column(String(6), nullable=False)
    direccion_partida = Column(String(200), nullable=False)
    ubigeo_llegada = Column(String(6), nullable=False)
    direccion_llegada = Column(String(200), nullable=False)

    # Datos del Destinatario (Cliente)
    destinatario_tipo_doc = Column(String(1), nullable=False) # 6=RUC, 1=DNI
    destinatario_num_doc = Column(String(15), nullable=False)
    destinatario_nombre = Column(String(100), nullable=False)

    # Modalidad de Transporte: 01=Público (Agencia), 02=Privado (Tus propios vehículos)
    modalidad_transporte = Column(String(2), default="02")
    
    # Datos del Transportista (Si es modalidad 01)
    transportista_doc = Column(String(15), nullable=True)
    transportista_nombre = Column(String(100), nullable=True)
    
    # Datos del Vehículo/Conductor (Si es modalidad 02)
    vehiculo_placa = Column(String(10), nullable=True)
    conductor_doc = Column(String(15), nullable=True)

    estado_sunat = Column(String(20), default="pendiente")
    observaciones_sunat = Column(Text, nullable=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"))

    detalles = relationship("GuiaRemisionDetalle", back_populates="guia", cascade="all, delete-orphan")


class GuiaRemisionDetalle(Base):
    __tablename__ = "guias_remision_detalles"

    id = Column(Integer, primary_key=True, index=True)
    guia_id = Column(Integer, ForeignKey("guias_remision.id", ondelete="CASCADE"))
    producto_id = Column(Integer, ForeignKey("productos.id"))
    
    cantidad = Column(Float, nullable=False)
    unidad_medida = Column(String(3), default="NIU") # NIU = Unidades, MTK = Metros cuadrados
    
    # Aunque esté relacionado a producto, guardamos copia por si el producto cambia a futuro
    codigo_producto = Column(String(50))
    descripcion = Column(String(200))

    guia = relationship("GuiaRemision", back_populates="detalles")
    producto = relationship("Producto")