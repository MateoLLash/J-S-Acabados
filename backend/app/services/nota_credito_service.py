from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.venta import Venta, VentaDetalle
from app.models.producto import Producto  # Asegúrate de que el modelo Producto esté importado
from app.services.venta_sunat_service import procesar_envio_sunat

def procesar_nota_credito_sunat(venta_id: int, codigo_motivo: str, motivo_desc: str, db: Session, user_id: int):
    # 1. Buscar la venta original
    venta_original = db.query(Venta).filter(Venta.id == venta_id).first()
    if not venta_original:
        return {"exito": False, "error": "Venta original no encontrada"}
        
    if venta_original.estado_sunat == "anulado":
        return {"exito": False, "error": "La venta ya se encuentra anulada"}

    try:
        # 2. Determinar correlativo para la Nota de Crédito (FC para facturas, BC para boletas)
        es_factura = venta_original.tipo_comprobante == "factura"
        serie_nc = "FC01" if es_factura else "BC01" 
        
        ultimo_numero = db.query(func.max(Venta.numero)).filter(
            Venta.tipo_documento_id == "07",
            Venta.serie == serie_nc
        ).scalar()
        nuevo_numero = (ultimo_numero or 0) + 1

        # 3. Crear el registro de la Nota de Crédito en la BD
        nota_credito = Venta(
            cliente_id=venta_original.cliente_id,
            tipo_comprobante=venta_original.tipo_comprobante,
            tipo_documento_id="07", # Código oficial de Nota de Crédito
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
        db.flush() # Usamos flush para obtener el ID de la NC antes del commit

        # 4. LÓGICA DE INVENTARIO INTELIGENTE
        # Códigos que implican que el producto regresó a tienda o nunca salió:
        motivos_que_devuelven_stock = ["01", "06", "07"]
        devolver_stock = codigo_motivo in motivos_que_devuelven_stock

        detalles_originales = db.query(VentaDetalle).filter(VentaDetalle.venta_id == venta_original.id).all()
        
        for det in detalles_originales:
            # A) Copiamos los ítems a la Nota de Crédito
            nuevo_detalle = VentaDetalle(
                venta_id=nota_credito.id,
                producto_id=det.producto_id,
                cantidad=det.cantidad,
                precio_unitario=det.precio_unitario
            )
            db.add(nuevo_detalle)

            # B) Si el motivo aplica, regresamos la cantidad al stock del producto
            if devolver_stock:
                producto = db.query(Producto).filter(Producto.id == det.producto_id).with_for_update().first()
                if producto and producto.stock is not None:
                    # OJO: Se asume que en tu modelo Producto existe una columna llamada 'stock'
                    producto.stock += det.cantidad

        # 5. Actualizar la venta original para marcarla como anulada
        venta_original.estado_sunat = "anulado"
        db.commit()

        # 6. Enviar automáticamente la Nota de Crédito a SUNAT
        resultado_sunat = procesar_envio_sunat(nota_credito.id, db, user_id)
        
        return {
            "exito": True, 
            "nota_credito_id": nota_credito.id,
            "stock_devuelto": devolver_stock,
            "sunat": resultado_sunat
        }

    except Exception as e:
        db.rollback()
        return {"exito": False, "error": str(e)}