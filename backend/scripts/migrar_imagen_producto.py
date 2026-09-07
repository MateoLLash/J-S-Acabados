"""
Migración: agrega a la tabla `productos` la columna `imagen_url`, usada
para guardar la ruta pública de la foto del producto (servida desde
/static/... en el backend).

Base.metadata.create_all() (en app/main.py) solo crea tablas que no
existen, NO altera tablas ya existentes. Como este proyecto no usa
Alembic, corremos este script una sola vez para agregar la columna
nueva a la tabla `productos` que ya tienes en MySQL.

Uso:
    cd backend
    python -m scripts.migrar_imagen_producto
"""

from sqlalchemy import text
from app.database import engine

COLUMNAS_NUEVAS = [
    ("imagen_url", "ALTER TABLE productos ADD COLUMN imagen_url VARCHAR(255) NULL"),
]


def columna_existe(conn, nombre_columna: str) -> bool:
    resultado = conn.execute(
        text(
            "SELECT COUNT(*) FROM information_schema.columns "
            "WHERE table_schema = DATABASE() AND table_name = 'productos' AND column_name = :col"
        ),
        {"col": nombre_columna},
    )
    return resultado.scalar() > 0


def main():
    with engine.connect() as conn:
        for nombre_columna, sentencia_sql in COLUMNAS_NUEVAS:
            if columna_existe(conn, nombre_columna):
                print(f"[=] La columna '{nombre_columna}' ya existe, se omite.")
                continue
            print(f"[+] Agregando columna '{nombre_columna}'...")
            conn.execute(text(sentencia_sql))
            conn.commit()
        print("\nMigración completada. La tabla 'productos' ya tiene la columna 'imagen_url'.")


if __name__ == "__main__":
    main()
