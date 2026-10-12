"""Medición ASGI: termina al enviar el último fragmento, sin almacenar cuerpos."""
import time
import uuid
from datetime import datetime, timezone
from urllib.parse import parse_qsl

from starlette.concurrency import run_in_threadpool
from starlette.datastructures import Headers, MutableHeaders

from app.integrations.auditoria_integracion import registrar_evento, clasificar_status, parametros_seguros


class AuditoriaHTTPMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        ruta = scope.get('path', '')
        if scope['type'] != 'http' or not ruta.startswith('/api/v1/') or ruta == '/api/v1/sync' or ruta.startswith('/api/v1/sync/'):
            return await self.app(scope, receive, send)
        inicio, fecha = time.perf_counter(), datetime.now(timezone.utc)
        headers = Headers(scope=scope)
        request_id = str(uuid.uuid4())
        recibidos = enviados = 0
        request_leido = False
        status = cabeceras_ms = fin = None
        tipo_respuesta = error_tipo = error_mensaje = None
        completo = False

        async def recibir():
            nonlocal recibidos, request_leido
            message = await receive()
            if message['type'] == 'http.request':
                request_leido = True
                recibidos += len(message.get('body', b''))
            return message

        async def enviar(message):
            nonlocal status, cabeceras_ms, tipo_respuesta, enviados, completo, fin
            if message['type'] == 'http.response.start':
                status = message['status']
                cabeceras_ms = round((time.perf_counter() - inicio) * 1000, 3)
                response_headers = MutableHeaders(scope=message)
                response_headers['X-Request-ID'] = request_id
                tipo_respuesta = response_headers.get('content-type')
            await send(message)
            if message['type'] == 'http.response.body':
                enviados += len(message.get('body', b''))
                if not message.get('more_body', False):
                    completo = True
                    fin = (time.perf_counter(), datetime.now(timezone.utc))

        try:
            await self.app(scope, recibir, enviar)
        except Exception as exc:
            error_tipo = type(exc).__name__
            error_mensaje = 'Error durante el procesamiento de la petición; consultar logs del servidor con el ID de petición.'
            raise
        finally:
            fin_perf, fecha_fin = fin or (time.perf_counter(), datetime.now(timezone.utc))
            plantilla = getattr(scope.get('route'), 'path', ruta)
            resultado = clasificar_status(status)
            if status is not None and status >= 400 and not error_tipo:
                error_tipo = f'HTTP{status}'
                error_mensaje = {401: 'API key inválida o ausente.', 403: 'Acceso denegado.', 404: 'Recurso no encontrado.', 422: 'La petición no supera la validación.', 429: 'Límite de solicitudes alcanzado.'}.get(status, 'La API devolvió un estado HTTP de error.')
            if not completo:
                resultado = 'error'
                error_tipo = error_tipo or 'RespuestaIncompleta'
            # La identidad se asigna exclusivamente después de validar la API key.
            sistema = scope.get('state', {}).get('sistema_integracion', 'desconocido')
            cliente = scope.get('client')
            await run_in_threadpool(
                registrar_evento, fecha=fecha, fecha_fin=fecha_fin,
                request_id=request_id, correlacion_id=request_id,
                direccion='entrante', sistema=sistema,
                operacion=f"{scope['method']} {plantilla}", metodo=scope['method'],
                endpoint=ruta, endpoint_plantilla=plantilla,
                status_code=status, resultado=resultado,
                duracion_ms=round((fin_perf - inicio) * 1000, 3),
                tiempo_cabeceras_ms=cabeceras_ms, alcance_duracion='servidor_hasta_ultimo_byte',
                tam_request_bytes=recibidos if request_leido else (0 if headers.get('content-length') == '0' or (scope['method'] in ('GET', 'HEAD') and not headers.get('content-length') and not headers.get('transfer-encoding')) else None),
                tam_respuesta_bytes=enviados if status is not None else None,
                query_params=parametros_seguros(parse_qsl(scope.get('query_string', b'').decode('utf-8', 'replace'))),
                content_type_request=headers.get('content-type'), content_type_respuesta=tipo_respuesta,
                ip_origen=cliente[0] if cliente else None, user_agent=headers.get('user-agent'),
                error_tipo=error_tipo, error_mensaje=error_mensaje,
            )
