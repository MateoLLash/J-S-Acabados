"""Pruebas aisladas: no conectan con la base de datos del proyecto."""
import asyncio
import json
import os
from types import SimpleNamespace
os.environ['DATABASE_URL'] = 'postgresql://test:test@127.0.0.1:1/test'
os.environ['EQUIPO_KANARI_API_KEY'] = 'test-key'
import httpx
import pytest
from fastapi import FastAPI, Depends
from fastapi.testclient import TestClient
from starlette.responses import StreamingResponse
from app.integrations import auditoria_http, lina_client
from app.integrations.api_keys import verificar_api_key
from app.integrations.auditoria_integracion import parametros_seguros
from app.routers import auditoria_integracion as audit

@pytest.fixture
def registros(monkeypatch):
    rows = []
    monkeypatch.setattr(auditoria_http, 'registrar_evento', lambda **kw: rows.append(kw))
    monkeypatch.setattr(lina_client, 'registrar_evento', lambda **kw: rows.append(kw))
    return rows

def test_stream_completo(registros):
    app = FastAPI()
    app.add_middleware(auditoria_http.AuditoriaHTTPMiddleware)
    @app.get('/api/v1/productos/{id}')
    def endpoint(id: int, sistema=Depends(verificar_api_key)):
        async def partes():
            yield b'abc'
            await asyncio.sleep(.025)
            yield b'defg'
        return StreamingResponse(partes(), media_type='text/plain')
    response = TestClient(app).get('/api/v1/productos/8?token=secreto&limit=20', headers={'X-API-Key': 'test-key', 'X-Forwarded-For': 'IP-FALSA'})
    ev = registros[0]
    assert response.content == b'abcdefg'
    assert ev['tam_respuesta_bytes'] == 7
    assert ev['duracion_ms'] >= ev['tiempo_cabeceras_ms'] + 20
    assert ev['request_id'] == response.headers['x-request-id']
    assert ev['sistema'] == 'lina'
    assert ev['endpoint_plantilla'] == '/api/v1/productos/{id}'
    assert 'secreto' not in ev['query_params']
    assert ev['ip_origen'] != 'IP-FALSA'
    assert ev['fecha_fin'] >= ev['fecha']

def test_no_autorizado_y_exclusion_sync(registros):
    app = FastAPI()
    app.add_middleware(auditoria_http.AuditoriaHTTPMiddleware)
    @app.get('/api/v1/clientes')
    def endpoint(sistema=Depends(verificar_api_key)): return []
    client = TestClient(app)
    assert client.get('/api/v1/clientes').status_code == 401
    assert registros[0]['resultado'] == 'no_autorizado'
    assert registros[0]['sistema'] == 'desconocido'
    client.get('/api/v1/sync/lina/productos')
    assert len(registros) == 1

def test_post_y_stream_interrumpido(registros):
    async def app(scope, receive, send):
        assert (await receive())['body'] == b'12345'
        await send({'type': 'http.response.start', 'status': 200, 'headers': []})
        await send({'type': 'http.response.body', 'body': b'ab', 'more_body': True})
        raise ValueError('dato sensible')
    scope = {'type': 'http', 'path': '/api/v1/test', 'method': 'POST', 'headers': [], 'query_string': b'', 'client': ('127.0.0.1', 1)}
    async def receive(): return {'type': 'http.request', 'body': b'12345'}
    async def send(message): pass
    with pytest.raises(ValueError):
        asyncio.run(auditoria_http.AuditoriaHTTPMiddleware(app)(scope, receive, send))
    assert registros[0]['resultado'] == 'error'
    assert registros[0]['tam_request_bytes'] == 5
    assert registros[0]['tam_respuesta_bytes'] == 2
    assert 'dato sensible' not in registros[0]['error_mensaje']

@pytest.mark.parametrize('modo,esperado', [('ok', 'exito'), ('invalid', 'error'), ('timeout', 'timeout'), ('401', 'no_autorizado')])
def test_salientes(monkeypatch, registros, modo, esperado):
    real_client = httpx.Client
    def handle(request):
        if modo == 'timeout': raise httpx.ReadTimeout('secreto', request=request)
        if modo == 'invalid': return httpx.Response(200, content=b'no-json')
        if modo == '401': return httpx.Response(401, json={'detail': 'no'})
        return httpx.Response(200, json={'ok': True})
    monkeypatch.setenv('LINA_INTEGRATION_KEY', 'secreto')
    monkeypatch.setattr(lina_client.httpx, 'Client', lambda **kw: real_client(transport=httpx.MockTransport(handle), **kw))
    if modo == 'ok':
        assert lina_client._llamar_lina('test', 'POST', '/test', timeout=5, body={'nombre': 'ñ'}) == {'ok': True}
    else:
        with pytest.raises(Exception): lina_client._llamar_lina('test', 'POST', '/test', timeout=5, body={'nombre': 'ñ'})
    ev = registros[0]
    assert ev['resultado'] == esperado
    assert ev['request_id'] and ev['correlacion_id']
    assert ev['timeout_config_ms'] == 5000
    assert ev['tam_request_bytes'] == len(httpx.Request('POST', 'https://test', json={'nombre': 'ñ'}).content)
    assert 'secreto' not in (ev['error_mensaje'] or '')

def test_admin_filtros_validaciones():
    app = FastAPI()
    app.include_router(audit.router)
    app.dependency_overrides[audit.get_current_user] = lambda: SimpleNamespace(rol='almacen')
    app.dependency_overrides[audit.get_db] = lambda: None
    client = TestClient(app)
    assert client.get('/auditoria/integracion').status_code == 403
    assert client.get('/auditoria/integracion/metricas').status_code == 403
    assert client.get('/auditoria/integracion?duracion_min_ms=-1').status_code == 422
    assert client.get('/auditoria/integracion?status_code=999').status_code == 422
    filtros, params, _ = audit.filtros_auditoria(24, 'entrante', None, None, 'exito', None, 'GET', 200, 500, "x%' OR true --")
    assert 'duracion_ms >= :duracion_min_ms' in filtros
    assert 'OR true' not in filtros
    assert params['status_code'] == 200

def test_parametros_seguros():
    result = parametros_seguros([('api_key', 'secret'), ('email', 'personal'), ('page', '2')])
    assert 'secret' not in result and 'personal' not in result
    assert json.loads(result)[2]['valor'] == '2'
