from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import text

from app.database import get_db
from app.models.catalogo import Cliente, Proveedor
from app.models.producto import Producto
from app.schemas.catalogo import ClienteOut, ClienteWebhookIn
from app.integrations.api_keys import verificar_api_key

router = APIRouter(prefix="/api/v1", tags=["integracion"])


# ---------------------------------------------------------------------------
# Esquemas de salida para el otro equipo (mismo estilo camelCase que nos envía Lina)
# ---------------------------------------------------------------------------
class ProductoIntegracionOut(BaseModel):
    id: int
    codigo: str
    nombre: str
    categoria: Optional[str] = None
    marca: Optional[str] = None
    precioVenta: float
    stock: int
    unidad: str


class ProductosIntegracionOut(BaseModel):
    productos: List[ProductoIntegracionOut]


class ProveedorIntegracionOut(BaseModel):
    id: int
    razonSocial: str
    nombreContacto: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None


class ProveedoresIntegracionOut(BaseModel):
    proveedores: List[ProveedorIntegracionOut]


# ---------------------------------------------------------------------------
# CLIENTES (ya existente)
# ---------------------------------------------------------------------------
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


# ---------------------------------------------------------------------------
# PRODUCTOS (nuevo): solo los propios de Acabados J&S
# ---------------------------------------------------------------------------
@router.get("/productos", response_model=ProductosIntegracionOut)
def listar_productos_publico(
    db: Session = Depends(get_db),
    sistema_llamante: str = Depends(verificar_api_key),
):
    '''Endpoint que consume el otro equipo para leer los productos propios de Acabados J&S.'''
    productos = (
        db.query(Producto)
        .options(joinedload(Producto.categoria), joinedload(Producto.marca))
        .filter(Producto.origen == "acabados_js")
        .order_by(Producto.nombre)
        .all()
    )
    return {
        "productos": [
            {
                "id": p.id,
                "codigo": p.codigo,
                "nombre": p.nombre,
                "categoria": p.categoria.nombre if p.categoria else None,
                "marca": p.marca.nombre if p.marca else None,
                "precioVenta": float(p.precio_venta),
                "stock": p.stock,
                "unidad": p.unidad,
            }
            for p in productos
        ]
    }


@router.get("/productos/{producto_id}", response_model=ProductoIntegracionOut)
def obtener_producto_publico(
    producto_id: int,
    db: Session = Depends(get_db),
    sistema_llamante: str = Depends(verificar_api_key),
):
    p = (
        db.query(Producto)
        .filter(Producto.id == producto_id, Producto.origen == "acabados_js")
        .first()
    )
    if p is None:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    return {
        "id": p.id,
        "codigo": p.codigo,
        "nombre": p.nombre,
        "categoria": p.categoria.nombre if p.categoria else None,
        "marca": p.marca.nombre if p.marca else None,
        "precioVenta": float(p.precio_venta),
        "stock": p.stock,
        "unidad": p.unidad,
    }


# ---------------------------------------------------------------------------
# PROVEEDORES (nuevo): solo los propios de Acabados J&S
# ---------------------------------------------------------------------------
@router.get("/proveedores", response_model=ProveedoresIntegracionOut)
def listar_proveedores_publico(
    db: Session = Depends(get_db),
    sistema_llamante: str = Depends(verificar_api_key),
):
    '''Endpoint que consume el otro equipo para leer los proveedores propios de Acabados J&S.'''
    proveedores = (
        db.query(Proveedor)
        .filter(Proveedor.origen == "acabados_js")
        .order_by(Proveedor.nombre)
        .all()
    )
    return {
        "proveedores": [
            {
                "id": pr.id,
                "razonSocial": pr.nombre,
                "nombreContacto": pr.contacto,
                "telefono": pr.telefono,
                "email": pr.email,
            }
            for pr in proveedores
        ]
    }


@router.get("/proveedores/{proveedor_id}", response_model=ProveedorIntegracionOut)
def obtener_proveedor_publico(
    proveedor_id: int,
    db: Session = Depends(get_db),
    sistema_llamante: str = Depends(verificar_api_key),
):
    pr = (
        db.query(Proveedor)
        .filter(Proveedor.id == proveedor_id, Proveedor.origen == "acabados_js")
        .first()
    )
    if pr is None:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")
    return {
        "id": pr.id,
        "razonSocial": pr.nombre,
        "nombreContacto": pr.contacto,
        "telefono": pr.telefono,
        "email": pr.email,
    }


# ---------------------------------------------------------------------------
# WEBHOOK de clientes (ya existente)
# ---------------------------------------------------------------------------
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
        origen="lina",
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