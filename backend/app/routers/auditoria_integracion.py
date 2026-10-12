from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth.dependencies import get_current_user

router = APIRouter(prefix='/auditoria/integracion', tags=['auditoria-integracion'])


def _solo_admin(usuario_actual):
    if usuario_actual.rol != 'admin':
        raise HTTPException(status_code=403, detail='Sin permisos para ver la auditoría de integración')


def filtros_auditoria(
    horas: int = Query(24, ge=1, le=2160),
    direccion: Optional[str] = Query(None, max_length=10),
    sistema: Optional[str] = Query(None, max_length=50),
    operacion: Optional[str] = Query(None, max_length=120),
    resultado: Optional[str] = Query(None, max_length=20),
    correlacion_id: Optional[str] = Query(None, max_length=36),
    metodo: Optional[str] = Query(None, max_length=10),
    status_code: Optional[int] = Query(None, ge=100, le=599),
    duracion_min_ms: Optional[float] = Query(None, ge=0, le=1e12),
    q: Optional[str] = Query(None, max_length=200),
):
    filtros = ['fecha >= :desde']
    params = {'desde': datetime.now(timezone.utc) - timedelta(hours=horas)}
    for campo, valor in (
        ('direccion', direccion), ('sistema', sistema), ('operacion', operacion),
        ('resultado', resultado), ('correlacion_id', correlacion_id),
        ('metodo', metodo), ('status_code', status_code),
    ):
        if valor is not None and valor != '':
            filtros.append(f'{campo} = :{campo}')
            params[campo] = valor
    if duracion_min_ms is not None:
        filtros.append('duracion_ms >= :duracion_min_ms')
        params['duracion_min_ms'] = duracion_min_ms
    if q and q.strip():
        filtros.append("(endpoint ILIKE :q OR operacion ILIKE :q OR correlacion_id ILIKE :q OR request_id ILIKE :q)")
        params['q'] = '%' + q.strip().replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_') + '%'
    return ' AND '.join(filtros), params, horas


@router.get('')
def listar_eventos(
    filtros=Depends(filtros_auditoria),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    usuario_actual=Depends(get_current_user),
):
    _solo_admin(usuario_actual)
    where, params, _ = filtros
    return db.execute(text(f'''
        SELECT * FROM auditoria_integracion WHERE {where}
        ORDER BY fecha DESC, id DESC LIMIT :limit OFFSET :offset
    '''), {**params, 'limit': limit, 'offset': offset}).mappings().all()


AGREGADOS = """
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE resultado = 'exito') AS exitosos,
    COUNT(*) FILTER (WHERE resultado <> 'exito') AS errores,
    COUNT(*) FILTER (WHERE resultado = 'timeout') AS timeouts,
    ROUND(100.0 * COUNT(*) FILTER (WHERE resultado = 'exito') / NULLIF(COUNT(*), 0), 2) AS pct_exito,
    ROUND(AVG(duracion_ms), 3) AS promedio_ms,
    ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY duracion_ms))::numeric, 3) AS p50_ms,
    ROUND((percentile_cont(0.95) WITHIN GROUP (ORDER BY duracion_ms))::numeric, 3) AS p95_ms,
    ROUND((percentile_cont(0.99) WITHIN GROUP (ORDER BY duracion_ms))::numeric, 3) AS p99_ms,
    MIN(duracion_ms) AS min_ms, MAX(duracion_ms) AS max_ms,
    MAX(fecha) AS ultimo_evento
"""


@router.get('/metricas')
def metricas(
    filtros=Depends(filtros_auditoria),
    db: Session = Depends(get_db),
    usuario_actual=Depends(get_current_user),
):
    _solo_admin(usuario_actual)
    where, params, horas = filtros
    # Una sola sentencia: tarjetas y grupos comparten la misma instantánea de datos.
    filas = db.execute(text(f'''
        SELECT direccion, sistema, operacion, GROUPING(direccion) AS es_resumen,
               {AGREGADOS}
        FROM auditoria_integracion WHERE {where}
        GROUP BY GROUPING SETS ((direccion, sistema, operacion), ())
        ORDER BY direccion, sistema, operacion
    '''), params).mappings().all()
    operaciones, resumen = [], {}
    for fila in filas:
        valor = dict(fila)
        if valor.pop('es_resumen'):
            resumen = {k: v for k, v in valor.items() if k not in ('direccion', 'sistema', 'operacion')}
        else:
            operaciones.append(valor)
    return {'periodo_horas': horas, 'operaciones': operaciones, 'resumen': resumen}


@router.get('/metricas/semanal')
def metricas_semanal(
    semanas: int = Query(8, ge=1, le=52),
    db: Session = Depends(get_db),
    usuario_actual=Depends(get_current_user),
):
    _solo_admin(usuario_actual)
    # Percentiles calculados sobre eventos, sin depender de una vista externa.
    return db.execute(text('''
        SELECT date_trunc('week', fecha AT TIME ZONE 'America/Lima') AS semana,
               COUNT(*) AS total,
               COUNT(*) FILTER (WHERE resultado = 'exito') AS exitosos,
               COUNT(*) FILTER (WHERE resultado = 'no_autorizado') AS no_autorizados,
               COUNT(*) FILTER (WHERE resultado <> 'exito') AS errores,
               ROUND(AVG(duracion_ms), 3) AS promedio_ms,
               ROUND((percentile_cont(0.95) WITHIN GROUP (ORDER BY duracion_ms))::numeric, 3) AS p95_max_ms
        FROM auditoria_integracion
        WHERE fecha >= :desde
        GROUP BY semana ORDER BY semana DESC LIMIT :n
    '''), {'desde': datetime.now(timezone.utc) - timedelta(weeks=semanas), 'n': semanas}).mappings().all()
