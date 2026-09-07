import os
import requests
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.models.venta import Venta

# ==========================================
# CONFIGURACIÓN APISUNAT API REST (BACKEND OFICIAL)
# ==========================================
APISUNAT_URL = "https://back.apisunat.com/personas/v1/sendBill"
PERSONA_ID = os.getenv("APISUNAT_PERSONA_ID", "6a988a0c218b1600210cdff0")
PERSONA_TOKEN = os.getenv("APISUNAT_TOKEN", "DEV_3RxZAEZFPSinq1ElpPReNZkTwHIq9uYu83zk0GcuCZyKpLioWCDP7EyzKZ7iAiwT")

EMISOR_RUC = os.getenv("EMISOR_RUC", "10062517323")
# Datos del emisor: la API necesita razón social y dirección dentro del XML/UBL,
# no solo el RUC. Configúralos por variable de entorno.
EMISOR_RAZON_SOCIAL = os.getenv("EMISOR_RAZON_SOCIAL", "HUACHACA PALACIOS SONIA AYDEE")
EMISOR_DIRECCION = os.getenv(
    "EMISOR_DIRECCION",
    "AV. PROCERES DE LA INDEPENDENCIA NRO. 2009 URB. SAN HILARION ET. DOS SAN JUAN DE LURIGANCHO LIMA LIMA",
)


# ==========================================
# Conversión de número a letras (para la leyenda "SON ... SOLES")
# ==========================================
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
    """Convierte un monto (soles) a letras, formato SUNAT: 'SON CIENTO DIECIOCHO CON 00/100 SOLES'."""
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
    # 1. Buscar la venta
    venta = db.query(Venta).filter(Venta.id == venta_id).first()
    if not venta:
        raise Exception(f"Venta con ID {venta_id} no encontrada")

    # Identificar si es factura ("01") o boleta ("03")
    tipo_comp = str(venta.tipo_documento_id).zfill(2)
    if tipo_comp not in ["01", "03"]:
        tipo_comp = "03"

    # 2. Cálculos de totales e IGV (igual que antes)
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

    # 3. Validación de cliente
    doc_cliente = "00000000"
    tipo_doc_cliente = "1"  # 1 = DNI, 6 = RUC (schemeID UBL)

    if tipo_comp == "01":
        tipo_doc_cliente = "6"

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
            if tipo_comp == "01":
                raise Exception("Una factura requiere RUC, no DNI.")

    if tipo_comp == "03" and total_venta >= 700.00:
        if not doc_cliente or doc_cliente == "00000000":
            raise Exception("Boletas de S/ 700+ requieren DNI del cliente.")

    if tipo_comp == "01" and tipo_doc_cliente != "6":
        raise Exception("Las facturas requieren obligatoriamente un número de RUC válido.")

    razon_social_cliente = venta.cliente.nombre if venta.cliente else "CLIENTE GENERAL"
    direccion_cliente = getattr(venta.cliente, 'direccion', '') or "-"

    # 4. Serie / correlativo / nombre de archivo (esto ya coincidía con lo que espera APISUNAT)
    serie_comp = venta.serie or ("F001" if tipo_comp == "01" else "B001")
    numero_correlativo = str(int(venta.numero or venta.id)).zfill(8)
    file_name = f"{EMISOR_RUC}-{tipo_comp}-{serie_comp}-{numero_correlativo}"

    ahora = datetime.now()
    fecha_emision = venta.fecha.strftime('%Y-%m-%d') if venta.fecha else ahora.strftime('%Y-%m-%d')
    hora_emision = ahora.strftime('%H:%M:%S')

    # 5. Construcción de las líneas de detalle (cac:InvoiceLine) en formato UBL
    invoice_lines = []
    for it in items_calculados:
        invoice_lines.append({
            "cbc:ID": _texto(it["numero_linea"]),
            "cbc:InvoicedQuantity": {
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

    # 6. documentBody completo, en el formato UBL/Greenter (cbc:/cac:) que realmente
    #    exige/devuelve APISUNAT — este es el cambio principal respecto a la versión anterior.
    document_body = {
        "cbc:UBLVersionID": _texto("2.1"),
        "cbc:CustomizationID": _texto("2.0"),
        "cbc:ID": _texto(f"{serie_comp}-{numero_correlativo}"),
        "cbc:IssueDate": _texto(fecha_emision),
        "cbc:IssueTime": _texto(hora_emision),
        "cbc:InvoiceTypeCode": {
            "_attributes": {"listID": "0101"},
            "_text": tipo_comp,
        },
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
        "cac:PaymentTerms": {
            "cbc:ID": _texto("FormaPago"),
            "cbc:PaymentMeansID": _texto("Contado"),
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
        "cac:LegalMonetaryTotal": {
            "cbc:LineExtensionAmount": _monto(valor_venta_total),
            "cbc:TaxInclusiveAmount": _monto(total_venta),
            "cbc:PayableAmount": _monto(total_venta),
        },
        "cac:InvoiceLine": invoice_lines,
    }

    payload = {
        "personaId": PERSONA_ID,
        "personaToken": PERSONA_TOKEN,
        "fileName": file_name,
        "documentBody": document_body,
    }

    headers = {"Content-Type": "application/json"}

    # 7. Envío a APISUNAT (sin cambios en la lógica de manejo de respuesta)
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