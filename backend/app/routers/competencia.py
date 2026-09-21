from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from pydantic import BaseModel
from decimal import Decimal
from datetime import datetime

from app.database import get_db
from app.models.competencia import Competidor, ProductoCompetidor, HistoricoPrecioCompetencia, ProductoMatch
from app.models.producto import Producto
from app.services.scraper_service import scrapear_competidor
from app.services.matching_service import generar_matches_automaticos

router = APIRouter(prefix="/api/competencia", tags=["Competencia y Precios"])

# ==========================================
# ESQUEMAS PYDANTIC (DTOs)
# ==========================================
class CompetidorOut(BaseModel):
    id: int
    nombre: str
    url_base: str
    activo: bool

    class Config:
        from_attributes = True

class ProductoCompetidorOut(BaseModel):
    id: int
    competidor_id: int
    competidor_nombre: Optional[str] = None
    nombre_scrapeado: str
    precio: Decimal
    precio_original: Optional[Decimal] = None
    categoria: Optional[str] = None
    url_producto: str
    ultima_actualizacion: datetime

    class Config:
        from_attributes = True

class MatchCreate(BaseModel):
    producto_id: int
    producto_competidor_id: int

class ProductoMatchOut(BaseModel):
    id: int
    producto_id: int
    producto_competidor_id: int
    confirmado_por_usuario: bool
    creado_en: datetime

    class Config:
        from_attributes = True


# ==========================================
# ENDPOINTS
# ==========================================

@router.get("/competidores", response_model=List[CompetidorOut])
def listar_competidores(db: Session = Depends(get_db)):
    """Lista todos los competidores configurados."""
    return db.query(Competidor).all()


@router.get("/productos", response_model=List[ProductoCompetidorOut])
def listar_productos_competencia(
    competidor_id: Optional[int] = None,
    busqueda: Optional[str] = None,
    categoria: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Lista los productos scrapeados de la competencia con filtros opcionales."""
    # joinedload evita una consulta extra por cada producto al leer el nombre
    # del competidor (problema N+1 con cientos de productos).
    query = db.query(ProductoCompetidor).options(joinedload(ProductoCompetidor.competidor))

    if competidor_id:
        query = query.filter(ProductoCompetidor.competidor_id == competidor_id)
    if busqueda:
        query = query.filter(ProductoCompetidor.nombre_scrapeado.ilike(f"%{busqueda}%"))
    if categoria:
        query = query.filter(ProductoCompetidor.categoria.ilike(f"%{categoria}%"))

    productos = query.all()

    # El modelo ProductoCompetidor no tiene un atributo 'competidor_nombre':
    # el nombre vive en la tabla relacionada. Lo armamos a mano para que el
    # schema lo pueda serializar (si no, Pydantic lo deja en None y el
    # frontend muestra "Sin identificar").
    return [
        ProductoCompetidorOut(
            id=p.id,
            competidor_id=p.competidor_id,
            competidor_nombre=p.competidor.nombre if p.competidor else None,
            nombre_scrapeado=p.nombre_scrapeado,
            precio=p.precio,
            precio_original=p.precio_original,
            categoria=p.categoria,
            url_producto=p.url_producto,
            ultima_actualizacion=p.ultima_actualizacion,
        )
        for p in productos
    ]


@router.get("/historico/{producto_competidor_id}")
def obtener_historico_precio(producto_competidor_id: int, db: Session = Depends(get_db)):
    """Devuelve la evolución de precios de un producto de la competencia."""
    historial = (
        db.query(HistoricoPrecioCompetencia)
        .filter(HistoricoPrecioCompetencia.producto_competidor_id == producto_competidor_id)
        .order_by(HistoricoPrecioCompetencia.fecha_registro.asc())
        .all()
    )
    if not historial:
        raise HTTPException(status_code=404, detail="No hay histórico para este producto.")

    return [
        {"fecha": h.fecha_registro, "precio": float(h.precio)}
        for h in historial
    ]


@router.post("/match", response_model=ProductoMatchOut, status_code=status.HTTP_201_CREATED)
def crear_match_producto(data: MatchCreate, db: Session = Depends(get_db)):
    """Vincula un producto interno de tu inventario con un producto de la competencia."""
    prod_interno = db.query(Producto).filter(Producto.id == data.producto_id).first()
    if not prod_interno:
        raise HTTPException(status_code=404, detail="El producto interno no existe.")

    prod_comp = db.query(ProductoCompetidor).filter(ProductoCompetidor.id == data.producto_competidor_id).first()
    if not prod_comp:
        raise HTTPException(status_code=404, detail="El producto de la competencia no existe.")

    existente = db.query(ProductoMatch).filter_by(
        producto_id=data.producto_id,
        producto_competidor_id=data.producto_competidor_id
    ).first()

    if existente:
        # Si existía como sugerencia automática, al vincularlo manualmente
        # queda confirmado.
        if not existente.confirmado_por_usuario:
            existente.confirmado_por_usuario = True
            db.commit()
            db.refresh(existente)
        return existente

    nuevo_match = ProductoMatch(
        producto_id=data.producto_id,
        producto_competidor_id=data.producto_competidor_id,
        confirmado_por_usuario=True
    )
    db.add(nuevo_match)
    db.commit()
    db.refresh(nuevo_match)
    return nuevo_match


@router.post("/confirmar-match/{match_id}", response_model=ProductoMatchOut)
def confirmar_match(match_id: int, db: Session = Depends(get_db)):
    """Marca como confirmado un vínculo que el matching automático dejó como sugerencia."""
    match = db.query(ProductoMatch).filter(ProductoMatch.id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="El vínculo no existe.")

    match.confirmado_por_usuario = True
    db.commit()
    db.refresh(match)
    return match


@router.post("/generar-matches")
def generar_matches(competidor_id: Optional[int] = None, db: Session = Depends(get_db)):
    """
    Vincula automáticamente tus productos internos con los de la competencia
    por similitud de nombre. Omite los productos que ya tienen vínculo.
    Pasa competidor_id para limitarlo a un solo competidor.
    """
    try:
        resumen = generar_matches_automaticos(db, competidor_id)
        return {"mensaje": "Matching automático ejecutado", "resumen": resumen}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al generar matches: {str(e)}")


@router.get("/comparativa-precios")
def obtener_comparativa_precios(db: Session = Depends(get_db)):
    """
    Cruza los productos internos con los de la competencia mediante los matches
    para analizar diferencias de precio en tiempo real.
    """
    matches = (
        db.query(ProductoMatch)
        .options(
            joinedload(ProductoMatch.producto_competidor).joinedload(ProductoCompetidor.competidor)
        )
        .all()
    )
    resultado = []

    for m in matches:
        prod_interno = db.query(Producto).filter(Producto.id == m.producto_id).first()
        prod_comp = m.producto_competidor

        if prod_interno and prod_comp:
            precio_mio = float(getattr(prod_interno, "precio_venta", 0))
            precio_competencia = float(prod_comp.precio)

            diferencia = precio_mio - precio_competencia
            porcentaje = (diferencia / precio_competencia * 100) if precio_competencia > 0 else 0

            resultado.append({
                "match_id": m.id,
                "producto_mio": getattr(prod_interno, "nombre", "Desconocido"),
                "precio_mio": precio_mio,
                "producto_competencia": prod_comp.nombre_scrapeado,
                "producto_competidor_id": prod_comp.id,
                "competidor_nombre": prod_comp.competidor.nombre if prod_comp.competidor else None,
                "precio_competencia": precio_competencia,
                "competidor_url": prod_comp.url_producto,
                "diferencia_moneda": round(diferencia, 2),
                "diferencia_porcentaje": round(porcentaje, 2),
                "confirmado": m.confirmado_por_usuario,
                "estado": "Mas caro" if diferencia > 0 else ("Mas barato" if diferencia < 0 else "Igual precio")
            })

    return resultado


@router.post("/ejecutar-scraper/{competidor_id}")
def disparar_scraper_manual(competidor_id: int, db: Session = Depends(get_db)):
    """Dispara el proceso de scraping de forma manual para un competidor específico."""
    competidor = db.query(Competidor).filter(Competidor.id == competidor_id).first()
    if not competidor:
        raise HTTPException(status_code=404, detail="Competidor no encontrado.")

    try:
        resumen = scrapear_competidor(db, competidor)
        return {"mensaje": "Scraping ejecutado con éxito", "resumen": resumen}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al ejecutar el scraper: {str(e)}")


@router.delete("/match/{match_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_match(match_id: int, db: Session = Depends(get_db)):
    """Desvincula un producto interno del producto de la competencia."""
    match = db.query(ProductoMatch).filter(ProductoMatch.id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="El vínculo no existe.")
    db.delete(match)
    db.commit()
    return None