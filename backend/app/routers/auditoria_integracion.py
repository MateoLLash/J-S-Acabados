from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID
import csv
import io

from fastapi.responses import Response

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
    desde: Optional[datetime] = None,
    hasta: Optional[datetime] = None,
):
    if (desde is None) != (hasta is None):
        raise HTTPException(422, 'Indica ambas fechas: desde y hasta.')
    if desde is not None:
        if desde.tzinfo is None or hasta.tzinfo is None:
            raise HTTPException(422, 'Las fechas deben incluir zona horaria.')
        if hasta <= desde or hasta - desde > timedelta(days=90):
            raise HTTPException(422, 'El intervalo debe ser positivo y no superar 90 días.')
    else:
        hasta = datetime.now(timezone.utc)
        desde = hasta - timedelta(hours=horas)
    filtros = ['fecha >= :desde', 'fecha < :hasta']
    params = {'desde': desde, 'hasta': hasta}
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
    COUNT(*) FILTER (WHERE resultado NOT IN ('exito', 'parcial')) AS errores,
    COUNT(*) FILTER (WHERE resultado = 'parcial') AS parciales,
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


@router.get('/traza/{correlacion_id}')
def obtener_traza(correlacion_id: UUID, db: Session = Depends(get_db), usuario_actual=Depends(get_current_user)):
    """Ignora filtros de la tabla: reúne los eventos de una correlación específica."""
    _solo_admin(usuario_actual)
    filas = db.execute(text("""
        SELECT * FROM auditoria_integracion WHERE correlacion_id = :correlacion
        ORDER BY fecha, id LIMIT 501
    """), {'correlacion': str(correlacion_id)}).mappings().all()
    if not filas:
        raise HTTPException(404, 'No hay eventos para esta traza.')
    return {'correlacion_id': str(correlacion_id), 'eventos': filas[:500], 'truncada': len(filas) > 500}


@router.get('/exportar')
def exportar_eventos(filtros=Depends(filtros_auditoria), db: Session = Depends(get_db), usuario_actual=Depends(get_current_user)):
    _solo_admin(usuario_actual)
    where, params, _ = filtros
    campos = ['id', 'fecha', 'fecha_fin', 'direccion', 'sistema', 'operacion', 'metodo', 'endpoint',
              'status_code', 'resultado', 'duracion_ms', 'correlacion_id', 'request_id', 'etapa',
              'estado_guardado', 'estado_confirmacion', 'registros_recibidos', 'registros_procesados',
              'registros_omitidos', 'registros_fallidos', 'diagnostico_codigo', 'error_mensaje', 'accion_sugerida',
              'alcance_duracion', 'tiempo_cabeceras_ms', 'timeout_config_ms', 'tam_request_bytes',
              'tam_respuesta_bytes', 'usuario_id', 'ip_origen', 'user_agent']
    filas = db.execute(text(f"SELECT {', '.join(campos)} FROM auditoria_integracion WHERE {where} ORDER BY fecha DESC, id DESC LIMIT 50001"), params).mappings().all()
    if len(filas) > 50000:
        raise HTTPException(413, 'Más de 50 000 eventos. Reduce el rango de fechas para exportar sin recortes.')
    archivo = io.StringIO()
    writer = csv.writer(archivo)
    writer.writerow(campos)
    for fila in filas:
        valores = []
        for campo in campos:
            valor = '' if fila[campo] is None else str(fila[campo])
            if valor.lstrip().startswith(('=', '+', '-', '@')):
                valor = "'" + valor
            valores.append(valor)
        writer.writerow(valores)
    return Response(content='\ufeff' + archivo.getvalue(), media_type='text/csv; charset=utf-8',
                    headers={'Content-Disposition': 'attachment; filename="auditoria-filtrada.csv"'})
