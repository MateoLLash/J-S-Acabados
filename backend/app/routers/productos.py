import os
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, File, UploadFile
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_, text
import aiofiles

from app.database import get_db
from app.models.producto import Producto
from app.schemas.producto import ProductoCreate, ProductoUpdate, ProductoOut
from app.auth.dependencies import get_current_user

router = APIRouter(prefix="/productos", tags=["productos"])

# --- Configuración de fotos de producto ---
# backend/app/routers/productos.py -> dirname -> app/routers -> dirname -> app/
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

EXTENSIONES_PERMITIDAS = {".jpg", ".jpeg", ".png", ".webp"}
TAMANO_MAXIMO_MB = 5


@router.get("/", response_model=List[ProductoOut])
def listar_productos(
    q: Optional[str] = Query(None, description="Busca por código o nombre"),
    stock_bajo: bool = Query(False, description="Solo productos bajo su stock mínimo"),
    categoria_id: Optional[int] = Query(None, description="Filtra por categoría"),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    query = db.query(Producto).options(joinedload(Producto.marca), joinedload(Producto.categoria))
    if q:
        query = query.filter(or_(Producto.codigo.ilike(f"%{q}%"), Producto.nombre.ilike(f"%{q}%")))
    if stock_bajo:
        query = query.filter(Producto.stock <= Producto.stock_minimo)
    if categoria_id:
        query = query.filter(Producto.categoria_id == categoria_id)
    return query.all()


@router.get("/{producto_id}", response_model=ProductoOut)
def obtener_producto(producto_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    producto = db.query(Producto).filter(Producto.id == producto_id).first()
    if producto is None:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    return producto


@router.post("/", response_model=ProductoOut, status_code=201)
def crear_producto(data: ProductoCreate, db: Session = Depends(get_db), usuario_actual=Depends(get_current_user)):
    if db.query(Producto).filter(Producto.codigo == data.codigo).first():
        raise HTTPException(status_code=400, detail="Ese código de producto ya existe")

    producto = Producto(**data.model_dump())
    db.add(producto)
    
    try:
        db.execute(text("SELECT set_config('app.current_user_id', :user_id, true)"), {"user_id": str(usuario_actual.id)})
        db.commit()
        db.refresh(producto)
        return producto
    finally:
        db.execute(text("SELECT set_config('app.current_user_id', '', true)"))


@router.put("/{producto_id}", response_model=ProductoOut)
def actualizar_producto(
    producto_id: int, 
    data: ProductoUpdate, 
    db: Session = Depends(get_db), 
    usuario_actual = Depends(get_current_user)
):
    producto = db.query(Producto).filter(Producto.id == producto_id).first()
    if producto is None:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    try:
        db.execute(text("SELECT set_config('app.current_user_id', :user_id, true)"), {"user_id": str(usuario_actual.id)})
        
        for campo, valor in data.model_dump(exclude_unset=True).items():
            setattr(producto, campo, valor)

        db.commit()
        db.refresh(producto)
        return producto
    finally:
        db.execute(text("SELECT set_config('app.current_user_id', '', true)"))


@router.delete("/{producto_id}", status_code=204)
def eliminar_producto(producto_id: int, db: Session = Depends(get_db), usuario_actual = Depends(get_current_user)):
    producto = db.query(Producto).filter(Producto.id == producto_id).first()
    if producto is None:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
        
    try:
        db.execute(text("SELECT set_config('app.current_user_id', :user_id, true)"), {"user_id": str(usuario_actual.id)})
        db.delete(producto)
        db.commit()
    finally:
        db.execute(text("SELECT set_config('app.current_user_id', '', true)"))


def _borrar_archivo_si_existe(imagen_url: Optional[str]) -> None:
    """Borra el archivo físico de una imagen previa para no acumular huérfanos en /uploads."""
    if not imagen_url:
        return
    ruta = os.path.join(UPLOAD_DIR, os.path.basename(imagen_url))
    if os.path.exists(ruta):
        os.remove(ruta)


@router.post("/{producto_id}/imagen", response_model=ProductoOut)
async def subir_imagen_producto(
    producto_id: int,
    imagen: UploadFile = File(...),
    db: Session = Depends(get_db),
    usuario_actual = Depends(get_current_user),
):
    """Sube (o reemplaza) la foto de un producto. Espera multipart/form-data con el campo 'imagen'."""
    producto = db.query(Producto).filter(Producto.id == producto_id).first()
    if producto is None:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    extension = os.path.splitext(imagen.filename or "")[1].lower()
    if extension not in EXTENSIONES_PERMITIDAS:
        raise HTTPException(status_code=400, detail="Formato de imagen no permitido. Usa JPG, PNG o WEBP.")

    contenido = await imagen.read()
    if len(contenido) > TAMANO_MAXIMO_MB * 1024 * 1024:
        raise HTTPException(status_code=400, detail=f"La imagen no puede pesar más de {TAMANO_MAXIMO_MB}MB.")

    # Si ya tenía una foto, la reemplazamos (borramos la anterior del disco)
    _borrar_archivo_si_existe(producto.imagen_url)

    nombre_archivo = f"{uuid.uuid4().hex}{extension}"
    ruta_destino = os.path.join(UPLOAD_DIR, nombre_archivo)
    async with aiofiles.open(ruta_destino, "wb") as f:
        await f.write(contenido)

    try:
        db.execute(text("SELECT set_config('app.current_user_id', :user_id, true)"), {"user_id": str(usuario_actual.id)})
        producto.imagen_url = f"/static/{nombre_archivo}"
        db.commit()
        db.refresh(producto)
        return producto
    finally:
        db.execute(text("SELECT set_config('app.current_user_id', '', true)"))


@router.delete("/{producto_id}/imagen", response_model=ProductoOut)
def eliminar_imagen_producto(producto_id: int, db: Session = Depends(get_db), usuario_actual = Depends(get_current_user)):
    """Quita la foto de un producto (deja imagen_url en null y borra el archivo)."""
    producto = db.query(Producto).filter(Producto.id == producto_id).first()
    if producto is None:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    _borrar_archivo_si_existe(producto.imagen_url)
    
    try:
        db.execute(text("SELECT set_config('app.current_user_id', :user_id, true)"), {"user_id": str(usuario_actual.id)})
        producto.imagen_url = None
        db.commit()
        db.refresh(producto)
        return producto
    finally:
        db.execute(text("SELECT set_config('app.current_user_id', '', true)"))