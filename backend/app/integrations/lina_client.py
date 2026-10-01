import os
import httpx

LINA_BASE_URL = os.getenv("LINA_BASE_URL", "https://api.apilinaservice.lat")
LINA_INTEGRATION_KEY = os.getenv("LINA_INTEGRATION_KEY")

HEADERS = {"X-Integration-Key": LINA_INTEGRATION_KEY}


def consultar_productos_lina() -> dict:
    with httpx.Client(timeout=10.0) as client:
        resp = client.get(f"{LINA_BASE_URL}/api/v1/integracion/productos", headers=HEADERS)
        resp.raise_for_status()
        return resp.json()


def consultar_proveedores_lina() -> dict:
    with httpx.Client(timeout=10.0) as client:
        resp = client.get(f"{LINA_BASE_URL}/api/v1/integracion/proveedores", headers=HEADERS)
        resp.raise_for_status()
        return resp.json()


def confirmar_recepcion_lina(producto_ids: list[int], proveedor_ids: list[int]) -> dict:
    body = {"productoIds": producto_ids, "proveedorIds": proveedor_ids}
    with httpx.Client(timeout=10.0) as client:
        resp = client.post(
            f"{LINA_BASE_URL}/api/v1/integracion/catalogo/confirmacion",
            headers=HEADERS,
            json=body,
        )
        resp.raise_for_status()
        return resp.json()


def registrar_cliente_en_lina(nombre, documento, telefono, email) -> dict:
    """Reemplaza al webhook viejo de clientes: ahora apunta al dominio fijo y header nuevo."""
    body = {"nombre": nombre, "documento": documento, "telefono": telefono, "email": email}
    with httpx.Client(timeout=5.0) as client:
        resp = client.post(
            f"{LINA_BASE_URL}/api/v1/webhooks/cliente-externo",
            headers=HEADERS,
            json=body,
        )
        resp.raise_for_status()
        return resp.json()