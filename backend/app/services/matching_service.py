import re
import logging
import unicodedata
from difflib import SequenceMatcher
from sqlalchemy.orm import Session

from app.models.producto import Producto
from app.models.competencia import ProductoCompetidor, ProductoMatch

logger = logging.getLogger("matching")

# Umbral alto = vincula solo si está muy seguro (se marca confirmado).
UMBRAL_AUTO_CONFIRMADO = 0.82
# Umbral medio = crea el vínculo pero lo deja pendiente de tu revisión.
UMBRAL_SUGERENCIA = 0.68

# Palabras que aparecen en casi todos los nombres y no ayudan a distinguir
# un producto de otro — las quitamos para que no inflen la similitud.
PALABRAS_RUIDO = {
    "de", "el", "la", "los", "las", "y", "con", "para", "cm", "mt2", "m2",
    "caja", "und", "unidad", "x", "kg", "rect", "rectificado",
}

MEDIDA_REGEX = re.compile(r"(\d+\s*[x×]\s*\d+)")


def _normalizar(texto: str) -> str:
    """minúsculas, sin tildes, sin signos, sin palabras de relleno."""
    if not texto:
        return ""
    texto = texto.lower()
    texto = unicodedata.normalize("NFKD", texto)
    texto = "".join(c for c in texto if not unicodedata.combining(c))
    texto = re.sub(r"[^a-z0-9\s]", " ", texto)
    palabras = [p for p in texto.split() if p and p not in PALABRAS_RUIDO]
    return " ".join(palabras)


def _extraer_medida(texto: str) -> str | None:
    """'Porcelanato Mate Beige 60X60' -> '60x60'. Devuelve None si no hay."""
    if not texto:
        return None
    match = MEDIDA_REGEX.search(texto.lower().replace(" ", ""))
    if not match:
        return None
    return match.group(1).replace("×", "x")


def _similitud(nombre_a: str, nombre_b: str) -> float:
    """
    Puntaje 0..1 entre dos nombres de producto.

    Combina dos señales:
      - similitud de texto completo (orden de palabras incluido)
      - cuántas palabras significativas comparten (independiente del orden)

    Además, si AMBOS nombres declaran una medida y NO coinciden, se penaliza
    fuerte: un 60x60 y un 60x120 son productos distintos aunque el nombre sea
    casi igual, y compararles el precio no tiene sentido.
    """
    a, b = _normalizar(nombre_a), _normalizar(nombre_b)
    if not a or not b:
        return 0.0

    ratio_texto = SequenceMatcher(None, a, b).ratio()

    set_a, set_b = set(a.split()), set(b.split())
    comunes = set_a & set_b
    ratio_palabras = (2 * len(comunes)) / (len(set_a) + len(set_b)) if (set_a or set_b) else 0.0

    puntaje = (ratio_texto * 0.5) + (ratio_palabras * 0.5)

    medida_a, medida_b = _extraer_medida(nombre_a), _extraer_medida(nombre_b)
    if medida_a and medida_b and medida_a != medida_b:
        puntaje *= 0.45

    return puntaje


def generar_matches_automaticos(db: Session, competidor_id: int | None = None) -> dict:
    """
    Recorre tus productos internos contra el catálogo scrapeado y crea los
    vínculos que superen el umbral. Para cada producto competidor elige SOLO
    su mejor candidato (no crea vínculos múltiples contra el mismo).

    - puntaje >= UMBRAL_AUTO_CONFIRMADO  -> vínculo confirmado
    - puntaje >= UMBRAL_SUGERENCIA       -> vínculo pendiente de revisión
    - por debajo                         -> no se crea nada

    Nunca toca ni pisa los vínculos que ya existen (los que hiciste a mano o
    los de una corrida anterior quedan intactos).
    """
    resumen = {
        "revisados": 0,
        "confirmados": 0,
        "sugeridos": 0,
        "sin_coincidencia": 0,
        "ya_existian": 0,
    }

    mis_productos = db.query(Producto).all()
    if not mis_productos:
        resumen["error"] = "No tienes productos internos cargados."
        return resumen

    query = db.query(ProductoCompetidor)
    if competidor_id is not None:
        query = query.filter_by(competidor_id=competidor_id)
    productos_competencia = query.all()

    for pc in productos_competencia:
        resumen["revisados"] += 1

        ya_vinculado = (
            db.query(ProductoMatch)
            .filter_by(producto_competidor_id=pc.id)
            .first()
        )
        if ya_vinculado is not None:
            resumen["ya_existian"] += 1
            continue

        mejor_producto = None
        mejor_puntaje = 0.0

        for mp in mis_productos:
            puntaje = _similitud(mp.nombre, pc.nombre_scrapeado)
            if puntaje > mejor_puntaje:
                mejor_puntaje = puntaje
                mejor_producto = mp

        if mejor_producto is None or mejor_puntaje < UMBRAL_SUGERENCIA:
            resumen["sin_coincidencia"] += 1
            continue

        confirmado = mejor_puntaje >= UMBRAL_AUTO_CONFIRMADO

        db.add(ProductoMatch(
            producto_id=mejor_producto.id,
            producto_competidor_id=pc.id,
            confirmado_por_usuario=confirmado,
        ))

        if confirmado:
            resumen["confirmados"] += 1
        else:
            resumen["sugeridos"] += 1

        logger.info(
            f"Match {'confirmado' if confirmado else 'sugerido'} "
            f"({mejor_puntaje:.2f}): '{mejor_producto.nombre}' <-> '{pc.nombre_scrapeado}'"
        )

    db.commit()
    logger.info(f"Resumen matching automático: {resumen}")
    return resumen