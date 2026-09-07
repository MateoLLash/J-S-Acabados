"""
Migración: agrega a la tabla `productos` las columnas que usa el
Asistente de Compra (medida, rendimiento_m2, piezas_por_caja).

Base.metadata.create_all() (en app/main.py) solo crea tablas que no
existen, NO altera tablas ya existentes. Como este proyecto no usa
Alembic, corremos este script una sola vez para agregar las columnas
nuevas a la tabla `productos` que ya tienes en MySQL.

Uso:
    cd backend
    python -m scripts.migrar_rendimiento_m2
"""

from sqlalchemy import text
from app.database import engine

COLUMNAS_NUEVAS = [
    ("medida", "ALTER TABLE productos ADD COLUMN medida VARCHAR(30) NULL"),
    ("rendimiento_m2", "ALTER TABLE productos ADD COLUMN rendimiento_m2 DECIMAL(6,2) NULL"),
    ("piezas_por_caja", "ALTER TABLE productos ADD COLUMN piezas_por_caja INT NULL"),
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
        print("\nMigración completada. La tabla 'productos' ya tiene las columnas de rendimiento.")


if __name__ == "__main__":
    main()
