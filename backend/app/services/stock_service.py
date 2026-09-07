from fastapi import HTTPException, status

from app.models.producto import Producto


def validar_movimiento(producto: Producto, tipo: str, cantidad: int) -> int:
    """
    Valida que el movimiento sea posible y devuelve cuál sería el stock
    resultante, pero NO lo escribe en producto.stock.

    El stock real se actualiza en la base de datos por los triggers
    trg_movimientos_after_insert / trg_movimientos_after_delete al insertar
    en movimientos_inventario. Si este servicio también
    escribiera producto.stock, el stock quedaría duplicado (se aplicaría
    dos veces el mismo movimiento). El trigger de la BD es la única fuente
    de verdad.

    entrada -> sumaría cantidad (siempre positiva)
    salida  -> restaría cantidad (siempre positiva)
    ajuste  -> sumaría cantidad tal cual (puede ser negativa, ej: -2)
    Lanza 400 si el resultado quedaría negativo.
    """
    if tipo == "entrada":
        nuevo_stock = producto.stock + abs(cantidad)
    elif tipo == "salida":
        nuevo_stock = producto.stock - abs(cantidad)
    elif tipo == "ajuste":
        nuevo_stock = producto.stock + cantidad
    else:
        raise HTTPException(status_code=400, detail="Tipo de movimiento inválido")

    if nuevo_stock < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Stock insuficiente para '{producto.nombre}' (disponible: {producto.stock})",
        )

    return nuevo_stock