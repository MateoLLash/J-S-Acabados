import os
import time
import uuid
from datetime import datetime, timezone

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
    tam_req = None
    content_req = content_resp = None
    request_id = str(uuid.uuid4())
    correlacion_id = correlacion_id or request_id
    fecha = datetime.now(timezone.utc)
    resultado = "exito"
    error_tipo = None
    error_mensaje = None
    inicio = time.perf_counter()

    try:
        if not llave:
            raise RuntimeError("LINA_INTEGRATION_KEY no está configurada en el entorno")

        with httpx.Client(timeout=timeout) as client:
            request = client.build_request(
                metodo, url, headers={"X-Integration-Key": llave, "X-Request-ID": request_id}, json=body
            )
            tam_req = len(request.content)
            content_req = request.headers.get('content-type')
            resp = client.send(request)
        status_code = resp.status_code
        tam_resp = len(resp.content)
        content_resp = resp.headers.get('content-type')
        resp.raise_for_status()
        return resp.json()

    except httpx.TimeoutException as exc:
        resultado, error_tipo, error_mensaje = "timeout", type(exc).__name__, "Se superó el tiempo de espera configurado."
        raise
    except Exception as exc:
        resultado = clasificar_status(status_code) if status_code and status_code >= 400 else "error"
        error_tipo, error_mensaje = type(exc).__name__, "La llamada externa no pudo completarse o devolvió una respuesta no válida."
        raise
    finally:
        registrar_evento(
            fecha=fecha, fecha_fin=datetime.now(timezone.utc), request_id=request_id,
            alcance_duracion='cliente_http_y_decodificacion', endpoint_plantilla=ruta,
            content_type_request=content_req, content_type_respuesta=content_resp,
            timeout_config_ms=round(timeout * 1000),
            correlacion_id=correlacion_id,
            direccion="saliente",
            sistema="lina",
            operacion=operacion,
            metodo=metodo,
            endpoint=ruta,
            status_code=status_code,
            resultado=resultado,
            duracion_ms=round((time.perf_counter() - inicio) * 1000, 3),
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