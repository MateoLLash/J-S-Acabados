from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.database import get_db
from app.models.catalogo import Categoria, Proveedor, Marca, Cliente, MetodoPago
from app.schemas.catalogo import (
    CategoriaCreate, CategoriaOut, ProveedorCreate, ProveedorOut,
    MarcaCreate, MarcaOut, ClienteCreate, ClienteOut, MetodoPagoOut,
)
from app.auth.dependencies import get_current_user

router = APIRouter(tags=["catalogos"])


@router.get("/categorias", response_model=List[CategoriaOut])
def listar_categorias(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.query(Categoria).all()


@router.post("/categorias", response_model=CategoriaOut, status_code=201)
def crear_categoria(data: CategoriaCreate, db: Session = Depends(get_db), usuario_actual=Depends(get_current_user)):
    if db.query(Categoria).filter(Categoria.nombre == data.nombre).first():
        raise HTTPException(status_code=400, detail="Esa categoría ya existe")
    
    categoria = Categoria(**data.model_dump())
    db.add(categoria)
    
    try:
        db.execute(text("SELECT set_config('app.current_user_id', :user_id, true)"), {"user_id": str(usuario_actual.id)})
        db.commit()
        db.refresh(categoria)
        return categoria
    finally:
        db.execute(text("SELECT set_config('app.current_user_id', '', true)"))


@router.get("/proveedores", response_model=List[ProveedorOut])
def listar_proveedores(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.query(Proveedor).all()


@router.post("/proveedores", response_model=ProveedorOut, status_code=201)
def crear_proveedor(data: ProveedorCreate, db: Session = Depends(get_db), usuario_actual=Depends(get_current_user)):
    proveedor = Proveedor(**data.model_dump())
    db.add(proveedor)
    
    try:
        db.execute(text("SELECT set_config('app.current_user_id', :user_id, true)"), {"user_id": str(usuario_actual.id)})
        db.commit()
        db.refresh(proveedor)
        return proveedor
    finally:
        db.execute(text("SELECT set_config('app.current_user_id', '', true)"))


@router.put("/proveedores/{proveedor_id}", response_model=ProveedorOut)
def actualizar_proveedor(
    proveedor_id: int, data: ProveedorCreate, db: Session = Depends(get_db), usuario_actual=Depends(get_current_user)
):
    proveedor = db.query(Proveedor).filter(Proveedor.id == proveedor_id).first()
    if proveedor is None:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")

    try:
        db.execute(text("SELECT set_config('app.current_user_id', :user_id, true)"), {"user_id": str(usuario_actual.id)})
        
        proveedor.nombre = data.nombre
        proveedor.contacto = data.contacto
        proveedor.telefono = data.telefono
        proveedor.email = data.email
        
        db.commit()
        db.refresh(proveedor)
        return proveedor
    finally:
        db.execute(text("SELECT set_config('app.current_user_id', '', true)"))


@router.get("/marcas", response_model=List[MarcaOut])
def listar_marcas(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.query(Marca).order_by(Marca.nombre).all()


@router.post("/marcas", response_model=MarcaOut, status_code=201)
def crear_marca(data: MarcaCreate, db: Session = Depends(get_db), usuario_actual=Depends(get_current_user)):
    if db.query(Marca).filter(Marca.nombre == data.nombre).first():
        raise HTTPException(status_code=400, detail="Esa marca ya existe")
        
    marca = Marca(**data.model_dump())
    db.add(marca)
    
    try:
        db.execute(text("SELECT set_config('app.current_user_id', :user_id, true)"), {"user_id": str(usuario_actual.id)})
        db.commit()
        db.refresh(marca)
        return marca
    finally:
        db.execute(text("SELECT set_config('app.current_user_id', '', true)"))


@router.get("/clientes", response_model=List[ClienteOut])
def listar_clientes(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.query(Cliente).order_by(Cliente.nombre).all()


@router.post("/clientes", response_model=ClienteOut, status_code=201)
def crear_cliente(data: ClienteCreate, db: Session = Depends(get_db), usuario_actual=Depends(get_current_user)):
    cliente = Cliente(**data.model_dump())
    db.add(cliente)
    
    try:
        db.execute(text("SELECT set_config('app.current_user_id', :user_id, true)"), {"user_id": str(usuario_actual.id)})
        db.commit()
        db.refresh(cliente)
        return cliente
    finally:
        db.execute(text("SELECT set_config('app.current_user_id', '', true)"))


@router.get("/metodos-pago", response_model=List[MetodoPagoOut])
def listar_metodos_pago(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.query(MetodoPago).order_by(MetodoPago.nombre).all()