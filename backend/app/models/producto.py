from sqlalchemy import Column, Integer, String, DECIMAL, ForeignKey, TIMESTAMP, func
from sqlalchemy.orm import relationship

from app.database import Base


class Producto(Base):
    __tablename__ = "productos"

    id = Column(Integer, primary_key=True, index=True)
    codigo = Column(String(30), nullable=False, unique=True)
    nombre = Column(String(150), nullable=False)
    categoria_id = Column(Integer, ForeignKey("categorias.id", ondelete="SET NULL"), nullable=True)
    marca_id = Column(Integer, ForeignKey("marcas.id", ondelete="SET NULL"), nullable=True)
    precio_compra = Column(DECIMAL(10, 2), nullable=False, default=0)
    precio_venta = Column(DECIMAL(10, 2), nullable=False, default=0)
    stock = Column(Integer, nullable=False, default=0)
    stock_minimo = Column(Integer, nullable=False, default=0)
    unidad = Column(String(20), nullable=False, default="unidad")

    # Foto del producto para el catálogo (ruta pública servida en /static/...)
    imagen_url = Column(String(255), nullable=True)

    categoria = relationship("Categoria")
    marca = relationship("Marca")