import time
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
        if campos.get("error_mensaje"):
            campos["error_mensaje"] = str(campos["error_mensaje"])[:1000]
        if campos.get("user_agent"):
            campos["user_agent"] = str(campos["user_agent"])[:255]
        with SessionLocal() as db:
            db.add(AuditoriaIntegracion(**campos))
            db.commit()
    except Exception as exc:  # noqa: BLE001
        print(f"[auditoria_integracion] no se pudo registrar el evento: {exc}")


@contextmanager
def medir():
    """Uso: with medir() as t: ...código...   y luego t() devuelve los milisegundos transcurridos."""
    inicio = time.perf_counter()
    yield lambda: int((time.perf_counter() - inicio) * 1000)