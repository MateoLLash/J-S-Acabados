"""Diagnósticos seguros: nunca incluyen cuerpos, credenciales ni SQL de excepciones."""
import json
import re

import httpx
from sqlalchemy.exc import SQLAlchemyError


def diagnosticar_error(error):
    codigo = None
    if isinstance(error, httpx.TimeoutException):
        codigo, mensaje, accion = 'timeout', 'Lina no respondió dentro del tiempo de espera.', 'Verifica la disponibilidad de Lina antes de volver a intentar.'
    elif isinstance(error, httpx.HTTPStatusError):
        respuesta = error.response
        status = respuesta.status_code
        # Solo extraer un código conocido; no guardar la página de error.
        cloudflare = 'cloudflare' in respuesta.headers.get('server', '').lower()
        if status == 530 and cloudflare and re.search(r'error\s+code\s*:\s*1033\b', respuesta.text[:4096], re.I):
            codigo, mensaje, accion = 'cloudflare_1033', 'El túnel de Cloudflare de Lina no está conectado.', 'Lina debe revisar el proceso cloudflared y el estado de su túnel.'
        elif status in (401, 403):
            codigo, mensaje, accion = 'credencial_rechazada', 'Lina rechazó la credencial o los permisos de integración.', 'Revisa LINA_INTEGRATION_KEY en el backend que ejecutó la llamada.'
        elif status == 429:
            codigo, mensaje, accion = 'limite_solicitudes', 'Lina limitó la cantidad de solicitudes.', 'Espera antes de volver a consultar; evita repetir solicitudes continuamente.'
        elif status >= 500:
            codigo, mensaje, accion = 'servicio_externo', f'El servicio externo devolvió HTTP {status}.', 'Consulta con Lina el estado de su API e informa la hora y el ID de correlación.'
        else:
            codigo, mensaje, accion = 'peticion_rechazada', f'La API externa devolvió HTTP {status}.', 'Comprueba la ruta, el método y el contrato de la integración con Lina.'
    elif isinstance(error, httpx.RequestError):
        codigo, mensaje, accion = 'conexion', 'No fue posible conectar con la API de Lina.', 'Verifica el dominio configurado y la conectividad del servidor.'
    elif isinstance(error, json.JSONDecodeError):
        codigo, mensaje, accion = 'json_invalido', 'La API respondió con un contenido que no es JSON válido.', 'Lina debe revisar la respuesta del endpoint.'
    elif isinstance(error, SQLAlchemyError):
        codigo, mensaje, accion = 'base_datos', 'No se pudo completar el guardado en la base de datos.', 'Revisa los registros del servidor, las restricciones y las migraciones pendientes.'
    elif isinstance(error, RuntimeError) and str(error) == 'LINA_INTEGRATION_KEY no está configurada en el entorno':
        codigo, mensaje, accion = 'configuracion', 'Falta configurar la clave de integración de Lina.', 'Configura LINA_INTEGRATION_KEY en Render o en el entorno local que estás usando.'
    elif isinstance(error, ValueError):
        codigo, mensaje, accion = 'formato_invalido', 'La respuesta no cumple el formato esperado para la integración.', 'Comprueba el contrato de datos y el detalle de registros rechazados.'
    else:
        codigo, mensaje, accion = 'interno', 'Se produjo un error interno durante la operación.', 'Revisa los registros del backend usando el ID de correlación.'
    return {'diagnostico_codigo': codigo, 'error_mensaje': mensaje, 'accion_sugerida': accion}
