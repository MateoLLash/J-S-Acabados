import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';

// Contexto del carrito de la tienda pública (/tienda).
// Se persiste en localStorage para que sobreviva a un refresh de página,
// pero es independiente del localStorage que usa el panel admin (token, role, etc).
const CLAVE_STORAGE = 'tienda_carrito';
const CarritoContext = createContext(null);

function cargarInicial() {
  try {
    const raw = localStorage.getItem(CLAVE_STORAGE);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

export function CarritoProvider({ children }) {
  const [items, setItems] = useState(cargarInicial);

  useEffect(() => {
    localStorage.setItem(CLAVE_STORAGE, JSON.stringify(items));
  }, [items]);

  const agregar = (producto, cantidad = 1) => {
    setItems((prev) => {
      const existente = prev.find((it) => it.producto_id === producto.id);
      const stockDisponible = producto.stock ?? Infinity;
      if (existente) {
        const nuevaCantidad = Math.min(existente.cantidad + cantidad, stockDisponible);
        return prev.map((it) =>
          it.producto_id === producto.id ? { ...it, cantidad: nuevaCantidad } : it
        );
      }
      return [
        ...prev,
        {
          producto_id: producto.id,
          nombre: producto.nombre,
          precio_venta: Number(producto.precio_venta),
          imagen_url: producto.imagen_url,
          unidad: producto.unidad,
          stock: stockDisponible,
          cantidad: Math.min(cantidad, stockDisponible),
        },
      ];
    });
  };

  const actualizarCantidad = (productoId, cantidad) => {
    setItems((prev) =>
      prev
        .map((it) =>
          it.producto_id === productoId
            ? { ...it, cantidad: Math.max(1, Math.min(cantidad, it.stock ?? Infinity)) }
            : it
        )
    );
  };

  const quitar = (productoId) => {
    setItems((prev) => prev.filter((it) => it.producto_id !== productoId));
  };

  const vaciar = () => setItems([]);

  const totalItems = useMemo(() => items.reduce((acc, it) => acc + it.cantidad, 0), [items]);
  const totalMonto = useMemo(
    () => items.reduce((acc, it) => acc + it.cantidad * it.precio_venta, 0),
    [items]
  );

  const value = { items, agregar, actualizarCantidad, quitar, vaciar, totalItems, totalMonto };

  return <CarritoContext.Provider value={value}>{children}</CarritoContext.Provider>;
}

export function useCarrito() {
  const ctx = useContext(CarritoContext);
  if (!ctx) throw new Error('useCarrito debe usarse dentro de <CarritoProvider>');
  return ctx;
}
