import base64
import zipfile
from io import BytesIO
import requests
from datetime import datetime
import os
from jinja2 import Environment, FileSystemLoader
from lxml import etree
import xmlsec
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.hazmat.primitives import serialization

# ==========================================
# 1. CREDENCIALES SUNAT (ENTORNO BETA)
# ==========================================
SUNAT_RUC = "20100066603"
SUNAT_USER = "MODDATOS"
SUNAT_PASS = "moddatos"
SUNAT_WS_URL = "https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService"

def generar_xml_boleta(datos_venta: dict) -> str:
    """
    Lee la plantilla XML con Jinja2 y la rellena con los datos del diccionario.
    """
    ruta_templates = os.path.join(os.path.dirname(__file__), '..', 'templates')
    env = Environment(loader=FileSystemLoader(ruta_templates))
    template = env.get_template('boleta.xml')
    xml_renderizado = template.render(**datos_venta)
    return xml_renderizado

def firmar_xml(xml_string: str, ruta_pfx: str, password_pfx: str) -> str:
    """
    Fase 2: Firma digital XMLDSig usando xmlsec, insertando la plantilla de
    Signature directamente dentro de ExtensionContent ANTES de firmar,
    para que el digest se calcule ya con el nodo en su posición final.
    """
    try:
        # 1. Convertir el .pfx a PEM en memoria (clave privada + certificado)
        with open(ruta_pfx, "rb") as f:
            pfx_data = f.read()

        private_key, certificate, _ = pkcs12.load_key_and_certificates(
            pfx_data,
            password_pfx.encode('utf-8')
        )

        key_pem = private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.TraditionalOpenSSL,
            encryption_algorithm=serialization.NoEncryption()
        )
        cert_pem = certificate.public_bytes(serialization.Encoding.PEM)

        # 2. Parsear el XML de la boleta
        root = etree.fromstring(xml_string.encode('utf-8'))

        nsmap = {'ext': 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2'}
        extension_content = root.find('.//ext:ExtensionContent', namespaces=nsmap)

        if extension_content is None:
            raise Exception("No se encontró <ext:ExtensionContent> en la plantilla XML")

        # 3. Crear la plantilla de Signature (vacía) e insertarla YA en su lugar final
        signature_node = xmlsec.template.create(
            root,
            c14n_method=xmlsec.constants.TransformInclC14N,
            sign_method=xmlsec.constants.TransformRsaSha1,
            ns="ds"
        )
        signature_node.set("Id", "SignatureSP")
        extension_content.append(signature_node)

        # 4. Agregar la referencia: firma sobre TODO el documento (URI=""),
        #    aplicando la transformación enveloped-signature (SUNAT exige esto)
        ref = xmlsec.template.add_reference(
            signature_node,
            xmlsec.constants.TransformSha1,
            uri=""
        )
        xmlsec.template.add_transform(ref, xmlsec.constants.TransformEnveloped)

        # 5. Agregar el bloque KeyInfo/X509Data (SUNAT lo requiere para validar el certificado)
        key_info = xmlsec.template.ensure_key_info(signature_node)
        xmlsec.template.add_x509_data(key_info)

        # 6. Cargar la llave privada + certificado en el contexto de firma
        ctx = xmlsec.SignatureContext()
        key = xmlsec.Key.from_memory(key_pem, xmlsec.KeyFormat.PEM, None)
        key.load_cert_from_memory(cert_pem, xmlsec.KeyFormat.PEM)
        ctx.key = key

        # 7. Firmar (el digest se calcula con el Signature ya dentro de ExtensionContent)
        ctx.sign(signature_node)

        return etree.tostring(root, encoding="UTF-8", xml_declaration=True).decode('utf-8')

    except Exception as e:
        print(f"Error al firmar el XML: {str(e)}")
        raise e

def enviar_comprobante_sunat(ruc_emisor: str, tipo_comprobante: str, serie: str, numero: str, xml_firmado: str):
    """
    Fase 3 y 4: Empaquetar en ZIP y enviar por SOAP a SUNAT.
    """
    nombre_archivo = f"{ruc_emisor}-{tipo_comprobante}-{serie}-{numero}"

    buffer = BytesIO()
    with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        zip_file.writestr(f"{nombre_archivo}.xml", xml_firmado)
    zip_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')

    soap_envelope = f"""<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="http://service.sunat.gob.pe">
        <soapenv:Header>
            <wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
                <wsse:UsernameToken>
                    <wsse:Username>{SUNAT_RUC}{SUNAT_USER}</wsse:Username>
                    <wsse:Password>{SUNAT_PASS}</wsse:Password>
                </wsse:UsernameToken>
            </wsse:Security>
        </soapenv:Header>
        <soapenv:Body>
            <ser:sendBill>
                <fileName>{nombre_archivo}.zip</fileName>
                <contentFile>{zip_base64}</contentFile>
            </ser:sendBill>
        </soapenv:Body>
    </soapenv:Envelope>"""

    headers = {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': 'urn:sendBill'
    }

    try:
        print(f"Enviando {nombre_archivo} a SUNAT (BETA)...")
        response = requests.post(SUNAT_WS_URL, data=soap_envelope.encode('utf-8'), headers=headers, timeout=10)

        if response.status_code == 200:
            print("¡Respuesta de SUNAT recibida con éxito!")
            return {"exito": True, "respuesta_sunat": response.text}
        else:
            print(f"Error de conexión HTTP: {response.status_code}")
            return {"exito": False, "error": response.text}

    except Exception as e:
        return {"exito": False, "error": str(e)}
def leer_cdr(application_response_b64: str):
    """
    Decodifica el applicationResponse (Base64 -> ZIP) y extrae el XML del CDR
    para leer si SUNAT aceptó o rechazó el comprobante.
    """
    zip_bytes = base64.b64decode(application_response_b64)
    buffer = BytesIO(zip_bytes)

    with zipfile.ZipFile(buffer, 'r') as zip_file:
        nombre_xml_cdr = [n for n in zip_file.namelist() if n.endswith('.xml')][0]
        xml_cdr = zip_file.read(nombre_xml_cdr).decode('utf-8')

    return xml_cdr

# ==========================================
# ZONA DE PRUEBAS (PING A SUNAT)
# ==========================================
if __name__ == "__main__":
    print("Iniciando prueba de generación de XML y conexión...")

    datos_prueba = {
        "serie": "B001",
        "correlativo": "1",
        "fecha_emision": datetime.now().strftime('%Y-%m-%d'),
        "hora_emision": datetime.now().strftime('%H:%M:%S'),
        "moneda": "PEN",
        "ruc_emisor": "20100066603",
        "razon_social_emisor": "ACABADOS J&S SAC",
        "tipo_doc_cliente": "1",
        "num_doc_cliente": "76543210",
        "nombre_cliente": "CLIENTE PRUEBA",
        "total_valor_venta": "100.00",
        "total_igv": "18.00",
        "total_precio_venta": "118.00",
        "lineas": [
            {
                "cantidad": "2",
                "descripcion": "PORCELANATO REALE HUESO 60X60",
                "valor_unitario": "50.00",
                "precio_unitario": "59.00",
                "subtotal": "100.00",
                "igv": "18.00"
            }
        ]
    }

    xml_generado = generar_xml_boleta(datos_prueba)

    ruta_certificado = os.path.join(os.path.dirname(__file__), 'certificado_prueba.pfx')
    password_certificado = "123456"

    print("Firmando XML con certificado digital (SHA1 forzado)...")
    xml_firmado = firmar_xml(xml_generado, ruta_certificado, password_certificado)

    # --- DEBUG: guardar el XML firmado para inspección ---
    with open("debug_xml_firmado.xml", "w", encoding="utf-8") as f:
        f.write(xml_firmado)
    print("XML firmado guardado en debug_xml_firmado.xml para revisión")
    # -------------------------------------------------------

    print("Enviando XML firmado a SUNAT (BETA)...")

    resultado = enviar_comprobante_sunat(
        ruc_emisor=datos_prueba["ruc_emisor"],
        tipo_comprobante="03",
        serie=datos_prueba["serie"],
        numero=datos_prueba["correlativo"],
        xml_firmado=xml_firmado
    )

    print("\n--- RESULTADO ---")
    print(resultado)

    if resultado.get("exito"):
        # Extraer el applicationResponse del XML SOAP de respuesta
        import re
        match = re.search(r'<applicationResponse>(.*?)</applicationResponse>', resultado["respuesta_sunat"])
        if match:
            cdr_b64 = match.group(1)
            xml_cdr = leer_cdr(cdr_b64)

            with open("cdr_respuesta.xml", "w", encoding="utf-8") as f:
                f.write(xml_cdr)

            print("\n--- CDR DECODIFICADO ---")
            print(xml_cdr)