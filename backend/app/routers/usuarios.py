from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text  # <-- IMPORTANTE: Agregar la importación

from app.database import get_db
from app.models.usuario import Usuario
from app.schemas.usuario import UsuarioCreate, UsuarioOut
from app.auth.security import hash_password
from app.auth.dependencies import require_admin

router = APIRouter(prefix="/usuarios", tags=["usuarios"])


@router.get("/", response_model=List[UsuarioOut])
def listar_usuarios(db: Session = Depends(get_db), _=Depends(require_admin)):
    return db.query(Usuario).all()


@router.post("/", response_model=UsuarioOut, status_code=201)
def crear_usuario(data: UsuarioCreate, db: Session = Depends(get_db), admin_user=Depends(require_admin)): # <-- Cambiado de _ a admin_user
    if db.query(Usuario).filter(Usuario.email == data.email).first():
        raise HTTPException(status_code=400, detail="Ese email ya está registrado")

    usuario = Usuario(
        nombre=data.nombre,
        email=data.email,
        password_hash=hash_password(data.password),
        rol=data.rol,
    )
    db.add(usuario)
    
    # ---> AQUÍ AVISAMOS A POSTGRESQL QUIÉN CREA EL USUARIO <---
    try:
        db.execute(text("SELECT set_config('app.current_user_id', :user_id, true)"), {"user_id": str(admin_user.id)})
        db.commit()
        db.refresh(usuario)
        return usuario
    finally:
        db.execute(text("SELECT set_config('app.current_user_id', '', true)"))


@router.patch("/{usuario_id}/estado", response_model=UsuarioOut)
def cambiar_estado(usuario_id: int, estado: str, db: Session = Depends(get_db), admin_user=Depends(require_admin)): # <-- Cambiado de _ a admin_user
    usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    if usuario is None:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if estado not in ("activo", "inactivo"):
        raise HTTPException(status_code=400, detail="Estado inválido")

    # ---> AQUÍ AVISAMOS A POSTGRESQL QUIÉN MODIFICA EL ESTADO <---
    try:
        db.execute(text("SELECT set_config('app.current_user_id', :user_id, true)"), {"user_id": str(admin_user.id)})
        usuario.estado = estado
        db.commit()
        db.refresh(usuario)
        return usuario
    finally:
        db.execute(text("SELECT set_config('app.current_user_id', '', true)"))