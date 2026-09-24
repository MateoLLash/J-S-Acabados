
import os
import httpx
 
URL_WEBHOOK_OTRO_EQUIPO = os.getenv(
    "URL_WEBHOOK_KANARI",
    "https://sistema-del-otro-equipo.com/api/v1/webhooks/cliente-externo",
)
MI_API_KEY_PARA_ELLOS = os.getenv("MI_API_KEY_PARA_KANARI", "clave-que-ellos-me-dieron")
 
 
def notificar_cliente_nuevo(cliente) -> None:
    '''
    Avisa al otro sistema que se creo un cliente nuevo.
    Se ejecuta en background (BackgroundTasks) para no bloquear la respuesta
    ni tumbar tu endpoint si el otro sistema esta caido.
    '''
    payload = {
        "nombre": cliente.nombre,
        "documento": cliente.documento,
        "telefono": cliente.telefono,
        "email": cliente.email,
        "origen": "acabados_js",
    }
    headers = {"X-API-Key": MI_API_KEY_PARA_ELLOS}
 
    try:
        with httpx.Client(timeout=5.0) as client:
            resp = client.post(URL_WEBHOOK_OTRO_EQUIPO, json=payload, headers=headers)
            resp.raise_for_status()
            print(f"[WEBHOOK] Cliente notificado correctamente: {resp.status_code} {resp.json()}")
    except httpx.HTTPError as e:
        print(f"[WEBHOOK] No se pudo notificar al otro sistema: {e}")