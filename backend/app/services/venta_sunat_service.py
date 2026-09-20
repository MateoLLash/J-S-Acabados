import os
import requests
import re
from datetime import datetime
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import text
from app.models.venta import Venta, VentaDetalle
from app.models.baja import ComunicacionBaja, ComunicacionBajaDetalle

APISUNAT_URL = "https://back.apisunat.com/personas/v1/sendBill"
APISUNAT_VOIDBILL_URL = "https://back.apisunat.com/personas/v1/voidBill" # Endpoint nativo de APISUNAT para bajas
PERSONA_ID = os.getenv("APISUNAT_PERSONA_ID", "6a988a0c218b1600210cdff0")
PERSONA_TOKEN = os.getenv("APISUNAT_TOKEN", "DEV_3RxZAEZFPSinq1ElpPReNZkTwHIq9uYu83zk0GcuCZyKpLioWCDP7EyzKZ7iAiwT")

EMISOR_RUC = os.getenv("EMISOR_RUC", "10062517323")
EMISOR_RAZON_SOCIAL = os.getenv("EMISOR_RAZON_SOCIAL", "HUACHACA PALACIOS SONIA AYDEE")
EMISOR_DIRECCION = os.getenv(
    "EMISOR_DIRECCION",
    "AV. PROCERES DE LA INDEPENDENCIA NRO. 2009 URB. SAN HILARION ET. DOS SAN JUAN DE LURIGANCHO LIMA LIMA",
)

_UNIDADES = ["", "UNO", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE"]
_DECENAS_10_19 = ["DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISEIS",
                  "DIECISIETE", "DIECIOCHO", "DIECINUEVE"]
_DECENAS = ["", "", "VEINTE", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA",
            "SETENTA", "OCHENTA", "NOVENTA"]
_CENTENAS = ["", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS",
             "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"]

def _tres_digitos_a_letras(n: int) -> str:
    if n == 0:
        return ""
    if n == 100:
        return "CIEN"
    c, resto = divmod(n, 100)
    d, u = divmod(resto, 10)
    partes = []
    if c:
        partes.append(_CENTENAS[c])
    if resto == 0:
        pass
    elif 10 <= resto <= 19:
        partes.append(_DECENAS_10_19[resto - 10])
    elif resto < 10:
        partes.append(_UNIDADES[resto])
    else:
        if resto in (21, 22, 23, 24, 25, 26, 27, 28, 29):
            partes.append("VEINTI" + _UNIDADES[u].lower().capitalize().upper())
        else:
            deca = _DECENAS[d]
            if u:
                partes.append(f"{deca} Y {_UNIDADES[u]}")
            else:
                partes.append(deca)
    return " ".join(partes)

def numero_a_letras(valor: float) -> str:
    entero = int(valor)
    centavos = round((valor - entero) * 100)

    if entero == 0:
        letras = "CERO"
    else:
        millones, resto_millon = divmod(entero, 1_000_000)
        miles, unidades = divmod(resto_millon, 1000)
        partes = []
        if millones:
            partes.append("UN MILLON" if millones == 1 else f"{_tres_digitos_a_letras(millones)} MILLONES")
        if miles:
            partes.append("MIL" if miles == 1 else f"{_tres_digitos_a_letras(miles)} MIL")
        if unidades or (not millones and not miles):
            partes.append(_tres_digitos_a_letras(unidades))
        letras = " ".join(p for p in partes if p)

    return f"SON {letras} CON {centavos:02d}/100 SOLES"

def _monto(valor: float) -> dict:
    return {"_attributes": {"currencyID": "PEN"}, "_text": round(float(valor), 2)}

def _texto(valor) -> dict:
    return {"_text": valor}

def procesar_envio_sunat(venta_id: int, db: Session, usuario_id: int):
    venta = (
        db.query(Venta)
        .options(selectinload(Venta.items).joinedload(VentaDetalle.producto))
        .filter(Venta.id == venta_id)
        .first()
    )
    if not venta:
        raise Exception(f"Venta con ID {venta_id} no encontrada")

    # Identificar tipo de comprobante: 01 (Factura), 03 (Boleta), 07 (NC), 08 (ND)
    tipo_comp = str(venta.tipo_documento_id).zfill(2)
    if tipo_comp not in ["01", "03", "07", "08"]:
        tipo_comp = "03"

    es_nota_credito = (tipo_comp == "07")
    es_nota_debito = (tipo_comp == "08")
    total_venta = float(venta.total)

    items_calculados = []
    for idx, item in enumerate(venta.items, start=1):
        precio_unitario = float(item.precio_unitario)
        valor_unitario = round(precio_unitario / 1.18, 2)
        cantidad = float(item.cantidad)
        subtotal_item = round(valor_unitario * cantidad, 2)
        precio_total_item = round(precio_unitario * cantidad, 2)
        igv_item = round(precio_total_item - subtotal_item, 2)

        items_calculados.append({
            "numero_linea": idx,
            "codigo_producto": str(item.producto_id),
            "descripcion": item.producto.nombre if item.producto else f"Producto #{item.producto_id}",
            "cantidad": cantidad,
            "valor_unitario": valor_unitario,
            "precio_unitario": precio_unitario,
            "valor_venta": subtotal_item,
            "igv": igv_item,
        })

    valor_venta_total = round(sum(i["valor_venta"] for i in items_calculados), 2)
    total_igv = round(sum(i["igv"] for i in items_calculados), 2)

    doc_cliente = "00000000"
    tipo_doc_cliente = "1"

    if venta.cliente:
        if hasattr(venta.cliente, 'documento') and venta.cliente.documento:
            doc_cliente = venta.cliente.documento
        elif hasattr(venta.cliente, 'numero_documento') and venta.cliente.numero_documento:
            doc_cliente = venta.cliente.numero_documento
        elif hasattr(venta.cliente, 'ruc') and venta.cliente.ruc:
            doc_cliente = venta.cliente.ruc
            tipo_doc_cliente = "6"
        elif hasattr(venta.cliente, 'dni') and venta.cliente.dni:
            doc_cliente = venta.cliente.dni

    if len(str(doc_cliente)) == 11:
        tipo_doc_cliente = "6"
    elif len(str(doc_cliente)) == 8:
        tipo_doc_cliente = "1"

    razon_social_cliente = venta.cliente.nombre if venta.cliente else "CLIENTE GENERAL"
    direccion_cliente = getattr(venta.cliente, 'direccion', '') or "-"

    # Asignación automática de Serie si no viene predefinida
    if venta.serie:
        serie_comp = venta.serie
    else:
        if es_nota_credito:
            serie_comp = "FC01"
        elif es_nota_debito:
            serie_comp = "FD01"
        else:
            serie_comp = "F001" if tipo_comp == "01" else "B001"

    numero_correlativo = str(int(venta.numero or venta.id)).zfill(8)
    file_name = f"{EMISOR_RUC}-{tipo_comp}-{serie_comp}-{numero_correlativo}"

    ahora = datetime.now()
    fecha_emision = venta.fecha.strftime('%Y-%m-%d') if venta.fecha else ahora.strftime('%Y-%m-%d')
    hora_emision = ahora.strftime('%H:%M:%S')

    lineas_ubl = []
    
    # SUNAT exige etiquetas de cantidad diferentes según el documento
    if es_nota_credito:
        nombre_cantidad_tag = "cbc:CreditedQuantity"
    elif es_nota_debito:
        nombre_cantidad_tag = "cbc:DebitedQuantity"
    else:
        nombre_cantidad_tag = "cbc:InvoicedQuantity"

    for it in items_calculados:
        lineas_ubl.append({
            "cbc:ID": _texto(it["numero_linea"]),
            nombre_cantidad_tag: {
                "_attributes": {"unitCode": "NIU"},
                "_text": it["cantidad"],
            },
            "cbc:LineExtensionAmount": _monto(it["valor_venta"]),
            "cac:PricingReference": {
                "cac:AlternativeConditionPrice": {
                    "cbc:PriceAmount": _monto(it["precio_unitario"]),
                    "cbc:PriceTypeCode": _texto("01"),
                }
            },
            "cac:TaxTotal": {
                "cbc:TaxAmount": _monto(it["igv"]),
                "cac:TaxSubtotal": [
                    {
                        "cbc:TaxableAmount": _monto(it["valor_venta"]),
                        "cbc:TaxAmount": _monto(it["igv"]),
                        "cac:TaxCategory": {
                            "cbc:Percent": _texto(18),
                            "cbc:TaxExemptionReasonCode": _texto("10"),
                            "cac:TaxScheme": {
                                "cbc:ID": _texto("1000"),
                                "cbc:Name": _texto("IGV"),
                                "cbc:TaxTypeCode": _texto("VAT"),
                            },
                        },
                    }
                ],
            },
            "cac:Item": {
                "cbc:Description": _texto(it["descripcion"]),
                "cac:SellersItemIdentification": {"cbc:ID": _texto(it["codigo_producto"])},
            },
            "cac:Price": {"cbc:PriceAmount": _monto(it["valor_unitario"])},
        })

    # 🔥 CORRECCIÓN CLAVE: El nombre del tag de totales cambia según el documento
    tag_totales = "cac:RequestedMonetaryTotal" if es_nota_debito else "cac:LegalMonetaryTotal"

    document_body = {
        "cbc:UBLVersionID": _texto("2.1"),
        "cbc:CustomizationID": _texto("2.0"),
        "cbc:ID": _texto(f"{serie_comp}-{numero_correlativo}"),
        "cbc:IssueDate": _texto(fecha_emision),
        "cbc:IssueTime": _texto(hora_emision),
        "cbc:Note": [
            {
                "_text": numero_a_letras(total_venta),
                "_attributes": {"languageLocaleID": "1000"},
            }
        ],
        "cbc:DocumentCurrencyCode": _texto("PEN"),
        "cac:AccountingSupplierParty": {
            "cac:Party": {
                "cac:PartyIdentification": {
                    "cbc:ID": {"_attributes": {"schemeID": "6"}, "_text": EMISOR_RUC}
                },
                "cac:PartyLegalEntity": {
                    "cbc:RegistrationName": _texto(EMISOR_RAZON_SOCIAL),
                    "cac:RegistrationAddress": {
                        "cbc:AddressTypeCode": _texto("0000"),
                        "cac:AddressLine": {"cbc:Line": _texto(EMISOR_DIRECCION)},
                    },
                },
            }
        },
        "cac:AccountingCustomerParty": {
            "cac:Party": {
                "cac:PartyIdentification": {
                    "cbc:ID": {"_attributes": {"schemeID": tipo_doc_cliente}, "_text": doc_cliente}
                },
                "cac:PartyLegalEntity": {
                    "cbc:RegistrationName": _texto(razon_social_cliente),
                    "cac:RegistrationAddress": {
                        "cac:AddressLine": {"cbc:Line": _texto(direccion_cliente)}
                    },
                },
            }
        },
        "cac:TaxTotal": {
            "cbc:TaxAmount": _monto(total_igv),
            "cac:TaxSubtotal": [
                {
                    "cbc:TaxableAmount": _monto(valor_venta_total),
                    "cbc:TaxAmount": _monto(total_igv),
                    "cac:TaxCategory": {
                        "cac:TaxScheme": {
                            "cbc:ID": _texto("1000"),
                            "cbc:Name": _texto("IGV"),
                            "cbc:TaxTypeCode": _texto("VAT"),
                        }
                    },
                }
            ],
        },
        tag_totales: {
            "cbc:LineExtensionAmount": _monto(valor_venta_total),
            "cbc:TaxInclusiveAmount": _monto(total_venta),
            "cbc:PayableAmount": _monto(total_venta),
        },
    }

    if es_nota_credito or es_nota_debito:
        venta_ref = db.query(Venta).filter(Venta.id == venta.documento_referencia_id).first() if venta.documento_referencia_id else None
        serie_ref = venta_ref.serie if (venta_ref and venta_ref.serie) else ("F001" if serie_comp.startswith("F") else "B001")
        numero_ref = str(int(venta_ref.numero or venta_ref.id)).zfill(8) if venta_ref else "00000001"
        tipo_doc_ref = str(venta_ref.tipo_documento_id).zfill(2) if venta_ref else ("01" if serie_ref.startswith("F") else "03")

        # Catálogos oficiales SUNAT (09 para NC, 10 para ND)
        if es_nota_credito:
            motivos_oficial = {
                "01": "ANULACION DE LA OPERACION",
                "02": "ANULACION POR ERROR EN EL RUC",
                "03": "CORRECCION POR ERROR EN LA DESCRIPCION",
                "04": "DESCUENTO GLOBAL",
                "05": "DESCUENTO POR ITEM",
                "06": "DEVOLUCION TOTAL",
                "07": "DEVOLUCION POR ITEM",
                "08": "BONIFICACION",
                "09": "DISMINUCION EN EL VALOR",
                "10": "OTROS CONCEPTOS"
            }
            line_tag = "cac:CreditNoteLine"
        else:
            motivos_oficial = {
                "01": "INTERESES POR MORA",
                "02": "AUMENTO EN EL VALOR",
                "03": "PENALIDADES/ OTROS CONCEPTOS"
            }
            line_tag = "cac:DebitNoteLine"

        codigo_motivo = venta.motivo_nota_id or "01"
        descripcion_oficial = motivos_oficial.get(codigo_motivo, "OTROS CONCEPTOS")

        document_body["cac:DiscrepancyResponse"] = [
            {
                "cbc:ReferenceID": _texto(f"{serie_ref}-{numero_ref}"),
                "cbc:ResponseCode": _texto(codigo_motivo),
                "cbc:Description": _texto(descripcion_oficial)
            }
        ]
        document_body["cac:BillingReference"] = [
            {
                "cac:InvoiceDocumentReference": {
                    "cbc:ID": _texto(f"{serie_ref}-{numero_ref}"),
                    "cbc:DocumentTypeCode": _texto(tipo_doc_ref)
                }
            }
        ]
        document_body[line_tag] = lineas_ubl
    else:
        document_body["cbc:InvoiceTypeCode"] = {
            "_attributes": {"listID": "0101"},
            "_text": tipo_comp,
        }
        document_body["cac:PaymentTerms"] = {
            "cbc:ID": _texto("FormaPago"),
            "cbc:PaymentMeansID": _texto("Contado"),
        }
        document_body["cac:InvoiceLine"] = lineas_ubl

    payload = {
        "personaId": PERSONA_ID,
        "personaToken": PERSONA_TOKEN,
        "fileName": file_name,
        "documentBody": document_body,
    }

    headers = {"Content-Type": "application/json"}

    try:
        db.execute(text("SELECT set_config('app.current_user_id', :user_id, true)"), {"user_id": str(usuario_id)})
        print(f"Enviando comprobante {file_name} a APISUNAT...")

        response = requests.post(APISUNAT_URL, json=payload, headers=headers, timeout=20)

        if response.status_code in [200, 201]:
            res_json = response.json()
            venta.estado_sunat = "enviado" if res_json.get("status") == "PENDIENTE" else "aceptado"
            venta.observaciones_sunat = f"Enviado a APISUNAT (documentId: {res_json.get('documentId', '')})"[:250]
            db.commit()
            db.refresh(venta)
            return {"exito": True, "mensaje": "Comprobante enviado", "detalle": res_json}
        else:
            venta.estado_sunat = "rechazado"
            try:
                error_json = response.json()
                error_msg = str(error_json)
            except Exception:
                error_msg = response.text

            venta.observaciones_sunat = error_msg[:250]
            db.commit()

            print("\n❌ DETALLE COMPLETO DEL RECHAZO DE APISUNAT:")
            print(f"Status Code: {response.status_code}")
            print(f"Respuesta cruda: {response.text}")
            print("-" * 40)

            return {"exito": False, "error": error_msg}

    except Exception as e:
        db.rollback()
        venta.estado_sunat = "rechazado"
        venta.observaciones_sunat = str(e)[:250]
        db.commit()
        print(f"\n❌ ERROR DE CONEXIÓN: {str(e)}\n")
        return {"exito": False, "error": str(e)}
    finally:
        db.execute(text("SELECT set_config('app.current_user_id', '', true)"))


# ==============================================================================
# NUEVO: FUNCIÓN PARA ENVIAR COMUNICACIONES DE BAJA (RA) USANDO voidBill
# ==============================================================================
def enviar_comunicacion_baja_sunat(comunicacion_id: int, db: Session):
    baja = db.query(ComunicacionBaja).filter(ComunicacionBaja.id == comunicacion_id).first()
    if not baja:
        return {"exito": False, "error": "Registro de Comunicación de Baja no encontrado."}

    detalles_baja = db.query(ComunicacionBajaDetalle).filter(ComunicacionBajaDetalle.comunicacion_baja_id == comunicacion_id).all()
    if not detalles_baja:
        return {"exito": False, "error": "No hay documentos a dar de baja."}

    # Ubicar la venta original que se desea anular
    venta_original = db.query(Venta).filter(Venta.id == detalles_baja[0].venta_id).first()
    if not venta_original:
        return {"exito": False, "error": "Venta original no encontrada."}

    # --------------------------------------------------------------------------
    # Extraer el ID interno de APISUNAT (MongoDB ObjectId)
    # Lo buscamos dentro de la columna observaciones_sunat usando Expresiones Regulares
    # --------------------------------------------------------------------------
    document_id_api = None
    if venta_original.observaciones_sunat:
        # Busca el patrón "documentId: " seguido de caracteres alfanuméricos
        match = re.search(r"documentId:\s*([a-zA-Z0-9]+)", venta_original.observaciones_sunat)
        if match:
            document_id_api = match.group(1)

    if not document_id_api:
        baja.estado = "error_envio"
        db.commit()
        return {"exito": False, "error": "No se encontró el ID interno de APISUNAT en la venta. Asegúrate de anular un comprobante que fue aceptado recientemente."}

    # Construimos el payload de anulación usando el ID interno que APISUNAT exige
    payload = {
        "personaId": PERSONA_ID,
        "personaToken": PERSONA_TOKEN,
        "documentId": document_id_api, # Ej: 6aa8f1b2c3d4e5f6a7b8c9d0
        "reason": detalles_baja[0].motivo_baja[:100]
    }

    headers = {"Content-Type": "application/json"}

    try:
        print(f"Enviando solicitud de Baja (voidBill) para ID interno {document_id_api} a APISUNAT...")
        response = requests.post(APISUNAT_VOIDBILL_URL, json=payload, headers=headers, timeout=20)

        if response.status_code in [200, 201]:
            res_json = response.json()
            ticket = res_json.get("ticket") or res_json.get("documentId")
            
            if ticket:
                baja.numero_ticket = str(ticket)
                baja.estado = "enviado"
            else:
                baja.estado = "procesado_sin_ticket"
                
            db.commit()
            return {"exito": True, "ticket": baja.numero_ticket, "mensaje": "Baja enviada a APISUNAT"}
        else:
            baja.estado = "error_envio"
            error_msg = response.text
            
            print("\n❌ DETALLE DEL RECHAZO DE BAJA EN APISUNAT:")
            print(f"Status Code: {response.status_code}")
            print(f"Respuesta: {error_msg}\n")
            
            # 🔥 CORRECCIÓN: NO sobreescribimos observaciones_sunat para no perder el documentId original
            db.commit()
            
            return {"exito": False, "error": f"Error de APISUNAT: {error_msg}"}

    except Exception as e:
        baja.estado = "error_conexion"
        db.commit()
        print(f"\n❌ ERROR DE CONEXIÓN CON APISUNAT AL ANULAR: {str(e)}\n")
        return {"exito": False, "error": f"Fallo al conectar con APISUNAT: {str(e)}"}