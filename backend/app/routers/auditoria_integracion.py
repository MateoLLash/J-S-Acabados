from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth.dependencies import get_current_user

router = APIRouter(prefix="/auditoria/integracion", tags=["auditoria-integracion"])


def _solo_admin(usuario_actual):
    if usuario_actual.rol != "admin":
        raise HTTPException(status_code=403, detail="Sin permisos para ver la auditoría de integración")


@router.get("")
def listar_eventos(
    direccion: Optional[str] = Query(None, description="entrante | saliente | interna"),
    sistema: Optional[str] = None,
    operacion: Optional[str] = None,
    resultado: Optional[str] = None,
    correlacion_id: Optional[str] = None,
    horas: int = Query(24, ge=1, le=24 * 90),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    usuario_actual=Depends(get_current_user),
):
    _solo_admin(usuario_actual)
    desde = datetime.now(timezone.utc) - timedelta(hours=horas)

    filtros = ["fecha >= :desde"]
    params = {"desde": desde, "limit": limit, "offset": offset}
    for campo, valor in (
        ("direccion", direccion), ("sistema", sistema), ("operacion", operacion),
        ("resultado", resultado), ("correlacion_id", correlacion_id),
    ):
        if valor:
            filtros.append(f"{campo} = :{campo}")
            params[campo] = valor

    consulta = text(f"""
        SELECT id, fecha, correlacion_id, direccion, sistema, operacion, metodo, endpoint,
               status_code, resultado, duracion_ms, tam_request_bytes, tam_respuesta_bytes,
               registros_recibidos, registros_procesados, registros_omitidos,
               usuario_id, ip_origen, error_tipo, error_mensaje
        FROM auditoria_integracion
        WHERE {' AND '.join(filtros)}
        ORDER BY fecha DESC
        LIMIT :limit OFFSET :offset
    """)
    return db.execute(consulta, params).mappings().all()


@router.get("/metricas")
def metricas(
    horas: int = Query(24, ge=1, le=24 * 90),
    db: Session = Depends(get_db),
    usuario_actual=Depends(get_current_user),
):
    """Tiempos y tasa de éxito por operación: promedio, mediana, p95, p99 y máximo."""
    _solo_admin(usuario_actual)
    desde = datetime.now(timezone.utc) - timedelta(hours=horas)

    consulta = text("""
        SELECT direccion, sistema, operacion,
               COUNT(*) AS total,
               COUNT(*) FILTER (WHERE resultado = 'exito') AS exitosos,
               ROUND(100.0 * COUNT(*) FILTER (WHERE resultado = 'exito') / COUNT(*), 1) AS pct_exito,
               ROUND(AVG(duracion_ms)) AS promedio_ms,
               ROUND((percentile_cont(0.5)  WITHIN GROUP (ORDER BY duracion_ms))::numeric) AS p50_ms,
               ROUND((percentile_cont(0.95) WITHIN GROUP (ORDER BY duracion_ms))::numeric) AS p95_ms,
               ROUND((percentile_cont(0.99) WITHIN GROUP (ORDER BY duracion_ms))::numeric) AS p99_ms,
               MAX(duracion_ms) AS max_ms,
               MAX(fecha) AS ultimo_evento
        FROM auditoria_integracion
        WHERE fecha >= :desde
        GROUP BY direccion, sistema, operacion
        ORDER BY direccion, operacion
    """)
    return {"periodo_horas": horas, "operaciones": db.execute(consulta, {"desde": desde}).mappings().all()}