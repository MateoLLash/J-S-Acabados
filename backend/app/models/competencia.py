from sqlalchemy import Column, Integer, String, DECIMAL, ForeignKey, Boolean, TIMESTAMP, func, UniqueConstraint
from sqlalchemy.orm import relationship
from app.database import Base


class Competidor(Base):
    __tablename__ = "competidores"

    id = Column(Integer, primary_key=True)
    nombre = Column(String(120), nullable=False)
    url_base = Column(String(255), nullable=False)
    activo = Column(Boolean, nullable=False, default=True)
    creado_en = Column(TIMESTAMP(timezone=True), server_default=func.now())

    productos = relationship("ProductoCompetidor", back_populates="competidor", cascade="all, delete-orphan")


class ProductoCompetidor(Base):
    __tablename__ = "productos_competidor"
    __table_args__ = (UniqueConstraint("competidor_id", "url_producto"),)

    id = Column(Integer, primary_key=True)
    competidor_id = Column(Integer, ForeignKey("competidores.id"), nullable=False)
    nombre_scrapeado = Column(String(255), nullable=False)
    precio = Column(DECIMAL(10, 2), nullable=False)
    precio_original = Column(DECIMAL(10, 2), nullable=True)
    categoria = Column(String(120), nullable=True)
    url_producto = Column(String(500), nullable=False)
    ultima_actualizacion = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now())

    competidor = relationship("Competidor", back_populates="productos")
    historico = relationship("HistoricoPrecioCompetencia", back_populates="producto_competidor", cascade="all, delete-orphan")

    @property
    def competidor_nombre(self):
        return self.competidor.nombre if self.competidor else None

class HistoricoPrecioCompetencia(Base):
    __tablename__ = "historico_precios_competencia"

    id = Column(Integer, primary_key=True)
    producto_competidor_id = Column(Integer, ForeignKey("productos_competidor.id"), nullable=False)
    precio = Column(DECIMAL(10, 2), nullable=False)
    fecha_registro = Column(TIMESTAMP(timezone=True), server_default=func.now())

    producto_competidor = relationship("ProductoCompetidor", back_populates="historico")


class ProductoMatch(Base):
    __tablename__ = "producto_match"
    __table_args__ = (UniqueConstraint("producto_id", "producto_competidor_id"),)

    id = Column(Integer, primary_key=True)
    producto_id = Column(Integer, ForeignKey("productos.id"), nullable=False)
    producto_competidor_id = Column(Integer, ForeignKey("productos_competidor.id"), nullable=False)
    confirmado_por_usuario = Column(Boolean, nullable=False, default=False)
    creado_en = Column(TIMESTAMP(timezone=True), server_default=func.now())