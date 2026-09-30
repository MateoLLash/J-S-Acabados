from typing import List, Optional
from pydantic import BaseModel
from datetime import date

class DetalleGuia(BaseModel):
    producto_id: int
    codigo_producto: str
    descripcion: str
    cantidad: float
    unidad_medida: str

class GuiaCreate(BaseModel):
    fecha_traslado: date
    motivo_traslado: str
    descripcion_motivo: str
    peso_total: float
    ubigeo_partida: str
    direccion_partida: str
    ubigeo_llegada: str
    direccion_llegada: str
    destinatario_tipo_doc: str
    destinatario_num_doc: str
    destinatario_nombre: str
    modalidad_transporte: str
    transportista_doc: Optional[str] = None
    transportista_nombre: Optional[str] = None
    vehiculo_placa: Optional[str] = None
    conductor_doc: Optional[str] = None
    detalles: List[DetalleGuia]