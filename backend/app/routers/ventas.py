from typing import List
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload, selectinload

from app.database import get_db
from app.models.venta import Venta, VentaDetalle
from app.schemas.venta import VentaCreate, VentaOut
from app.auth.dependencies import get_current_user
from app.services.venta_service import crear_venta
from app.services.venta_sunat_service import procesar_envio_sunat
from app.services.pdf_service import generar_pdf_comprobante
from app.services.nota_credito_service import procesar_nota_credito_sunat

router = APIRouter(prefix="/ventas", tags=["ventas"])


class AnulacionRequest(BaseModel):
    codigo: str
    motivo: str


@router.get("/", response_model=List[VentaOut])
def listar_ventas(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return (
        db.query(Venta)
        .filter(Venta.tipo_documento_id.in_(["01", "03"])) # Muestra solo Facturas y Boletas
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
    nueva_venta = crear_venta(db, data, user.id)
    
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


@router.post("/{venta_id}/anular")
def anular_venta(venta_id: int, data: AnulacionRequest, db: Session = Depends(get_db), user=Depends(get_current_user)):
    # Pasamos data.codigo y data.motivo al servicio
    resultado = procesar_nota_credito_sunat(venta_id, data.codigo, data.motivo, db, user.id)
    if not resultado.get("exito"):
        raise HTTPException(status_code=400, detail=resultado.get("error"))
    return {"mensaje": "Venta anulada correctamente mediante Nota de Crédito", "detalles": resultado}


@router.get("/{venta_id}/pdf")
def ver_pdf_venta(venta_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    venta = db.query(Venta).filter(Venta.id == venta_id).first()
    if not venta:
        raise HTTPException(status_code=404, detail="Venta no encontrada")
    
    pdf_bytes = generar_pdf_comprobante(venta, venta.items)
    nombre_archivo = f"Comprobante-{venta.serie or 'B001'}-{venta.numero or venta.id}.pdf"
    
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename={nombre_archivo}"}
    )


@router.get("/{venta_id}/pdf/descargar")
def descargar_pdf_venta(venta_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    venta = db.query(Venta).filter(Venta.id == venta_id).first()
    if not venta:
        raise HTTPException(status_code=404, detail="Venta no encontrada")
    
    pdf_bytes = generar_pdf_comprobante(venta, venta.items)
    nombre_archivo = f"Comprobante-{venta.serie or 'B001'}-{venta.numero or venta.id}.pdf"
    
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={nombre_archivo}"}
    )


@router.get("/{venta_id}/pdf-nc")
def ver_pdf_nc_venta(venta_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    # Busca la Nota de Crédito utilizando el ID de la factura original
    nc = db.query(Venta).filter(
        Venta.documento_referencia_id == venta_id, 
        Venta.tipo_documento_id == '07'
    ).first()
    
    if not nc:
        raise HTTPException(status_code=404, detail="Nota de Crédito no encontrada para esta venta")
    
    pdf_bytes = generar_pdf_comprobante(nc, nc.items)
    nombre_archivo = f"NotaCredito-{nc.serie or 'NC'}-{nc.numero or nc.id}.pdf"
    
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename={nombre_archivo}"}
    )