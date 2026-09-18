import os
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload, selectinload
from datetime import timedelta

from app.database import get_db
from app.models.venta import Venta, VentaDetalle
from app.schemas.venta import VentaCreate, VentaOut
from app.auth.dependencies import get_current_user
from app.services.venta_service import crear_venta
from app.services.venta_sunat_service import procesar_envio_sunat
from app.services.pdf_service import generar_pdf_comprobante
from app.services.nota_credito_service import procesar_anulacion

router = APIRouter(prefix="/ventas", tags=["ventas"])


class AnulacionRequest(BaseModel):
    codigo: str
    motivo: str


# =======================================================
# Función para Auto-Guardar PDFs en el Servidor
# =======================================================
def guardar_pdf_local(venta_id: int, db: Session, es_nc: bool = False):
    try:
        # 1. Obtener la venta con todos sus items
        venta = db.query(Venta).options(
            selectinload(Venta.items).joinedload(VentaDetalle.producto)
        ).filter(Venta.id == venta_id).first()
        
        if not venta:
            return

        # 2. Generar los bytes del PDF usando el servicio actual
        pdf_bytes = generar_pdf_comprobante(venta, venta.items)
        
        # 3. Determinar la jerarquía de carpetas ajustada a la hora de Perú (UTC-5)
        if venta.fecha:
            fecha_peru = venta.fecha - timedelta(hours=5)
            fecha_str = fecha_peru.strftime("%Y-%m-%d")
        else:
            fecha_str = "Sin_Fecha"
        
        if es_nc:
            tipo_carpeta = "Notas_de_Credito"
        elif str(venta.tipo_documento_id).zfill(2) == "01":
            tipo_carpeta = "Facturas"
        else:
            tipo_carpeta = "Boletas"
            
        # Se creará: comprobantes_guardados/YYYY-MM-DD/Tipo/
        ruta_directorio = os.path.join("comprobantes_guardados", fecha_str, tipo_carpeta)
        os.makedirs(ruta_directorio, exist_ok=True)
        
        # 4. Asignar el nombre del archivo
        serie = venta.serie or ("NC01" if es_nc else ("F001" if tipo_carpeta == "Facturas" else "B001"))
        numero = str(venta.numero or venta.id).zfill(8)
        nombre_archivo = f"{serie}-{numero}.pdf"
        
        ruta_completa = os.path.join(ruta_directorio, nombre_archivo)
        
        # 5. Escribir el PDF en el disco
        with open(ruta_completa, "wb") as f:
            f.write(pdf_bytes)
            
        print(f"📄 PDF archivado en servidor: {ruta_completa}")
    except Exception as e:
        print(f"⚠️ Error guardando PDF en el servidor local: {e}")


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
        
    # GUARDADO AUTOMÁTICO AL TERMINAR LA VENTA
    guardar_pdf_local(nueva_venta.id, db, es_nc=False)
        
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
    # El servicio ahora decide inteligentemente si es Baja o NC
    resultado = procesar_anulacion(venta_id, data.codigo, data.motivo, db, user.id)
    if not resultado.get("exito"):
        raise HTTPException(status_code=400, detail=resultado.get("error"))
        
    # GUARDADO AUTOMÁTICO DE PDF *SOLO* SI FUE NOTA DE CRÉDITO
    if resultado.get("tipo_anulacion") == "NOTA_CREDITO":
        nc_id = resultado.get("nota_credito_id")
        if nc_id:
            guardar_pdf_local(nc_id, db, es_nc=True)
        return {"mensaje": "Venta anulada mediante Nota de Crédito.", "detalles": resultado}
        
    # SI FUE BAJA MISMO DÍA
    return {"mensaje": "Venta dada de baja correctamente (Mismo día).", "detalles": resultado}


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