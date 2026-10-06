import json as json_lib
import os
import time

import httpx

from app.integrations.auditoria_integracion import registrar_evento, clasificar_status

LINA_BASE_URL = os.getenv("LINA_BASE_URL", "https://api.apilinaservice.lat")
LINA_INTEGRATION_KEY = os.getenv("LINA_INTEGRATION_KEY")


def _llamar_lina(
    operacion: str,
    metodo: str,
    ruta: str,
    *,
    timeout: float,
    body: dict | None = None,
    correlacion_id: str | None = None,
    usuario_id: int | None = None,
) -> dict:
    """Hace la petición a Lina y deja registrada la auditoría (tiempo, estado, tamaños y error)."""
    url = f"{LINA_BASE_URL}{ruta}"
    llave = os.getenv("LINA_INTEGRATION_KEY") or LINA_INTEGRATION_KEY

    status_code = None
    tam_resp = None
    tam_req = len(json_lib.dumps(body).encode()) if body is not None else None
    resultado = "exito"
    error_tipo = None
    error_mensaje = None
    inicio = time.perf_counter()

    try:
        if not llave:
            raise RuntimeError("LINA_INTEGRATION_KEY no está configurada en el entorno")

        with httpx.Client(timeout=timeout) as client:
            resp = client.request(
                metodo, url, headers={"X-Integration-Key": llave}, json=body
            )
        status_code = resp.status_code
        tam_resp = len(resp.content)
        resp.raise_for_status()
        return resp.json()

    except httpx.TimeoutException as exc:
        resultado, error_tipo, error_mensaje = "timeout", type(exc).__name__, str(exc)
        raise
    except Exception as exc:
        resultado = clasificar_status(status_code) if status_code else "error"
        error_tipo, error_mensaje = type(exc).__name__, str(exc)
        raise
    finally:
        registrar_evento(
            correlacion_id=correlacion_id,
            direccion="saliente",
            sistema="lina",
            operacion=operacion,
            metodo=metodo,
            endpoint=ruta,
            status_code=status_code,
            resultado=resultado,
            duracion_ms=int((time.perf_counter() - inicio) * 1000),
            tam_request_bytes=tam_req,
            tam_respuesta_bytes=tam_resp,
            usuario_id=usuario_id,
            error_tipo=error_tipo,
            error_mensaje=error_mensaje,
        )


def consultar_productos_lina(correlacion_id: str | None = None, usuario_id: int | None = None) -> dict:
    return _llamar_lina(
        "productos.listar", "GET", "/api/v1/integracion/productos",
        timeout=10.0, correlacion_id=correlacion_id, usuario_id=usuario_id,
    )


def consultar_proveedores_lina(correlacion_id: str | None = None, usuario_id: int | None = None) -> dict:
    return _llamar_lina(
        "proveedores.listar", "GET", "/api/v1/integracion/proveedores",
        timeout=10.0, correlacion_id=correlacion_id, usuario_id=usuario_id,
    )


def confirmar_recepcion_lina(
    producto_ids: list[int],
    proveedor_ids: list[int],
    correlacion_id: str | None = None,
    usuario_id: int | None = None,
) -> dict:
    body = {"productoIds": producto_ids, "proveedorIds": proveedor_ids}
    return _llamar_lina(
        "catalogo.confirmar", "POST", "/api/v1/integracion/catalogo/confirmacion",
        timeout=10.0, body=body, correlacion_id=correlacion_id, usuario_id=usuario_id,
    )


def registrar_cliente_en_lina(nombre, documento, telefono, email) -> dict:
    """Webhook de clientes nuevos hacia Lina (dominio fijo y header X-Integration-Key)."""
    body = {"nombre": nombre, "documento": documento, "telefono": telefono, "email": email}
    return _llamar_lina(
        "cliente.registrar", "POST", "/api/v1/webhooks/cliente-externo",
        timeout=5.0, body=body,
    )