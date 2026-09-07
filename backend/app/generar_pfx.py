import datetime
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.serialization import pkcs12  # <-- Importación explícita
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID
from cryptography import x509
from cryptography.hazmat.primitives import hashes

print("Generando llaves y certificado...")

# 1. Generar llave privada (2048 bits)
private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

# 2. Configurar el nombre del certificado
subject = issuer = x509.Name([
    x509.NameAttribute(NameOID.COMMON_NAME, u"Acabados JS Prueba"),
])

# Obtener la hora actual en UTC (Evita el DeprecationWarning)
ahora = datetime.datetime.now(datetime.timezone.utc)

# 3. Construir el certificado válido por 1 año
cert = x509.CertificateBuilder().subject_name(
    subject
).issuer_name(
    issuer
).public_key(
    private_key.public_key()
).serial_number(
    x509.random_serial_number()
).not_valid_before(
    ahora
).not_valid_after(
    ahora + datetime.timedelta(days=365)
).sign(private_key, hashes.SHA256())

# 4. Empaquetar en formato .pfx con contraseña "123456"
pfx_data = pkcs12.serialize_key_and_certificates(
    b"Certificado Prueba",
    private_key,
    cert,
    None,
    serialization.BestAvailableEncryption(b"123456")
)

# 5. Guardar en disco
ruta_guardado = "app/services/certificado_prueba.pfx"
with open(ruta_guardado, "wb") as f:
    f.write(pfx_data)

print(f"¡Éxito! Archivo guardado en: {ruta_guardado}")