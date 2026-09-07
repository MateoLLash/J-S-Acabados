"""
Crea el primer usuario admin (necesario porque login exige un usuario
existente, y crear usuarios por API exige ya ser admin).

Uso:
    cd backend
    python -m scripts.crear_admin
"""
from app.database import SessionLocal
from app.models.usuario import Usuario
from app.auth.security import hash_password

if __name__ == "__main__":
    db = SessionLocal()

    nombre = input("Nombre: ")
    email = input("Email: ")
    password = input("Password: ")

    if db.query(Usuario).filter(Usuario.email == email).first():
        print("Ya existe un usuario con ese email.")
    else:
        admin = Usuario(
            nombre=nombre,
            email=email,
            password_hash=hash_password(password),
            rol="admin",
        )
        db.add(admin)
        db.commit()
        print(f"Admin '{nombre}' creado correctamente.")

    db.close()
