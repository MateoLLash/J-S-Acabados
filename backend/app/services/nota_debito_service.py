from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.venta import Venta, VentaDetalle
from app.services.venta_sunat_service import procesar_envio_sunat

def procesar_nota_debito(venta_id_original: int, codigo_motivo: str, descripcion_motivo: str, monto_extra: float, db: Session, user_id: int):
    venta_original = db.query(Venta).filter(Venta.id == venta_id_original).first()
    if not venta_original:
        return {"exito": False, "error": "Venta original no encontrada"}

    es_factura = venta_original.tipo_comprobante == "factura"
    # Series oficiales de SUNAT para Notas de Débito
    serie_nd = "FD01" if es_factura else "BD01"
    
    ultimo_numero = db.query(func.max(Venta.numero)).filter(
        Venta.tipo_documento_id == "08",
        Venta.serie == serie_nd
    ).scalar()
    nuevo_numero = (ultimo_numero or 0) + 1

    nota_debito = Venta(
        cliente_id=venta_original.cliente_id,
        tipo_comprobante=venta_original.tipo_comprobante,
        tipo_documento_id="08", # 08 es Nota de Débito
        serie=serie_nd,
        numero=nuevo_numero,
        documento_referencia_id=venta_original.id,
        motivo_nota_id=codigo_motivo,
        estado_sunat="pendiente",
        usuario_id=user_id,
        total=monto_extra,
        metodo_pago_id=venta_original.metodo_pago_id,
        observaciones_sunat=descripcion_motivo
    )
    db.add(nota_debito)
    db.flush()

    # TRUCO: Usamos el primer producto de la venta original para no romper la llave foránea
    primer_detalle = db.query(VentaDetalle).filter(VentaDetalle.venta_id == venta_original.id).first()
    producto_comodin_id = primer_detalle.producto_id if primer_detalle else 1

    nuevo_detalle = VentaDetalle(
        venta_id=nota_debito.id,
        producto_id=producto_comodin_id,
        cantidad=1,
        precio_unitario=monto_extra
    )
    db.add(nuevo_detalle)
    db.commit()

    # Enviar a SUNAT (No usa tickets, es inmediato)
    resultado_sunat = procesar_envio_sunat(nota_debito.id, db, user_id)
    
    return {
        "exito": True, 
        "tipo_anulacion": "NOTA_DEBITO",
        "nota_debito_id": nota_debito.id,
        "sunat": resultado_sunat
    }