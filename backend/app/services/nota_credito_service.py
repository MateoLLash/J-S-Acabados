from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.venta import Venta, VentaDetalle
from app.models.producto import Producto
from app.models.baja import ComunicacionBaja, ComunicacionBajaDetalle
from app.services.venta_sunat_service import procesar_envio_sunat, enviar_comunicacion_baja_sunat

def procesar_anulacion(venta_id: int, codigo_motivo: str, motivo_desc: str, db: Session, user_id: int):
    venta_original = db.query(Venta).filter(Venta.id == venta_id).first()
    if not venta_original:
        return {"exito": False, "error": "Venta original no encontrada"}
        
    if venta_original.estado_sunat == "anulado":
        return {"exito": False, "error": "La venta ya se encuentra anulada"}

    ahora_peru = datetime.now() - timedelta(hours=5)
    fecha_venta = venta_original.fecha
    if fecha_venta.tzinfo is not None:
        fecha_venta = fecha_venta.replace(tzinfo=None)
        
    fecha_venta_peru = fecha_venta - timedelta(hours=5)
    diferencia_dias = (ahora_peru.date() - fecha_venta_peru.date()).days

    if codigo_motivo == "RA" and diferencia_dias > 7:
        return {"exito": False, "error": "Han pasado más de 7 días. SUNAT prohíbe la Comunicación de Baja; debe emitir una Nota de Crédito."}

    es_baja_real = (codigo_motivo == "RA" and diferencia_dias <= 7)

    motivos_que_devuelven_stock = ["01", "06", "07", "RA"]
    devolver_stock = codigo_motivo in motivos_que_devuelven_stock or es_baja_real
    detalles_originales = db.query(VentaDetalle).filter(VentaDetalle.venta_id == venta_original.id).all()

    try:
        if es_baja_real:
            # =======================================================
            # ESCENARIO A: COMUNICACIÓN DE BAJA (RA)
            # =======================================================
            estado_previo = venta_original.estado_sunat
            obs_previas = venta_original.observaciones_sunat or ""
            
            # 🔥 CORRECCIÓN 1: Unimos el texto nuevo con el anterior para conservar el documentId
            venta_original.estado_sunat = "anulado"
            venta_original.observaciones_sunat = f"{obs_previas} | BAJA_RA: {motivo_desc}"
            
            nueva_baja = ComunicacionBaja(
                fecha_generacion=ahora_peru.date(),
                fecha_referencia=fecha_venta_peru.date(),
                motivo=motivo_desc,
                usuario_id=user_id,
                estado="generado"
            )
            db.add(nueva_baja)
            db.flush() 

            nuevo_detalle_baja = ComunicacionBajaDetalle(
                comunicacion_baja_id=nueva_baja.id,
                venta_id=venta_original.id,
                motivo_baja=motivo_desc
            )
            db.add(nuevo_detalle_baja)

            if devolver_stock:
                for det in detalles_originales:
                    producto = db.query(Producto).filter(Producto.id == det.producto_id).with_for_update().first()
                    if producto and producto.stock is not None:
                        producto.stock += det.cantidad

            db.commit()

            # Llamamos a SUNAT usando el ID intacto
            resultado_envio = enviar_comunicacion_baja_sunat(nueva_baja.id, db)

            # 🔥 CORRECCIÓN 2: Si SUNAT rechaza la petición, deshacemos la anulación local
            if not resultado_envio.get("exito"):
                venta_original.estado_sunat = estado_previo
                venta_original.observaciones_sunat = obs_previas
                
                if devolver_stock: # Retiramos el stock que habíamos sumado preventivamente
                    for det in detalles_originales:
                        producto = db.query(Producto).filter(Producto.id == det.producto_id).with_for_update().first()
                        if producto and producto.stock is not None:
                            producto.stock -= det.cantidad
                            
                db.commit()
                return {"exito": False, "error": resultado_envio.get("error")}

            return {
                "exito": True, 
                "tipo_anulacion": "BAJA",
                "ticket": resultado_envio.get("ticket"),
                "mensaje": "Comprobante dado de baja y enviado a SUNAT."
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
                motivo_nota_id=codigo_motivo if codigo_motivo != "RA" else "01",
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
                "sunat": resultado_sunat
            }

    except Exception as e:
        db.rollback()
        return {"exito": False, "error": str(e)}