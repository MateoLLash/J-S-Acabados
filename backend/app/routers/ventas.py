from typing import List
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response # <-- NUEVO IMPORT PARA PDF
from sqlalchemy.orm import Session, joinedload, selectinload

from app.database import get_db
from app.models.venta import Venta, VentaDetalle
from app.schemas.venta import VentaCreate, VentaOut
from app.auth.dependencies import get_current_user
from app.services.venta_service import crear_venta
from app.services.venta_sunat_service import procesar_envio_sunat

# <-- NUEVO IMPORT DEL SERVICIO GENERADOR DE PDF -->
# Asegúrate de crear el archivo app/services/pdf_service.py que te pasé antes
from app.services.pdf_service import generar_pdf_comprobante

router = APIRouter(prefix="/ventas", tags=["ventas"])


@router.get("/", response_model=List[VentaOut])
def listar_ventas(db: Session = Depends(get_db), _=Depends(get_current_user)):
    # joinedload trae cliente/metodo_pago en el mismo JOIN (van 1-a-1).
    # selectinload trae los items en UNA sola consulta aparte (van 1-a-muchos,
    # con joinedload duplicaría filas). Y anidamos otro selectinload para el
    # producto de cada item. Total: pasa de ~100+ idas y vueltas a Supabase a 3.
    return (
        db.query(Venta)
        .options(
            joinedload(Venta.cliente),
            joinedload(Venta.metodo_pago),
            selectinload(Venta.items).joinedload(VentaDetalle.producto),
        )
        .order_by(Venta.fecha.desc())
        .all()
    )


@router.post("/", response_model=VentaOut, status_code=201)
def registrar_venta(data: VentaCreate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    # 1. Guardamos la venta localmente
    nueva_venta = crear_venta(db, data, user.id)
    
    # 2. Intentamos el envío a SUNAT y revisamos la respuesta
    try:
        resultado = procesar_envio_sunat(nueva_venta.id, db, user.id)
        if not resultado.get("exito"):
            print("\n❌ APISUNAT RECHAZÓ EL COMPROBANTE:")
            print(resultado.get("error"))
            print("-" * 40)
        else:
            print("\n✅ COMPROBANTE ENVIADO A APISUNAT CORRECTAMENTE\n")
    except Exception as e:
        print(f"\n❌ ERROR DE CÓDIGO AL CONECTAR CON SUNAT: {str(e)}\n")
        
    return nueva_venta

@router.post("/{venta_id}/enviar-sunat")
def reintentar_envio_sunat(venta_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    try:
        resultado = procesar_envio_sunat(venta_id, db, user.id)
        return resultado
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ==========================================
# NUEVO ENDPOINT PARA DESCARGAR EL PDF
# ==========================================
@router.get("/{venta_id}/pdf")
def descargar_pdf_venta(venta_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    venta = db.query(Venta).filter(Venta.id == venta_id).first()
    if not venta:
        raise HTTPException(status_code=404, detail="Venta no encontrada")
    
    # Genera los bytes del PDF usando el servicio
    pdf_bytes = generar_pdf_comprobante(venta, venta.items)
    
    nombre_archivo = f"Comprobante-{venta.serie or 'B001'}-{venta.numero or venta.id}.pdf"
    
    # Devuelve el archivo listo para mostrar/descargar en el navegador
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename={nombre_archivo}"}
    )