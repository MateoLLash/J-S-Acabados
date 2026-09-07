import os
from dotenv import load_dotenv

load_dotenv()

# Lee directamente la URI completa de Supabase desde el .env
DATABASE_URL = os.getenv("DATABASE_URL")

JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-secret-key")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "480"))
TIENDA_USUARIO_EMAIL = os.getenv("TIENDA_USUARIO_EMAIL", "tienda-online@acabadosjys.pe")