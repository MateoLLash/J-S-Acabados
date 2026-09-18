from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.venta import Venta, VentaDetalle
from app.models.producto import Producto
from app.services.venta_sunat_service import procesar_envio_sunat

def procesar_anulacion(venta_id: int, codigo_motivo: str, motivo_desc: str, db: Session, user_id: int):
    venta_original = db.query(Venta).filter(Venta.id == venta_id).first()
    if not venta_original:
        return {"exito": False, "error": "Venta original no encontrada"}
        
    if venta_original.estado_sunat == "anulado":
        return {"exito": False, "error": "La venta ya se encuentra anulada"}

    # Control de tiempo estricto SUNAT (UTC-5 Perú)
    ahora_peru = datetime.now() - timedelta(hours=5)
    fecha_venta = venta_original.fecha
    if fecha_venta.tzinfo is not None:
        fecha_venta = fecha_venta.replace(tzinfo=None)
        
    fecha_venta_peru = fecha_venta - timedelta(hours=5)
    diferencia_dias = (ahora_peru.date() - fecha_venta_peru.date()).days

    # Determinar si el usuario escogió explícitamente Baja (RA) o si por defecto es Nota de Crédito
    es_peticion_baja = (codigo_motivo == "RA")

    if es_peticion_baja and diferencia_dias > 7:
        return {"exito": False, "error": "SUNAT no permite Comunicación de Baja pasados los 7 días calendario. Debe usar Nota de Crédito."}

    # LÓGICA DE INVENTARIO
    motivos_que_devuelven_stock = ["01", "06", "07", "RA"]
    devolver_stock = codigo_motivo in motivos_que_devuelven_stock or es_peticion_baja
    detalles_originales = db.query(VentaDetalle).filter(VentaDetalle.venta_id == venta_original.id).all()

    try:
        if es_peticion_baja:
            # =======================================================
            # ESCENARIO A: COMUNICACIÓN DE BAJA (RA)
            # =======================================================
            venta_original.estado_sunat = "anulado"
            venta_original.observaciones_sunat = f"BAJA SUNAT (RA) - Motivo: {motivo_desc}"
            
            if devolver_stock:
                for det in detalles_originales:
                    producto = db.query(Producto).filter(Producto.id == det.producto_id).with_for_update().first()
                    if producto and producto.stock is not None:
                        producto.stock += det.cantidad

            db.commit()
            return {
                "exito": True, 
                "tipo_anulacion": "BAJA",
                "stock_devuelto": devolver_stock,
                "mensaje": "Comprobante dado de baja correctamente."
            }

        else:
            # =======================================================
            # ESCENARIO B: NOTA DE CRÉDITO (07)
            # =======================================================
            if diferencia_dias > 365:
                return {"exito": False, "error": "El comprobante excede el plazo máximo de 12 meses establecido por SUNAT."}

            es_factura = venta_original.tipo_comprobante == "factura"
            serie_nc = "FC01" if es_factura else "BC01" 
            
            ultimo_numero = db.query(func.max(Venta.numero)).filter(
                Venta.tipo_documento_id == "07",
                Venta.serie == serie_nc
            ).scalar()
            nuevo_numero = (ultimo_numero or 0) + 1

            nota_credito = Venta(
                cliente_id=venta_original.cliente_id,
                tipo_comprobante=venta_original.tipo_comprobante,
                tipo_documento_id="07",
                serie=serie_nc,
                numero=nuevo_numero,
                documento_referencia_id=venta_original.id,
                motivo_nota_id=codigo_motivo,
                estado_sunat="pendiente",
                usuario_id=user_id,
                total=venta_original.total,
                metodo_pago_id=venta_original.metodo_pago_id,
                observaciones_sunat=motivo_desc
            )
            db.add(nota_credito)
            db.flush() 

            for det in detalles_originales:
                nuevo_detalle = VentaDetalle(
                    venta_id=nota_credito.id,
                    producto_id=det.producto_id,
                    cantidad=det.cantidad,
                    precio_unitario=det.precio_unitario
                )
                db.add(nuevo_detalle)

                if devolver_stock:
                    producto = db.query(Producto).filter(Producto.id == det.producto_id).with_for_update().first()
                    if producto and producto.stock is not None:
                        producto.stock += det.cantidad

            venta_original.estado_sunat = "anulado"
            db.commit()

            resultado_sunat = procesar_envio_sunat(nota_credito.id, db, user_id)
            
            return {
                "exito": True, 
                "tipo_anulacion": "NOTA_CREDITO",
                "nota_credito_id": nota_credito.id,
                "stock_devuelto": devolver_stock,
                "sunat": resultado_sunat
            }

    except Exception as e:
        db.rollback()
        return {"exito": False, "error": str(e)}