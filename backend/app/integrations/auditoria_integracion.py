import time
import json
import logging
from datetime import datetime, timezone
from contextlib import contextmanager

from app.database import SessionLocal
from app.models.auditoria_integracion import AuditoriaIntegracion


def clasificar_status(status_code: int | None) -> str:
    """Convierte un código HTTP en el 'resultado' que se guarda en la bitácora."""
    if status_code is None:
        return "error"
    if status_code < 400:
        return "exito"
    if status_code in (401, 403):
        return "no_autorizado"
    if status_code < 500:
        return "error_cliente"
    return "error_servidor"


def registrar_evento(**campos) -> None:
    """Guarda un evento en su propia sesión. Nunca lanza errores: auditar no debe romper la operación."""
    try:
        for columna in AuditoriaIntegracion.__table__.columns:
            limite = getattr(columna.type, 'length', None)
            if limite and campos.get(columna.name) is not None:
                campos[columna.name] = str(campos[columna.name])[:limite]
        if campos.get("error_mensaje"):
            campos["error_mensaje"] = str(campos["error_mensaje"])[:1000]
        if campos.get("user_agent"):
            campos["user_agent"] = str(campos["user_agent"])[:255]
        with SessionLocal() as db:
            db.add(AuditoriaIntegracion(**campos))
            db.commit()
    except Exception as exc:  # noqa: BLE001
        logging.getLogger(__name__).error("No se pudo guardar auditoría (%s)", type(exc).__name__)


@contextmanager
def medir():
    """Uso: with medir() as t: ...código...   y luego t() devuelve los milisegundos transcurridos."""
    inicio = time.perf_counter()
    def transcurrido():
        return round((time.perf_counter() - inicio) * 1000, 3)
    transcurrido.fecha = datetime.now(timezone.utc)
    yield transcurrido

def parametros_seguros(pares):
    """Solo conserva valores técnicos conocidos; el resto se oculta por defecto."""
    permitidos = {'page', 'limit', 'offset', 'pagina', 'per_page', 'sort', 'order'}
    return json.dumps([
        {'nombre': str(k)[:80], 'valor': str(v)[:120] if k.lower() in permitidos else '[OCULTO]'}
        for k, v in list(pares)[:50]
    ], ensure_ascii=False)
