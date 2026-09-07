import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Minus, Plus, PackagePlus } from 'lucide-react';
import { styles } from './Tienda.styles';
import { apiFetch } from '../../utils/api';
import { formatMoney, imagenUrl, iconoCategoria } from '../../utils/format';
import { useCarrito } from '../../context/CarritoContext';

const ProductoDetalle = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { agregar } = useCarrito();

  const [producto, setProducto] = useState(null);
  const [cantidad, setCantidad] = useState(1);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [agregado, setAgregado] = useState(false);

  useEffect(() => {
    setCargando(true);
    apiFetch(`/tienda/productos/${id}`)
      .then((data) => {
        setProducto(data);
        setError('');
      })
      .catch((err) => setError(err.message))
      .finally(() => setCargando(false));
  }, [id]);

  if (cargando) {
    return <div style={{ ...styles.content, textAlign: 'center', color: '#f97316' }}>Cargando producto...</div>;
  }

  if (error || !producto) {
    return (
      <div style={styles.content}>
        <button style={styles.secondaryLink} onClick={() => navigate('/tienda')}>
          <ArrowLeft size={14} /> Volver al catálogo
        </button>
        <div style={{ marginTop: '16px', color: '#b91c1c' }}>⚠️ {error || 'Producto no encontrado'}</div>
      </div>
    );
  }

  const handleAgregar = () => {
    agregar(producto, cantidad);
    setAgregado(true);
    setTimeout(() => setAgregado(false), 1800);
  };

  return (
    <div style={styles.content}>
      <button style={styles.secondaryLink} onClick={() => navigate('/tienda')}>
        <ArrowLeft size={14} style={{ verticalAlign: 'middle' }} /> Volver al catálogo
      </button>

      <div style={{ display: 'flex', gap: '32px', marginTop: '20px', flexWrap: 'wrap' }}>
        <div
          style={{
            width: '320px',
            height: '320px',
            backgroundColor: '#f1f5f9',
            borderRadius: '14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '80px',
            overflow: 'hidden',
            flexShrink: 0,
          }}
        >
          {imagenUrl(producto) ? (
            <img src={imagenUrl(producto)} alt={producto.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            iconoCategoria(producto.categoria?.nombre)
          )}
        </div>

        <div style={{ flex: 1, minWidth: '280px' }}>
          <span style={styles.cardCategoria}>{producto.categoria?.nombre || 'General'}{producto.marca ? ` · ${producto.marca.nombre}` : ''}</span>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a', margin: '6px 0' }}>{producto.nombre}</h1>
          <p style={{ fontSize: '28px', fontWeight: 700, color: '#f97316', margin: '10px 0' }}>
            {formatMoney(producto.precio_venta)}
            <span style={{ fontSize: '14px', color: '#94a3b8', fontWeight: 400 }}> / {producto.unidad}</span>
          </p>
          <p style={{ fontSize: '13px', color: producto.stock > 0 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
            {producto.stock > 0 ? `${producto.stock} ${producto.unidad} disponibles` : 'Sin stock por ahora'}
          </p>

          {producto.stock > 0 && (
            <>
              <div style={{ ...styles.qtyControls, marginTop: '18px' }}>
                <button style={styles.qtyBtn} onClick={() => setCantidad((c) => Math.max(1, c - 1))}>
                  <Minus size={14} />
                </button>
                <span style={{ minWidth: '28px', textAlign: 'center', fontSize: '15px' }}>{cantidad}</span>
                <button
                  style={styles.qtyBtn}
                  onClick={() => setCantidad((c) => Math.min(producto.stock, c + 1))}
                  disabled={cantidad >= producto.stock}
                >
                  <Plus size={14} />
                </button>
              </div>

              <button style={{ ...styles.addButton, width: '220px', marginTop: '18px' }} onClick={handleAgregar}>
                <PackagePlus size={16} /> {agregado ? '¡Agregado!' : 'Agregar al carrito'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProductoDetalle;
