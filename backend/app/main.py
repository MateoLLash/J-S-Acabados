import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app import models
from app.database import engine, Base
from app.routers import auth, usuarios, productos, catalogos, inventario, compras, ventas , reportes, analitica, tienda
from app.routers import competencia  # Importa el router

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

# --- Fotos de productos ---
# Carpeta física: backend/app/uploads/  ->  URL pública: http://localhost:8000/static/<archivo>
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/static", StaticFiles(directory=UPLOAD_DIR), name="static")


@app.get("/")
def health_check():
    return {"status": "ok"}