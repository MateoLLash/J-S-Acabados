import os
import requests
import json
import re
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.models.guia_remision import GuiaRemision

APISUNAT_URL = os.getenv("APISUNAT_URL", "https://back.apisunat.com/personas/v1/sendBill")
APISUNAT_VOIDBILL_URL = os.getenv("APISUNAT_VOIDBILL_URL", "https://back.apisunat.com/personas/v1/voidBill")
PERSONA_ID = os.getenv("APISUNAT_PERSONA_ID", "6a988a0c218b1600210cdff0")
PERSONA_TOKEN = os.getenv("APISUNAT_TOKEN", "DEV_3RxZAEZFPSinq1ElpPReNZkTwHIq9uYu83zk0GcuCZyKpLioWCDP7EyzKZ7iAiwT")

EMISOR_RUC = os.getenv("EMISOR_RUC", "10062517323")
EMISOR_RAZON_SOCIAL = os.getenv("EMISOR_RAZON_SOCIAL", "HUACHACA PALACIOS SONIA AYDEE")

def _texto(valor):
    return {"_text": str(valor) if valor is not None and str(valor).strip() != "" else "SIN DATO"}

def procesar_envio_guia_sunat(guia_id: int, db: Session, usuario_id: int):
    guia = db.query(GuiaRemision).filter(GuiaRemision.id == guia_id).first()
    if not guia:
        raise Exception(f"Guía de remisión con ID {guia_id} no encontrada")

    serie_comp = guia.serie or "T002"
    numero_correlativo = str(int(guia.numero or guia.id)).zfill(8)
    file_name = f"{EMISOR_RUC}-09-{serie_comp}-{numero_correlativo}"

    fecha_emision = guia.fecha_emision.strftime('%Y-%m-%d')
    hora_emision = guia.fecha_emision.strftime('%H:%M:%S')

    lineas_ubl = []
    
    for idx, item in enumerate(guia.detalles, start=1):
        nombre_producto = getattr(item, 'nombre', '')
        if not nombre_producto and hasattr(item, 'producto') and item.producto:
             nombre_producto = getattr(item.producto, 'nombre', 'SIN DATO')
        if not nombre_producto:
             nombre_producto = getattr(item, 'descripcion', 'SIN DATO')

        lineas_ubl.append({
            "cbc:ID": _texto(idx),
            "cbc:DeliveredQuantity": {
                "_attributes": {"unitCode": item.unidad_medida or "NIU"},
                "_text": str(item.cantidad)
            },
            "cac:OrderLineReference": {
                "cbc:LineID": _texto(idx)
            },
            "cac:Item": {
                "cbc:Description": _texto(getattr(item, 'descripcion', nombre_producto)),
                "cbc:Name": _texto(nombre_producto),
                "cac:SellersItemIdentification": {"cbc:ID": _texto(getattr(item, 'codigo_producto', 'SIN DATO'))},
            }
        })

    shipment_stage = {
        "cbc:TransportModeCode": _texto(guia.modalidad_transporte),
        "cac:TransitPeriod": {
            "cbc:StartDate": _texto(guia.fecha_traslado.strftime('%Y-%m-%d'))
        }
    }

    transport_handling_unit = None

    if guia.modalidad_transporte == "01":
        # Modalidad 01: TRANSPORTE PÚBLICO
        tipo_doc_trans = "6" if len(str(guia.transportista_doc or "")) == 11 else "1"
        shipment_stage["cac:CarrierParty"] = {
            "cac:PartyIdentification": {
                "cbc:ID": {"_attributes": {"schemeID": tipo_doc_trans}, "_text": str(guia.transportista_doc or EMISOR_RUC)}
            },
            "cac:PartyLegalEntity": {
                "cbc:RegistrationName": _texto(guia.transportista_nombre or EMISOR_RAZON_SOCIAL),
                "cbc:CompanyID": _texto("AAAAAAAAAAAAAAAA")
            }
        }
    else:
        # Modalidad 02: TRANSPORTE PRIVADO
        if guia.conductor_doc:
            shipment_stage["cac:DriverPerson"] = {
                "cbc:ID": {"_attributes": {"schemeID": "1"}, "_text": str(guia.conductor_doc)},
                "cbc:FirstName": _texto("CONDUCTOR"),
                "cbc:FamilyName": _texto("ASIGNADO"),
                "cbc:JobTitle": _texto("Principal"),
                "cac:IdentityDocumentReference": {
                    "cbc:ID": _texto("LICENCIA123")
                }
            }
        
        if guia.vehiculo_placa:
            transport_handling_unit = {
                "cac:TransportEquipment": {
                    "cbc:ID": _texto(guia.vehiculo_placa),
                    "cac:ShipmentDocumentReference": {
                        "cbc:ID": {"_attributes": {"schemeID": "02"}, "_text": "DOCREF"}
                    }
                }
            }

    shipment_stage["cac:LoadingTransportEvent"] = {
        "cbc:OccurrenceDate": _texto(guia.fecha_traslado.strftime('%Y-%m-%d'))
    }

    dir_partida = guia.direccion_partida if guia.direccion_partida and guia.direccion_partida.strip() else "AV. PROCERES DE LA INDEPENDENCIA NRO. 2009"
    ubigeo_partida = guia.ubigeo_partida if guia.ubigeo_partida and str(guia.ubigeo_partida).strip() else "150101"
    
    dir_llegada = guia.direccion_llegada if guia.direccion_llegada and guia.direccion_llegada.strip() else "LIMA LIMA"
    ubigeo_llegada = guia.ubigeo_llegada if guia.ubigeo_llegada and str(guia.ubigeo_llegada).strip() else "150101"

    shipment_dict = {
        "cbc:ID": _texto("SUNAT_Envio"),
        "cbc:HandlingCode": _texto(guia.motivo_traslado),
        "cbc:GrossWeightMeasure": {
            "_attributes": {"unitCode": "KGM"},
            "_text": str(guia.peso_total)
        },
        "cac:ShipmentStage": [shipment_stage],
        "cac:Delivery": {
            "cac:DeliveryAddress": {
                "cbc:ID": _texto(ubigeo_llegada),
                "cac:AddressLine": {
                    "cbc:Line": _texto(dir_llegada)
                }
            },
            "cac:Despatch": {
                "cac:DespatchAddress": {
                    "cbc:ID": _texto(ubigeo_partida),
                    "cac:AddressLine": {
                        "cbc:Line": _texto(dir_partida)
                    }
                }
            }
        }
    }

    if transport_handling_unit:
        shipment_dict["cac:TransportHandlingUnit"] = transport_handling_unit

    document_body = {
        "cbc:UBLVersionID": _texto("2.1"),
        "cbc:CustomizationID": _texto("2.0"),
        "cbc:ID": _texto(f"{serie_comp}-{numero_correlativo}"),
        "cbc:IssueDate": _texto(fecha_emision),
        "cbc:IssueTime": _texto(hora_emision),
        "cbc:DespatchAdviceTypeCode": _texto("09"), 
        "cac:DespatchSupplierParty": {
            "cac:Party": {
                "cac:PartyIdentification": {
                    "cbc:ID": {"_attributes": {"schemeID": "6"}, "_text": EMISOR_RUC}
                },
                "cac:PartyLegalEntity": {
                    "cbc:RegistrationName": _texto(EMISOR_RAZON_SOCIAL)
                }
            }
        },
        "cac:DeliveryCustomerParty": {
            "cac:Party": {
                "cac:PartyIdentification": {
                    "cbc:ID": {"_attributes": {"schemeID": guia.destinatario_tipo_doc}, "_text": str(guia.destinatario_num_doc)}
                },
                "cac:PartyLegalEntity": {
                    "cbc:RegistrationName": _texto(guia.destinatario_nombre)
                }
            }
        },
        "cac:Shipment": shipment_dict,
        "cac:DespatchLine": lineas_ubl
    }

    payload = {
        "personaId": PERSONA_ID,
        "personaToken": PERSONA_TOKEN,
        "fileName": file_name,
        "documentBody": document_body
    }

    try:
        db.execute(text("SELECT set_config('app.current_user_id', :user_id, true)"), {"user_id": str(usuario_id)})
        
        print("\n" + "="*50)
        print(f"ENVIANDO GUIA UBL 2.1 (TRANSPORTE PRIVADO OFICIAL): {file_name}")
        print(json.dumps(payload, indent=2))
        print("="*50 + "\n")

        response = requests.post(APISUNAT_URL, json=payload, headers={"Content-Type": "application/json"}, timeout=20)

        if response.status_code in [200, 201]:
            res_json = response.json()
            guia.estado_sunat = "aceptado" if res_json.get("status") != "ERROR" else "rechazado"
            
            # 🔥 CORRECCIÓN: Guardar el documentId para poder anular después
            document_id = res_json.get('documentId', '')
            guia.observaciones_sunat = f"Enviado a APISUNAT (documentId: {document_id})"[:250]
            
            db.commit()
            return {"exito": True, "mensaje": "Guía enviada", "detalle": res_json}
        else:
            guia.estado_sunat = "rechazado"
            error_msg = response.text
            guia.observaciones_sunat = error_msg[:250]
            db.commit()
            return {"exito": False, "error": response.text}

    except Exception as e:
        db.rollback()
        guia.estado_sunat = "error_conexion"
        guia.observaciones_sunat = str(e)[:250]
        db.commit()
        return {"exito": False, "error": str(e)}
    finally:
        db.execute(text("SELECT set_config('app.current_user_id', '', true)"))


# ==============================================================================
# NUEVO: FUNCIÓN PARA ANULAR GUÍA DE REMISIÓN
# ==============================================================================
def anular_guia_sunat(guia_id: int, db: Session, motivo: str = "Error en los datos de traslado"):
    guia = db.query(GuiaRemision).filter(GuiaRemision.id == guia_id).first()
    if not guia:
        return {"exito": False, "error": "Guía de remisión no encontrada."}

    # Extraer el ID interno de APISUNAT
    document_id_api = None
    if guia.observaciones_sunat:
        match = re.search(r"documentId:\s*([a-zA-Z0-9]+)", guia.observaciones_sunat)
        if match:
            document_id_api = match.group(1)

    if not document_id_api:
        return {"exito": False, "error": "No se encontró el ID interno de APISUNAT en la guía. Para anular, la guía debe haber sido aceptada con la nueva versión del sistema."}

    payload = {
        "personaId": PERSONA_ID,
        "personaToken": PERSONA_TOKEN,
        "documentId": document_id_api,
        "reason": motivo[:100]
    }

    headers = {"Content-Type": "application/json"}

    try:
        print(f"Enviando solicitud de Baja (voidBill) de Guía para ID interno {document_id_api} a APISUNAT...")
        response = requests.post(APISUNAT_VOIDBILL_URL, json=payload, headers=headers, timeout=20)

        if response.status_code in [200, 201]:
            guia.estado_sunat = "anulado"
            db.commit()
            return {"exito": True, "mensaje": "Guía de remisión anulada en APISUNAT"}
        else:
            error_msg = response.text
            print("\n❌ DETALLE DEL RECHAZO DE BAJA EN APISUNAT:")
            print(f"Status Code: {response.status_code}")
            print(f"Respuesta: {error_msg}\n")
            return {"exito": False, "error": f"Error de APISUNAT: {error_msg}"}

    except Exception as e:
        print(f"\n❌ ERROR DE CONEXIÓN CON APISUNAT AL ANULAR GUÍA: {str(e)}\n")
        return {"exito": False, "error": f"Fallo al conectar con APISUNAT: {str(e)}"}