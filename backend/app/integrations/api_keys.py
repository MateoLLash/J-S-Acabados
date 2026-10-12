import os
from fastapi import Security, HTTPException, status, Request
from fastapi.security.api_key import APIKeyHeader
 
API_KEY_NAME = "X-API-Key"
api_key_header = APIKeyHeader(name=API_KEY_NAME, auto_error=False)
 
# En producción: variables de entorno en Render, no hardcodeadas.
CLIENTES_AUTORIZADOS = {
    os.getenv("EQUIPO_KANARI_API_KEY", "clave-temporal-kanari"): "lina",
}
 
 
def verificar_api_key(request: Request, api_key: str = Security(api_key_header)) -> str:
    if api_key is None or api_key not in CLIENTES_AUTORIZADOS:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API Key inválida o ausente",
        )
    request.state.sistema_integracion = CLIENTES_AUTORIZADOS[api_key]
    return CLIENTES_AUTORIZADOS[api_key]