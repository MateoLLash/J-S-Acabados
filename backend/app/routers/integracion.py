
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
    ID_USUARIO_SISTEMA_INTEGRACION = 1  # tiene que existir en la tabla usuarios

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
    except Exception:
        db.rollback()
        raise