import re
import time
import logging
import json
import traceback
import requests
from bs4 import BeautifulSoup
from decimal import Decimal, InvalidOperation
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from sqlalchemy.orm import Session

from app.models.competencia import Competidor, ProductoCompetidor, HistoricoPrecioCompetencia

logger = logging.getLogger("scraper")

try:
    from playwright.sync_api import sync_playwright
    PLAYWRIGHT_DISPONIBLE = True
except ImportError:
    PLAYWRIGHT_DISPONIBLE = False
    logger.warning(
        "Playwright no está instalado. Los sitios que renderizan su catálogo "
        "con JavaScript no se podrán scrapear hasta que corras: pip install playwright && playwright install chromium"
    )

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "es-PE,es;q=0.9,en;q=0.8",
}
DELAY_ENTRE_REQUESTS = 2.5
TIMEOUT = 15
TIMEOUT_NAVEGADOR_MS = 25000

PRECIO_REGEX = re.compile(r"S/\s?([\d]+(?:[.,]\d+)?)")
CATEGORIA_MAX_LEN = 120

# Configuración de categorías por dominio para asegurar un recorrido completo por secciones
CATEGORIAS_POR_COMPETIDOR = {
    "marketceramico.com": {
        "ruta_categoria": "categoria-producto",
        "categorias": [
            ("Porcelanato", "porcelanatos"),   # bug corregido: era "porcelanato"
            ("Cerámico", "ceramico"),
            ("Pegamentos", "pegamentos"),        # este sitio agrupa pegamentos+fraguas aquí
            ("Complementos Decorativos", "complementos"),
        ],
    },
    "rossello.com.pe": {
        "ruta_categoria": "product-category",
        "categorias": [
            ("Porcelanato", "porcelanatos"),
            ("Cerámico", "ceramicos"),
            ("Pegamentos", "complementos/pegamentos-complementos"),
            ("Fraguas", "complementos/fraguas"),
        ],
    },
}

CANDIDATOS_RUTA_TIENDA = [
    "/tienda/",
    "/shop/",
    "/productos/",
    "/catalogo/",
    "",
]


def _dominio(url_base: str) -> str:
    return url_base.replace("https://", "").replace("http://", "").rstrip("/")


def _crear_sesion() -> requests.Session:
    sesion = requests.Session()
    reintentos = Retry(
        total=3,
        backoff_factor=1.5,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET"],
    )
    adaptador = HTTPAdapter(max_retries=reintentos)
    sesion.mount("https://", adaptador)
    sesion.mount("http://", adaptador)
    return sesion


def _obtener_html_estatico(session: requests.Session, url: str) -> str | None:
    try:
        resp = session.get(url, headers=HEADERS, timeout=TIMEOUT)
        resp.raise_for_status()
        return resp.text
    except requests.RequestException as e:
        logger.warning(f"Fetch estático falló en {url}: {e}")
        return None


def _obtener_html_con_navegador(url: str) -> str | None:
    if not PLAYWRIGHT_DISPONIBLE:
        return None
    try:
        with sync_playwright() as p:
            navegador = p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-setuid-sandbox"])
            try:
                pagina = navegador.new_page(user_agent=HEADERS["User-Agent"])
                pagina.goto(url, timeout=TIMEOUT_NAVEGADOR_MS, wait_until="networkidle")
                pagina.wait_for_timeout(1500)
                return pagina.content()
            finally:
                navegador.close()
    except Exception as e:
        logger.warning(f"Playwright no pudo renderizar {url}: {e}")
        return None


def _parsear_precio(texto: str) -> Decimal | None:
    if not texto:
        return None
    limpio = texto.replace("S/", "").replace(",", "").strip()
    try:
        return Decimal(limpio)
    except InvalidOperation:
        return None


def _extraer_precios(texto: str) -> list[Decimal]:
    vistos: list[Decimal] = []
    for match in PRECIO_REGEX.findall(texto):
        valor = _parsear_precio(f"S/{match}")
        if valor is not None and valor not in vistos:
            vistos.append(valor)
    return vistos


def _extraer_categoria(clases: list[str]) -> str | None:
    categorias = []
    for clase in clases:
        if clase.startswith("product_cat-") and clase not in categorias:
            categorias.append(clase.replace("product_cat-", "").replace("-", " "))
    if not categorias:
        return None
    resultado = ", ".join(categorias)
    if len(resultado) > CATEGORIA_MAX_LEN:
        recortado = resultado[:CATEGORIA_MAX_LEN]
        if "," in recortado:
            recortado = recortado.rsplit(",", 1)[0]
        resultado = recortado.strip()
    return resultado


def _productos_via_selectores_clasicos(soup: BeautifulSoup) -> list[dict]:
    productos = []
    tarjetas = soup.select("ul.products li.product, .product-small, .item-product, .col-product, .product")

    for tarjeta in tarjetas:
        link_tag = tarjeta.select_one(
            "a.woocommerce-LoopProduct-link, a.woocommerce-loop-product__link, a.product-loop-title, a[href]"
        )
        nombre_tag = tarjeta.select_one(".woocommerce-loop-product__title, h2, h3, h4, .title")
        precio_bloque = tarjeta.select_one("span.price, .price")

        if not (link_tag and precio_bloque):
            continue

        precios = _extraer_precios(precio_bloque.get_text(" ", strip=True))
        if not precios:
            continue

        nombre = nombre_tag.get_text(strip=True) if nombre_tag else link_tag.get_text(strip=True)
        if not nombre or len(nombre) < 3:
            continue

        productos.append({
            "nombre": nombre,
            "precio": min(precios),
            "precio_original": max(precios) if len(precios) > 1 else None,
            "categoria": _extraer_categoria(tarjeta.get("class", [])),
            "url": link_tag.get("href", "").strip(),
        })

    return productos


def _productos_via_enlaces_carrito(soup: BeautifulSoup) -> list[dict]:
    productos = []
    vistos_urls = set()
    enlaces_carrito = soup.select('a[href*="add-to-cart="]')

    for enlace in enlaces_carrito:
        contenedor = enlace
        info = None
        for _ in range(6):
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

        categoria = _extraer_categoria(contenedor.get("class", []))
        productos.append({
            "nombre": a_titulo.get_text(strip=True),
            "precio": min(precios),
            "precio_original": max(precios) if len(precios) > 1 else None,
            "categoria": categoria,
            "url": url_producto,
        })

    return productos


def _extraer_fragmentos_templates(soup: BeautifulSoup) -> list[str]:
    fragmentos = []
    for script in soup.find_all("script", attrs={"type": "text/template"}):
        contenido = (script.string or script.get_text() or "").strip()
        if not (contenido.startswith('"') and contenido.endswith('"')):
            continue
        try:
            html_decodificado = json.loads(contenido)
        except (json.JSONDecodeError, ValueError):
            continue
        if "add-to-cart=" in html_decodificado or "woocommerce-loop-product" in html_decodificado or "price" in html_decodificado:
            fragmentos.append(html_decodificado)
    return fragmentos


def _extraer_productos(html: str) -> tuple[list[dict], str, BeautifulSoup]:
    soup = BeautifulSoup(html, "html.parser")

    productos = _productos_via_selectores_clasicos(soup)
    if productos:
        return productos, "clásico", soup

    productos = _productos_via_enlaces_carrito(soup)
    if productos:
        return productos, "fallback (enlaces de carrito)", soup

    fragmentos = _extraer_fragmentos_templates(soup)
    if fragmentos:
        html_combinado = "<ul class='products'>" + "".join(fragmentos) + "</ul>"
        soup_templates = BeautifulSoup(html_combinado, "html.parser")
        productos = _productos_via_selectores_clasicos(soup_templates)
        if productos:
            return productos, "template oculto", soup

    return [], "ninguno", soup


def _scrapear_pagina(session: requests.Session, url: str, usar_navegador: bool) -> tuple[list[dict], bool]:
    html = _obtener_html_con_navegador(url) if usar_navegador else _obtener_html_estatico(session, url)
    if html is None:
        raise requests.RequestException(f"No se pudo obtener el HTML de {url}")

    productos, metodo, soup = _extraer_productos(html)

    if not productos:
        logger.warning(f"0 productos detectados en {url} (usar_navegador={usar_navegador}).")
    else:
        logger.info(f"{len(productos)} productos detectados en {url} (método: {metodo})")

    # Detección ampliada de paginación
    hay_siguiente = soup.select_one("a.next.page-numbers, .pagination .next, .nav-previous a, link[rel='next']") is not None
    return productos, hay_siguiente


def scrapear_competidor(db: Session, competidor: Competidor, max_paginas: int = 20):
    resumen = {
        "competidor": competidor.nombre,
        "paginas_recorridas": 0,
        "nuevos": 0,
        "actualizados": 0,
        "sin_cambio": 0,
        "exito": False,
        "error": None,
    }

    try:
        session = _crear_sesion()
        dominio = _dominio(competidor.url_base)
        config = CATEGORIAS_POR_COMPETIDOR.get(dominio)

        # Listas de URLs a recorrer (si hay config por categorías, usa las categorías; si no, usa la tienda general)
        rutas_a_recorrer = []
        if config:
            base = competidor.url_base.rstrip("/")
            ruta_cat = config["ruta_categoria"]
            for nombre_cat, slug in config["categorias"]:
                rutas_a_recorrer.append((f"{base}/{ruta_cat}/{slug}/", nombre_cat))
        else:
            rutas_a_recorrer.append((competidor.url_base.rstrip("/") + "/tienda/", None))

        for url_base_cat, nombre_categoria_forzada in rutas_a_recorrer:
            pagina = 1
            usar_navegador = False

            while pagina <= max_paginas:
                url = f"{url_base_cat}" if pagina == 1 else f"{url_base_cat}page/{pagina}/"
                logger.info(f"Scrapeando: {url}")

                try:
                    productos, hay_siguiente = _scrapear_pagina(session, url, usar_navegador)
                    # Si con requests estático no trae nada en la primera página, intentamos con Playwright
                    if not productos and pagina == 1 and PLAYWRIGHT_DISPONIBLE:
                        logger.info("Reintentando con navegador (Playwright)...")
                        usar_navegador = True
                        productos, hay_siguiente = _scrapear_pagina(session, url, usar_navegador)
                except requests.RequestException as e:
                    logger.error(f"Error al pedir {url}: {e}")
                    break

                if not productos:
                    break

                resumen["paginas_recorridas"] += 1

                for p in productos:
                    if nombre_categoria_forzada:
                        p["categoria"] = nombre_categoria_forzada

                    existente = (
                        db.query(ProductoCompetidor)
                        .filter_by(competidor_id=competidor.id, url_producto=p["url"])
                        .first()
                    )

                    if existente is None:
                        nuevo = ProductoCompetidor(
                            competidor_id=competidor.id,
                            nombre_scrapeado=p["nombre"][:255],
                            precio=p["precio"],
                            precio_original=p["precio_original"],
                            categoria=p["categoria"],
                            url_producto=p["url"][:500],
                        )
                        db.add(nuevo)
                        db.flush()
                        db.add(HistoricoPrecioCompetencia(producto_competidor_id=nuevo.id, precio=p["precio"]))
                        resumen["nuevos"] += 1
                    else:
                        cambios = False
                        if existente.precio != p["precio"]:
                            existente.precio = p["precio"]
                            existente.precio_original = p["precio_original"]
                            db.add(HistoricoPrecioCompetencia(producto_competidor_id=existente.id, precio=p["precio"]))
                            cambios = True
                        if p["categoria"] and existente.categoria != p["categoria"]:
                            existente.categoria = p["categoria"]
                            cambios = True

                        if cambios:
                            resumen["actualizados"] += 1
                        else:
                            resumen["sin_cambio"] += 1

                db.commit()

                if not hay_siguiente:
                    break

                pagina += 1
                time.sleep(DELAY_ENTRE_REQUESTS)

        resumen["exito"] = True
    except Exception as e:
        logger.error(f"Error general: {e}")
        logger.error(traceback.format_exc())
        resumen["error"] = str(e)

    logger.info(f"Resumen scraping: {resumen}")
    return resumen