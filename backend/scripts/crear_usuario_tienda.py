"""
Crea el usuario del sistema que queda como "responsable" de las ventas
que entran por la tienda online (la tabla ventas exige un usuario_id).
Este usuario NUNCA inicia sesión, solo sirve para trazabilidad interna.

Uso:
    cd backend
    python -m scripts.crear_usuario_tienda
"""
import secrets

from app.database import SessionLocal
from app.models.usuario import Usuario
from app.auth.security import hash_password
from app.config import TIENDA_USUARIO_EMAIL

if __name__ == "__main__":
    db = SessionLocal()

    if db.query(Usuario).filter(Usuario.email == TIENDA_USUARIO_EMAIL).first():
        print("El usuario de la tienda online ya existe.")
    else:
        usuario = Usuario(
            nombre="Tienda Online",
            email=TIENDA_USUARIO_EMAIL,
            password_hash=hash_password(secrets.token_urlsafe(32)),
            rol="vendedor",
            estado="activo",
        )
        db.add(usuario)
        db.commit()
        print(f"Usuario '{usuario.nombre}' creado (email: {TIENDA_USUARIO_EMAIL}).")

    db.close()