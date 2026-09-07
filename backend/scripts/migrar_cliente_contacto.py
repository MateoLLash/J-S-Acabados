"""
Migración: agrega a la tabla `clientes` las columnas `email` y `direccion`
que necesita la tienda online para guardar los datos de contacto y entrega
del cliente al momento de generar un pedido (boleta/factura).

Base.metadata.create_all() (en app/main.py) solo crea tablas que no
existen, NO altera tablas ya existentes. Como este proyecto no usa
Alembic, corremos este script una sola vez para agregar las columnas
nuevas a la tabla `clientes` que ya tienes en MySQL.

Uso:
    cd backend
    python -m scripts.migrar_cliente_contacto
"""

from sqlalchemy import text
from app.database import engine

COLUMNAS_NUEVAS = [
    ("email", "ALTER TABLE clientes ADD COLUMN email VARCHAR(120) NULL"),
    ("direccion", "ALTER TABLE clientes ADD COLUMN direccion VARCHAR(255) NULL"),
]


def columna_existe(conn, nombre_columna: str) -> bool:
    resultado = conn.execute(
        text(
            "SELECT COUNT(*) FROM information_schema.columns "
            "WHERE table_schema = DATABASE() AND table_name = 'clientes' AND column_name = :col"
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
        print("\nMigración completada. La tabla 'clientes' ya tiene las columnas de contacto.")


if __name__ == "__main__":
    main()
