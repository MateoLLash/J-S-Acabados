from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
import io

from app.database import get_db
from app.auth.dependencies import get_current_user
from app.models.guia_remision import GuiaRemision, GuiaRemisionDetalle
from app.schemas.guias import GuiaCreate  # Importamos el esquema limpio
from app.services.pdf_service import generar_pdf_guia_remision
from app.services.guia_sunat_service import procesar_envio_guia_sunat, anular_guia_sunat

router = APIRouter(prefix="/guias", tags=["guias_remision"])

@router.get("/")
def listar_guias(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return db.query(GuiaRemision).order_by(GuiaRemision.id.desc()).all()

@router.post("/")
def crear_y_enviar_guia(data: GuiaCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    # Calcular correlativo de serie T002
    ultimo_numero = db.query(func.max(GuiaRemision.numero)).filter(GuiaRemision.serie == "T002").scalar()
    nuevo_numero = (ultimo_numero or 0) + 1

    nueva_guia = GuiaRemision(
        serie="T002",
        numero=nuevo_numero,
        fecha_traslado=data.fecha_traslado,
        motivo_traslado=data.motivo_traslado,
        descripcion_motivo=data.descripcion_motivo,
        peso_total=data.peso_total,
        ubigeo_partida=data.ubigeo_partida,
        direccion_partida=data.direccion_partida,
        ubigeo_llegada=data.ubigeo_llegada,
        direccion_llegada=data.direccion_llegada,
        destinatario_tipo_doc=data.destinatario_tipo_doc,
        destinatario_num_doc=data.destinatario_num_doc,
        destinatario_nombre=data.destinatario_nombre,
        modalidad_transporte=data.modalidad_transporte,
        transportista_doc=data.transportista_doc,
        transportista_nombre=data.transportista_nombre,
        vehiculo_placa=data.vehiculo_placa,
        conductor_doc=data.conductor_doc,
        usuario_id=current_user.id
    )
    db.add(nueva_guia)
    db.flush()

    for item in data.detalles:
        detalle = GuiaRemisionDetalle(
            guia_id=nueva_guia.id,
            producto_id=item.producto_id,
            cantidad=item.cantidad,
            unidad_medida=item.unidad_medida,
            codigo_producto=item.codigo_producto,
            descripcion=item.descripcion
        )
        db.add(detalle)
    
    db.commit()
    db.refresh(nueva_guia)

    # Llamar al servicio APISUNAT
    resultado_sunat = procesar_envio_guia_sunat(nueva_guia.id, db, current_user.id)
    
    if not resultado_sunat["exito"]:
        raise HTTPException(status_code=400, detail=f"Guardado localmente, pero rechazado por SUNAT: {resultado_sunat['error']}")

    return {"mensaje": "Guía de remisión creada y enviada a SUNAT con éxito", "id": nueva_guia.id}

@router.get("/{guia_id}/pdf")
def descargar_pdf_guia(guia_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    guia = db.query(GuiaRemision).filter(GuiaRemision.id == guia_id).first()
    if not guia:
        raise HTTPException(status_code=404, detail="Guía no encontrada")
    
    pdf_bytes = generar_pdf_guia_remision(guia, guia.detalles)
    
    return StreamingResponse(
        io.BytesIO(pdf_bytes), 
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="Guia_{guia.serie}-{guia.numero}.pdf"'}
    )

@router.post("/{guia_id}/anular")
def anular_guia(
    guia_id: int, 
    db: Session = Depends(get_db), 
    current_user = Depends(get_current_user)
):
    resultado = anular_guia_sunat(guia_id, db)
    
    if not resultado["exito"]:
        raise HTTPException(status_code=400, detail=resultado["error"])
        
    return {"mensaje": resultado["mensaje"]}