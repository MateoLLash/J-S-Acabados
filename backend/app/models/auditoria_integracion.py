from sqlalchemy import BigInteger, Column, DateTime, Integer, Numeric, JSON, String, Text, func

from app.database import Base


class AuditoriaIntegracion(Base):
    """Bitácora de cada intercambio de API con sistemas externos (Lina / Comercial Kañari).

    Es distinta de `auditoria_logs`, que registra cambios de datos hechos por usuarios.
    """
    __tablename__ = "auditoria_integracion"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    fecha = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    correlacion_id = Column(String(36), index=True)       # agrupa los pasos de una misma operación

    direccion = Column(String(10), nullable=False)        # entrante | saliente | interna
    sistema = Column(String(50), nullable=False)          # lina | desconocido
    operacion = Column(String(120), nullable=False)       # ej. productos.listar, GET /api/v1/productos
    metodo = Column(String(10))
    endpoint = Column(String(300))

    status_code = Column(Integer)
    resultado = Column(String(20), nullable=False)        # exito | error | timeout | no_autorizado | error_cliente | error_servidor
    duracion_ms = Column(Numeric(16, 3), nullable=False)

    tam_request_bytes = Column(Integer)
    tam_respuesta_bytes = Column(Integer)

    registros_recibidos = Column(Integer)                 # solo en sincronizaciones
    registros_procesados = Column(Integer)
    registros_omitidos = Column(Integer)

    usuario_id = Column(Integer)                          # quién disparó la sincronización (si aplica)
    ip_origen = Column(String(64))
    user_agent = Column(String(255))

    error_tipo = Column(String(100))
    error_mensaje = Column(Text)
    fecha_fin = Column(DateTime(timezone=True))
    request_id = Column(String(36), index=True)
    tiempo_cabeceras_ms = Column(Numeric(16, 3))
    alcance_duracion = Column(String(60))
    endpoint_plantilla = Column(String(300))
    query_params = Column(Text)
    content_type_request = Column(String(255))
    content_type_respuesta = Column(String(255))
    timeout_config_ms = Column(Integer)

    registros_fallidos = Column(Integer)
    etapa = Column(String(40))
    estado_guardado = Column(String(40))
    estado_confirmacion = Column(String(40))
    diagnostico_codigo = Column(String(60))
    accion_sugerida = Column(Text)
    detalle_registros = Column(JSON)
    detalle_total = Column(Integer)
