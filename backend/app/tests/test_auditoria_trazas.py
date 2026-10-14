"""Pruebas locales sin Render, Lina ni PostgreSQL de producción."""
import os
os.environ['DATABASE_URL'] = 'postgresql://test:test@127.0.0.1:1/test'
import json
from types import SimpleNamespace
from datetime import datetime, timezone, timedelta
import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session
from sqlalchemy.exc import OperationalError
from app.database import Base
from app.models.producto import Producto
from app.models.catalogo import Categoria, Marca, Proveedor
from app.routers import sincronizacion as sync
from app.routers import auditoria_integracion as audit
from app.integrations.diagnostico_api import diagnosticar_error


@pytest.fixture
def entorno(monkeypatch):
    engine = create_engine('sqlite://')
    @event.listens_for(engine, 'connect')
    def conectar(connection, record): connection.isolation_level = None
    @event.listens_for(engine, 'begin')
    def comenzar(conn): conn.exec_driver_sql('BEGIN')
    Base.metadata.create_all(engine, tables=[Categoria.__table__, Marca.__table__, Producto.__table__, Proveedor.__table__])
    db = Session(engine, autoflush=False)
    eventos, confirmados = [], []
    monkeypatch.setattr(sync, 'registrar_evento', lambda **k: eventos.append(k))
    def confirmar(productos, proveedores, correlacion, usuario):
        confirmados.append((productos, proveedores))
        return {'confirmado': len(productos) + len(proveedores)}
    monkeypatch.setattr(sync, 'confirmar_recepcion_lina', confirmar)
    yield db, eventos, confirmados
    db.close(); engine.dispose()


def producto(codigo='P1', id=1):
    return {'id': id, 'codigo': codigo, 'nombre': 'Cerámica', 'categoria': 'Pisos', 'precioVenta': 12.50, 'stock': 5}


def ejecutar(monkeypatch, entorno, registros):
    monkeypatch.setattr(sync, 'consultar_productos_lina', lambda *a: {'productos': registros})
    response = sync._sincronizar('productos', entorno[0], SimpleNamespace(id=1))
    return response.status_code, json.loads(response.body)


def test_guardado_duplicados_y_validacion(monkeypatch, entorno):
    estado, body = ejecutar(monkeypatch, entorno, [producto(), producto(), {**producto('P2', 2), 'stock': -1}])
    assert estado == 207
    assert body['productos_guardados'] == 1 and body['omitidos'] == 1 and body['fallidos'] == 1
    assert entorno[0].query(Producto).count() == 1
    assert entorno[2] == [([1], [])]
    ev = entorno[1][-1]
    assert [x['estado'] for x in ev['detalle_registros']] == ['guardado', 'omitido', 'fallido']
    assert ev['estado_confirmacion'] == 'respuesta_recibida'


def test_confirmacion_fallida_no_borra_guardados(monkeypatch, entorno):
    def fallar(*a): raise httpx.ReadTimeout('no exponer secretos')
    monkeypatch.setattr(sync, 'confirmar_recepcion_lina', fallar)
    estado, body = ejecutar(monkeypatch, entorno, [producto()])
    assert estado == 207 and body['estado_confirmacion'] == 'pendiente'
    assert body['productos_guardados'] == 1 and entorno[0].query(Producto).count() == 1
    assert entorno[1][-1]['detalle_registros'][0]['estado'] == 'guardado'
    assert 'no exponer secretos' not in json.dumps(body)


def test_fallo_commit_revierte_contadores(monkeypatch, entorno):
    def fallar(): raise OperationalError('sql privado', {}, Exception('secreto'))
    monkeypatch.setattr(entorno[0], 'commit', fallar)
    estado, body = ejecutar(monkeypatch, entorno, [producto()])
    assert estado == 500 and body['productos_guardados'] == 0 and body['fallidos'] == 1
    assert entorno[0].query(Producto).count() == 0
    assert entorno[1][-1]['estado_guardado'] == 'revertido'
    assert entorno[1][-1]['detalle_registros'][0]['estado'] == 'fallido'
    assert not entorno[2]


def test_530_y_consulta_no_recibe_registros(monkeypatch, entorno):
    response = httpx.Response(530, headers={'server': 'cloudflare'}, text='error code: 1033', request=httpx.Request('GET', 'https://example.com'))
    def fallar(*a): response.raise_for_status()
    monkeypatch.setattr(sync, 'consultar_productos_lina', fallar)
    respuesta = sync._sincronizar('productos', entorno[0], SimpleNamespace(id=1))
    assert respuesta.status_code == 502
    ev = entorno[1][-1]
    assert ev['registros_recibidos'] is None
    assert ev['diagnostico_codigo'] == 'cloudflare_1033'
    assert not entorno[2]


def test_formato_invalido(monkeypatch, entorno):
    monkeypatch.setattr(sync, 'consultar_productos_lina', lambda *a: {'otra_clave': []})
    respuesta = sync._sincronizar('productos', entorno[0], SimpleNamespace(id=1))
    assert respuesta.status_code == 502
    assert entorno[1][-1]['diagnostico_codigo'] == 'formato_invalido'


def test_detalle_acotado_contadores_totales(monkeypatch, entorno):
    estado, body = ejecutar(monkeypatch, entorno, [producto(f'P{i}', i+1) for i in range(205)])
    assert estado == 200 and body['productos_guardados'] == 205
    assert len(entorno[1][-1]['detalle_registros']) == 200 and entorno[1][-1]['detalle_total'] == 205


def test_proveedor_no_guarda_contactos_en_auditoria(monkeypatch, entorno):
    monkeypatch.setattr(sync, 'consultar_proveedores_lina', lambda *a: {'proveedores': [{'id': 2, 'razonSocial': 'Proveedor A', 'email': 'privado@example.com'}]})
    respuesta = sync._sincronizar('proveedores', entorno[0], SimpleNamespace(id=1))
    assert respuesta.status_code == 200
    assert entorno[2] == [([], [2])]
    assert 'privado@example.com' not in json.dumps(entorno[1], default=str)


def app_auditoria(db):
    app = FastAPI(); app.include_router(audit.router)
    app.dependency_overrides[audit.get_current_user] = lambda: SimpleNamespace(rol='admin')
    app.dependency_overrides[audit.get_db] = lambda: db
    return app


class DBRespuesta:
    def __init__(self, rows): self.rows = rows; self.sql = ''; self.params = {}
    def execute(self, sql, params): self.sql = str(sql); self.params = params; return self
    def mappings(self): return self
    def all(self): return self.rows


def test_fechas_validas_e_invalidas():
    db = DBRespuesta([]); client = TestClient(app_auditoria(db))
    assert client.get('/auditoria/integracion?desde=2026-10-01T00:00:00-05:00').status_code == 422
    assert client.get('/auditoria/integracion?desde=2026-10-02T00:00:00-05:00&hasta=2026-10-01T00:00:00-05:00').status_code == 422
    assert client.get('/auditoria/integracion?desde=2026-01-01T00:00:00-05:00&hasta=2026-10-01T00:00:00-05:00').status_code == 422
    assert client.get('/auditoria/integracion?desde=2026-10-01T00:00:00-05:00&hasta=2026-10-02T00:00:00-05:00').status_code == 200
    assert 'fecha < :hasta' in db.sql


def test_traza_sin_filtros_y_autorizacion():
    db = DBRespuesta([{'id': 1}]); app = app_auditoria(db); client = TestClient(app)
    ident = '00000000-0000-0000-0000-000000000001'
    r = client.get(f'/auditoria/integracion/traza/{ident}?resultado=exito&horas=1')
    assert r.status_code == 200 and r.json()['eventos'] == [{'id': 1}]
    assert db.params == {'correlacion': ident}
    assert 'fecha >=' not in db.sql
    app.dependency_overrides[audit.get_current_user] = lambda: SimpleNamespace(rol='almacen')
    assert client.get(f'/auditoria/integracion/traza/{ident}').status_code == 403
    assert client.get('/auditoria/integracion/exportar').status_code == 403


def test_exportar_todos_no_solo_pagina_y_formula_segura():
    class Fila(dict):
        def __missing__(self, key): return None
    db = DBRespuesta([Fila(id=i, operacion='=HYPERLINK("test")') for i in range(73)])
    client = TestClient(app_auditoria(db))
    r = client.get('/auditoria/integracion/exportar?direccion=saliente')
    assert r.status_code == 200
    assert len(r.text.splitlines()) == 74
    assert "'=HYPERLINK" in r.text
    assert db.params['direccion'] == 'saliente'
    db.rows = [{}] * 50001
    assert client.get('/auditoria/integracion/exportar').status_code == 413
