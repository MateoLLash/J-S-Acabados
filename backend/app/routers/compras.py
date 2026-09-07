from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.compra import Compra
from app.schemas.compra import CompraCreate, CompraOut
from app.auth.dependencies import get_current_user
from app.services.compra_service import crear_compra, recibir_compra

router = APIRouter(prefix="/compras", tags=["compras"])


@router.get("/", response_model=List[CompraOut])
def listar_compras(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.query(Compra).order_by(Compra.fecha.desc()).all()


@router.post("/", response_model=CompraOut, status_code=201)
def registrar_compra(data: CompraCreate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return crear_compra(db, data, user.id)


@router.post("/{compra_id}/recibir", response_model=CompraOut)
def marcar_recibida(compra_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return recibir_compra(db, compra_id, user.id)
