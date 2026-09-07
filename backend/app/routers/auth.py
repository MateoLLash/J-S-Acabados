from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import text  # <-- IMPORTANTE: importar text

from app.database import get_db
from app.models.usuario import Usuario
from app.schemas.usuario import LoginRequest, Token
from app.auth.security import verify_password
from app.auth.jwt_handler import create_access_token

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=Token)
def login(data: LoginRequest, db: Session = Depends(get_db)):
    usuario = db.query(Usuario).filter(Usuario.email == data.email).first()

    if usuario is None or not verify_password(data.password, usuario.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email o contraseña incorrectos",
        )

    if usuario.estado != "activo":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Usuario inactivo")

    usuario.ultimo_login = datetime.now(timezone.utc)
    
    # ---> AQUÍ AVISAMOS A POSTGRESQL QUIÉN ACTUALIZA EL LOGIN <---
    try:
        db.execute(text("SELECT set_config('app.current_user_id', :user_id, true)"), {"user_id": str(usuario.id)})
        db.commit()
    finally:
        # Limpieza obligatoria
        db.execute(text("SELECT set_config('app.current_user_id', '', true)"))

    token = create_access_token({"sub": str(usuario.id), "rol": usuario.rol})
    return Token(access_token=token, usuario=usuario)