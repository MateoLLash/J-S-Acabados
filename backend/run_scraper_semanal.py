"""
Script standalone: corre el scraping de todos los competidores activos.

Uso manual:
    python run_scraper_semanal.py

Para automatizarlo semanalmente en Windows:
    1. Abre "Programador de tareas" (Task Scheduler).
    2. Crear tarea básica -> Semanal, el día/hora que prefieras.
    3. Acción: "Iniciar un programa"
       Programa: C:\\Users\\MATEO\\Downloads\\inventario\\inventario\\backend\\venv\\Scripts\\python.exe
       Argumentos: run_scraper_semanal.py
       Iniciar en: C:\\Users\\MATEO\\Downloads\\inventario\\inventario\\backend
"""
import logging
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models.competencia import Competidor
from app.services.scraper_service import scrapear_competidor

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler("scraper.log", encoding="utf-8"),
        logging.StreamHandler(),
    ],
)
logger = logging.getLogger("run_scraper_semanal")


def main():
    db = SessionLocal()
    try:
        competidores = db.query(Competidor).filter_by(activo=True).all()
        if not competidores:
            logger.warning("No hay competidores activos configurados en la tabla 'competidores'.")
            return

        for competidor in competidores:
            resumen = scrapear_competidor(db, competidor)
            logger.info(f"OK -> {resumen}")
    finally:
        db.close()


if __name__ == "__main__":
    main()