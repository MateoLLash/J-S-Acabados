import asyncio
import os
import time
import uuid
from functools import partial

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app import models
from app.database import engine, Base
from app.routers import auth, usuarios, productos, catalogos, inventario, compras, ventas , reportes, analitica, tienda, guias
from app.routers import competencia  # Importa el router
from app.routers import integracion  # nuevo import
from app.routers import sincronizacion
from app.routers import auditoria_integracion  # auditoría de la integración
from app.integrations.api_keys import CLIENTES_AUTORIZADOS
from app.integrations.auditoria_integracion import registrar_evento, clasificar_status

# Crea las tablas si no existen (no reemplaza al schema.sql, es solo un respaldo)
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Sistema de gestión de inventario")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://localhost:5175"],  # Vite dev servers (ERP + tienda)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def auditar_integracion_entrante(request: Request, call_next):
    """Audita cada llamada que el otro sistema hace a /api/v1/* (tiempo, estado, quién llamó).

    No audita /api/v1/sync: esas son acciones internas de nuestros usuarios y ya se
    registran en lina_client.py y en sincronizacion.py.
    """
    ruta = request.url.path
    if not ruta.startswith("/api/v1/") or ruta.startswith("/api/v1/sync"):
        return await call_next(request)

    correlacion_id = str(uuid.uuid4())
    inicio = time.perf_counter()
    status_code = None
    tam_resp = None
    error_tipo = error_mensaje = None

    try:
        response = await call_next(request)
        status_code = response.status_code
        tam_resp = int(response.headers.get("content-length", 0)) or None
        response.headers["X-Request-ID"] = correlacion_id
        return response
    except Exception as exc:
        status_code = 500
        error_tipo, error_mensaje = type(exc).__name__, str(exc)
        raise
    finally:
        duracion_ms = int((time.perf_counter() - inicio) * 1000)
        route = request.scope.get("route")
        plantilla = getattr(route, "path", ruta)  # ej. /api/v1/productos/{producto_id}
        sistema = CLIENTES_AUTORIZADOS.get(request.headers.get("x-api-key"), "desconocido")
        ip = (request.headers.get("x-forwarded-for", "").split(",")[0].strip()
              or (request.client.host if request.client else None))
        tam_req = int(request.headers.get("content-length", 0)) or None

        # Se guarda en segundo plano para no sumar latencia a la respuesta
        asyncio.get_running_loop().run_in_executor(None, partial(
            registrar_evento,
            correlacion_id=correlacion_id,
            direccion="entrante",
            sistema=sistema,
            operacion=f"{request.method} {plantilla}",
            metodo=request.method,
            endpoint=ruta,
            status_code=status_code,
            resultado=clasificar_status(status_code),
            duracion_ms=duracion_ms,
            tam_request_bytes=tam_req,
            tam_respuesta_bytes=tam_resp,
            ip_origen=ip,
            user_agent=request.headers.get("user-agent"),
            error_tipo=error_tipo,
            error_mensaje=error_mensaje,
        ))


app.include_router(reportes.router)
app.include_router(auth.router)
app.include_router(usuarios.router)
app.include_router(productos.router)
app.include_router(catalogos.router)
app.include_router(inventario.router)
app.include_router(compras.router)
app.include_router(ventas.router)
app.include_router(analitica.router)
app.include_router(tienda.router)
app.include_router(competencia.router)
app.include_router(guias.router)
app.include_router(integracion.router)
app.include_router(sincronizacion.router)
app.include_router(auditoria_integracion.router)

# --- Fotos de productos ---
# Carpeta física: backend/app/uploads/  ->  URL pública: http://localhost:8000/static/<archivo>
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/static", StaticFiles(directory=UPLOAD_DIR), name="static")


@app.get("/")
def health_check():
    return {"status": "ok"}