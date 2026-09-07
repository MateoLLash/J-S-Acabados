import re
import time
import logging
import requests
from bs4 import BeautifulSoup
from decimal import Decimal, InvalidOperation
from sqlalchemy.orm import Session

from app.models.competencia import Competidor, ProductoCompetidor, HistoricoPrecioCompetencia

logger = logging.getLogger("scraper")

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "es-PE,es;q=0.9",
}
DELAY_ENTRE_REQUESTS = 2.5  # segundos — no golpear su servidor de golpe
TIMEOUT = 15

PRECIO_REGEX = re.compile(r"S/\s?([\d]+(?:[.,]\d+)?)")


def _parsear_precio(texto: str) -> Decimal | None:
    """'S/47.37' -> Decimal('47.37'). Devuelve None si no logra parsear."""
    if not texto:
        return None
    limpio = texto.replace("S/", "").replace(",", "").strip()
    try:
        return Decimal(limpio)
    except InvalidOperation:
        return None


def _extraer_precios(texto: str) -> list[Decimal]:
    """
    Busca todos los montos 'S/XX.XX' dentro de un bloque de texto y los
    devuelve como Decimal únicos (sin duplicados). WooCommerce suele repetir
    el mismo monto dos veces por accesibilidad ("El precio original era:
    S/59.00. S/47.37 El precio actual es: S/47.37."), así que deduplicamos.
    """
    vistos: list[Decimal] = []
    for match in PRECIO_REGEX.findall(texto):
        valor = _parsear_precio(f"S/{match}")
        if valor is not None and valor not in vistos:
            vistos.append(valor)
    return vistos


def _productos_via_selectores_clasicos(soup: BeautifulSoup) -> list[dict]:
    """Intento 1: estructura clásica de WooCommerce (ul.products li.product)."""
    productos = []
    tarjetas = soup.select("ul.products li.product")

    for tarjeta in tarjetas:
        link_tag = tarjeta.select_one(
            "a.woocommerce-LoopProduct-link, a.woocommerce-loop-product__link"
        )
        nombre_tag = tarjeta.select_one(".woocommerce-loop-product__title")
        precio_bloque = tarjeta.select_one("span.price")

        if not (link_tag and nombre_tag and precio_bloque):
            continue

        precios = _extraer_precios(precio_bloque.get_text(" ", strip=True))
        if not precios:
            continue

        categorias_tag = tarjeta.get("class", [])
        categoria = next(
            (c.replace("product_cat-", "") for c in categorias_tag if c.startswith("product_cat-")),
            None,
        )

        productos.append({
            "nombre": nombre_tag.get_text(strip=True),
            "precio": min(precios),
            "precio_original": max(precios) if len(precios) > 1 else None,
            "categoria": categoria,
            "url": link_tag.get("href", "").strip(),
        })

    return productos


def _productos_via_enlaces_carrito(soup: BeautifulSoup) -> list[dict]:
    """
    Intento 2 (fallback): en vez de adivinar las clases CSS del tema o del
    constructor de páginas (Elementor, etc.), ubica cada botón "Añadir al
    carrito" —siempre trae ?add-to-cart=<id_producto> en WooCommerce, sin
    importar el theme— y sube por los padres hasta encontrar el contenedor
    que agrupa título + precio. Esto sobrevive a rediseños del sitio porque
    no depende de nombres de clase específicos.
    """
    productos = []
    vistos_urls = set()

    enlaces_carrito = soup.select('a[href*="add-to-cart="]')

    for enlace in enlaces_carrito:
        contenedor = enlace
        info = None

        for _ in range(6):  # sube hasta 6 niveles buscando título + precio juntos
            contenedor = contenedor.parent
            if contenedor is None:
                break

            heading = contenedor.find(["h1", "h2", "h3", "h4"])
            a_titulo = heading.find("a", href=True) if heading else None
            precios = _extraer_precios(contenedor.get_text(" ", strip=True))

            if a_titulo and precios:
                info = (a_titulo, precios, contenedor)
                break

        if info is None:
            continue

        a_titulo, precios, contenedor = info
        url_producto = a_titulo.get("href", "").strip()

        if not url_producto or url_producto in vistos_urls:
            continue
        vistos_urls.add(url_producto)

        categoria = None
        for clase in contenedor.get("class", []):
            if clase.startswith("product_cat-"):
                categoria = clase.replace("product_cat-", "")
                break

        productos.append({
            "nombre": a_titulo.get_text(strip=True),
            "precio": min(precios),
            "precio_original": max(precios) if len(precios) > 1 else None,
            "categoria": categoria,
            "url": url_producto,
        })

    return productos


def _scrapear_pagina(url: str) -> tuple[list[dict], bool]:
    """Extrae los productos de una página de listado del competidor."""
    resp = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    productos = _productos_via_selectores_clasicos(soup)
    metodo = "clásico"

    if not productos:
        productos = _productos_via_enlaces_carrito(soup)
        metodo = "fallback (enlaces de carrito)"

    if not productos:
        logger.warning(
            f"0 productos detectados en {url} (status {resp.status_code}, "
            f"{len(resp.text)} bytes). Guardando HTML en debug_pagina.html para revisar."
        )
        try:
            with open("debug_pagina.html", "w", encoding="utf-8") as f:
                f.write(resp.text)
        except OSError as e:
            logger.error(f"No se pudo guardar debug_pagina.html: {e}")
    else:
        logger.info(f"{len(productos)} productos detectados en {url} (método: {metodo})")

    hay_siguiente = soup.select_one("a.next.page-numbers") is not None

    return productos, hay_siguiente


def scrapear_competidor(db: Session, competidor: Competidor, max_paginas: int = 20):
    """
    Recorre el catálogo del competidor página por página, guarda/actualiza
    cada producto y agrega una fila al histórico de precios.
    Devuelve un resumen para loguear/mostrar.
    """
    total_nuevos = 0
    total_actualizados = 0
    total_sin_cambio = 0
    pagina = 1

    while pagina <= max_paginas:
        url = competidor.url_base.rstrip("/") + ("/tienda/" if pagina == 1 else f"/tienda/page/{pagina}/")
        logger.info(f"Scrapeando {url}")

        try:
            productos, hay_siguiente = _scrapear_pagina(url)
        except requests.RequestException as e:
            logger.error(f"Error al pedir {url}: {e}")
            break

        if not productos:
            break

        for p in productos:
            existente = (
                db.query(ProductoCompetidor)
                .filter_by(competidor_id=competidor.id, url_producto=p["url"])
                .first()
            )

            if existente is None:
                nuevo = ProductoCompetidor(
                    competidor_id=competidor.id,
                    nombre_scrapeado=p["nombre"],
                    precio=p["precio"],
                    precio_original=p["precio_original"],
                    categoria=p["categoria"],
                    url_producto=p["url"],
                )
                db.add(nuevo)
                db.flush()  # para tener nuevo.id antes del commit
                db.add(HistoricoPrecioCompetencia(producto_competidor_id=nuevo.id, precio=p["precio"]))
                total_nuevos += 1
            elif existente.precio != p["precio"]:
                existente.precio = p["precio"]
                existente.precio_original = p["precio_original"]
                db.add(HistoricoPrecioCompetencia(producto_competidor_id=existente.id, precio=p["precio"]))
                total_actualizados += 1
            else:
                total_sin_cambio += 1

        db.commit()

        if not hay_siguiente:
            break

        pagina += 1
        time.sleep(DELAY_ENTRE_REQUESTS)  # pausa entre páginas, no saturar su servidor

    resumen = {
        "competidor": competidor.nombre,
        "paginas_recorridas": pagina,
        "nuevos": total_nuevos,
        "actualizados": total_actualizados,
        "sin_cambio": total_sin_cambio,
    }
    logger.info(f"Resumen scraping: {resumen}")
    return resumen