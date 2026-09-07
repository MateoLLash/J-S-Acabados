import re
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import text

from app.database import get_db
from app.models.producto import Producto
from app.models.catalogo import Categoria, Cliente, MetodoPago
from app.models.usuario import Usuario
from app.models.venta import Venta, VentaDetalle
from app.models.inventario import MovimientoInventario
from app.schemas.catalogo import CategoriaOut
from app.schemas.tienda import (
    ProductoTiendaOut,
    PedidoCreate,
    PedidoOut,
    ClientePedidoOut,
    ItemPedidoOut,
)
from app.schemas.venta import TIPO_COMPROBANTE_A_DOCUMENTO
from app.services.stock_service import validar_movimiento
from app.config import TIENDA_USUARIO_EMAIL

router = APIRouter(prefix="/tienda", tags=["tienda"])

# Series simples usadas por la tienda online para numerar boletas/facturas.
# No son un correlativo SUNAT real (eso requiere integración con un OSE/PSE),
# solo sirven para que el comprobante impreso tenga un número de referencia.
SERIE_POR_COMPROBANTE = {
    "boleta": "B001",
    "factura": "F001",
}


def _usuario_tienda(db: Session) -> Usuario:
    usuario = db.query(Usuario).filter(Usuario.email == TIENDA_USUARIO_EMAIL).first()
    if usuario is None:
        raise HTTPException(
            status_code=500,
            detail=(
                "No existe el usuario de sistema de la tienda online. "
                "Corre 'python -m scripts.crear_usuario_tienda' en el backend."
            ),
        )
    return usuario


def _metodo_pago_tienda(db: Session, nombre: Optional[str]) -> Optional[int]:
    """Resuelve el nombre de método de pago mandado por la tienda a su id.
    Si no se manda nada o no existe, cae en 'tienda-online'."""
    nombre_buscado = nombre or "tienda-online"
    metodo = db.query(MetodoPago).filter(MetodoPago.nombre == nombre_buscado).first()
    if metodo is None:
        metodo = db.query(MetodoPago).filter(MetodoPago.nombre == "tienda-online").first()
    return metodo.id if metodo else None


def _validar_documento(tipo_comprobante: str, documento: Optional[str]) -> Optional[str]:
    """Valida el DNI/RUC según el tipo de comprobante pedido.
    - factura -> exige RUC de 11 dígitos (obligatorio, va a nombre de una empresa).
    - boleta  -> DNI de 8 dígitos, opcional (se puede emitir a 'Cliente General')."""
    documento = (documento or "").strip()

    if tipo_comprobante == "factura":
        if not re.fullmatch(r"\d{11}", documento):
            raise HTTPException(
                status_code=400,
                detail="Para emitir factura debes indicar un RUC válido de 11 dígitos.",
            )
        return documento

    # boleta
    if documento and not re.fullmatch(r"\d{8}", documento):
        raise HTTPException(
            status_code=400,
            detail="El DNI debe tener 8 dígitos.",
        )
    return documento or None


def _cliente_tienda(db: Session, nombre: str, telefono: str, email: str, direccion: str, documento: Optional[str]) -> Cliente:
    """Busca un cliente existente por documento (DNI/RUC) o, si no viene,
    por teléfono; si no existe ninguno, crea uno nuevo.
    Buscar primero por documento evita el error de 'documento duplicado':
    como `documento` es UNIQUE en la BD, si dos pedidos llegan con
    teléfonos distintos pero el mismo DNI/RUC, deben apuntar al MISMO
    cliente en vez de intentar crear/actualizar una fila distinta con un
    documento que ya está en uso por otra."""
    cliente = None
    if documento:
        cliente = db.query(Cliente).filter(Cliente.documento == documento).first()
    if cliente is None:
        cliente = db.query(Cliente).filter(Cliente.telefono == telefono).first()

    if cliente is None:
        cliente = Cliente(
            nombre=nombre,
            telefono=telefono,
            email=email,
            direccion=direccion,
            documento=documento,
        )
        db.add(cliente)
        db.flush()
    else:
        cliente.nombre = nombre or cliente.nombre
        cliente.telefono = telefono or cliente.telefono
        cliente.email = email or cliente.email
        cliente.direccion = direccion or cliente.direccion
        cliente.documento = documento or cliente.documento
    return cliente


@router.get("/productos", response_model=List[ProductoTiendaOut])
def listar_productos_tienda(
    categoria_id: Optional[int] = None,
    limit: Optional[int] = None,
    db: Session = Depends(get_db),
):
    query = db.query(Producto).filter(Producto.stock > 0)
    if categoria_id:
        query = query.filter(Producto.categoria_id == categoria_id)
    query = query.order_by(Producto.nombre)
    if limit:
        query = query.limit(limit)
    return query.all()


@router.get("/productos/{producto_id}", response_model=ProductoTiendaOut)
def obtener_producto_tienda(producto_id: int, db: Session = Depends(get_db)):
    producto = db.query(Producto).filter(Producto.id == producto_id).first()
    if producto is None:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    return producto


@router.get("/categorias", response_model=List[CategoriaOut])
def listar_categorias_tienda(db: Session = Depends(get_db)):
    return db.query(Categoria).order_by(Categoria.nombre).all()


@router.post("/pedidos", response_model=PedidoOut, status_code=201)
def crear_pedido_tienda(data: PedidoCreate, db: Session = Depends(get_db)):
    if not data.items:
        raise HTTPException(status_code=400, detail="El pedido no tiene productos")

    usuario_tienda = _usuario_tienda(db)
    documento = _validar_documento(data.tipo_comprobante, data.cliente.documento)

    # El precio SIEMPRE se toma de la BD, nunca de lo que mande el cliente
    # (si no, cualquiera podría mandar el precio que quiera desde el navegador).
    productos = {}
    for item in data.items:
        producto = db.query(Producto).filter(Producto.id == item.producto_id).first()
        if producto is None:
            raise HTTPException(status_code=404, detail=f"Producto {item.producto_id} no existe")
        if item.cantidad <= 0:
            raise HTTPException(status_code=400, detail=f"Cantidad inválida para '{producto.nombre}'")
        productos[item.producto_id] = producto

    total = sum(productos[item.producto_id].precio_venta * item.cantidad for item in data.items)

    try:
        # ---> AQUÍ AVISAMOS A POSTGRESQL QUIÉN HACE LA TRANSACCIÓN (Usuario de la Tienda) <---
        db.execute(text("SELECT set_config('app.current_user_id', :user_id, true)"), {"user_id": str(usuario_tienda.id)})

        cliente = _cliente_tienda(
            db,
            nombre=data.cliente.nombre,
            telefono=data.cliente.telefono,
            email=data.cliente.email,
            direccion=data.cliente.direccion,
            documento=documento,
        )
        metodo_pago_id = _metodo_pago_tienda(db, data.metodo_pago)

        venta = Venta(
            cliente_id=cliente.id,
            tipo_comprobante=data.tipo_comprobante,
            tipo_documento_id=TIPO_COMPROBANTE_A_DOCUMENTO[data.tipo_comprobante],
            serie=SERIE_POR_COMPROBANTE[data.tipo_comprobante],
            usuario_id=usuario_tienda.id,
            total=total,
            metodo_pago_id=metodo_pago_id,
        )
        db.add(venta)
        db.flush()
        venta.numero = venta.id  # correlativo simple: usamos el id de la venta

        detalles: List[VentaDetalle] = []
        try:
            for item in data.items:
                producto = productos[item.producto_id]
                validar_movimiento(producto, "salida", item.cantidad)  # solo valida disponibilidad

                detalle = VentaDetalle(
                    venta_id=venta.id,
                    producto_id=producto.id,
                    cantidad=item.cantidad,
                    precio_unitario=producto.precio_venta,
                )
                db.add(detalle)
                detalles.append((detalle, producto))
                db.add(MovimientoInventario(
                    producto_id=producto.id,
                    venta_id=venta.id,
                    tipo="salida",
                    cantidad=item.cantidad,
                    usuario_id=usuario_tienda.id,
                    detalle=f"Pedido tienda online #{venta.id} — {data.cliente.nombre}",
                ))
        except HTTPException:
            db.rollback()
            raise

        db.commit()
        db.refresh(venta)

    finally:
        # ---> LIMPIEZA OBLIGATORIA DE LA SESIÓN <---
        db.execute(text("SELECT set_config('app.current_user_id', '', true)"))

    # Armamos la respuesta a mano (en vez de devolver el objeto ORM tal cual)
    # porque el frontend necesita código/nombre de producto por cada línea,
    # y esos datos viven en la relación `producto`, no en VentaDetalle.
    return PedidoOut(
        id=venta.id,
        total=venta.total,
        fecha=venta.fecha,
        tipo_comprobante=venta.tipo_comprobante,
        tipo_documento_id=venta.tipo_documento_id,
        serie=venta.serie,
        numero=venta.numero,
        cliente=ClientePedidoOut(
            nombre=cliente.nombre,
            telefono=cliente.telefono,
            email=cliente.email,
            direccion=cliente.direccion,
            documento=cliente.documento,
        ),
        items=[
            ItemPedidoOut(
                producto_id=producto.id,
                codigo=producto.codigo,
                nombre=producto.nombre,
                cantidad=detalle.cantidad,
                precio_unitario=detalle.precio_unitario,
            )
            for detalle, producto in detalles
        ],
    )