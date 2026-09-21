
from typing import List
 
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
 
from app.database import get_db
from app.models.catalogo import Cliente
from app.schemas.catalogo import ClienteOut, ClienteWebhookIn
from app.integrations.api_keys import verificar_api_key
 
router = APIRouter(prefix="/api/v1", tags=["integracion"])
 
 
@router.get("/clientes", response_model=List[ClienteOut])
def listar_clientes_publico(
    db: Session = Depends(get_db),
    sistema_llamante: str = Depends(verificar_api_key),
):
    '''Endpoint que consume el otro equipo para leer tus clientes.'''
    return db.query(Cliente).order_by(Cliente.nombre).all()
 
 
@router.get("/clientes/{cliente_id}", response_model=ClienteOut)
def obtener_cliente_publico(
    cliente_id: int,
    db: Session = Depends(get_db),
    sistema_llamante: str = Depends(verificar_api_key),
):
    cliente = db.query(Cliente).filter(Cliente.id == cliente_id).first()
    if cliente is None:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    return cliente
 
 
@router.post("/webhooks/cliente-externo", response_model=ClienteOut, status_code=201)
def recibir_cliente_externo(
    payload: ClienteWebhookIn,
    db: Session = Depends(get_db),
    sistema_llamante: str = Depends(verificar_api_key),
):
    '''
    El otro equipo llama esto cuando ELLOS crean un cliente nuevo.
 
    NOTA IMPORTANTE sobre tu Row Level Security:
    Tus otros endpoints hacen set_config('app.current_user_id', ...) usando el
    usuario logueado (get_current_user). Aqui NO hay usuario logueado, es un
    sistema externo autenticado por API Key. Tienes 2 opciones:
 
      a) Si tu policy de RLS en Postgres EXIGE un current_user_id valido para
         insertar en `clientes`, crea un "usuario de sistema" fijo en tu tabla
         de usuarios (ej. id=0 o un id reservado para integraciones) y usa
         ese id aqui.
      b) Si tu policy permite inserts sin ese contexto (o tiene un default),
         puedes omitir el set_config.
 
    Aqui uso la opcion (a) como ejemplo -- AJUSTA el ID segun tu caso real.
    '''
    ID_USUARIO_SISTEMA_INTEGRACION = 0  # <-- AJUSTA esto a tu caso real
 
    cliente = Cliente(
        nombre=payload.nombre,
        documento=payload.documento,
        telefono=payload.telefono,
        email=payload.email,
    )
    db.add(cliente)
 
    try:
        db.execute(
            text("SELECT set_config('app.current_user_id', :user_id, true)"),
            {"user_id": str(ID_USUARIO_SISTEMA_INTEGRACION)},
        )
        db.commit()
        db.refresh(cliente)
        return cliente
    finally:
        db.execute(text("SELECT set_config('app.current_user_id', '', true)"))