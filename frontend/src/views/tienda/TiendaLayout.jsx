import React, { useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { ShoppingCart, Store, Minus, Plus, Trash2, X } from 'lucide-react';
import { styles } from './Tienda.styles';
import { useCarrito } from '../../context/CarritoContext';
import { formatMoney, imagenUrl } from '../../utils/format';

const TiendaLayout = () => {
  const navigate = useNavigate();
  const [carritoAbierto, setCarritoAbierto] = useState(false);
  const { items, actualizarCantidad, quitar, totalItems, totalMonto } = useCarrito();

  const irACheckout = () => {
    setCarritoAbierto(false);
    navigate('/tienda/checkout');
  };

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.brand} onClick={() => navigate('/tienda')}>
          <Store size={22} color="#f97316" />
          <div>
            <p style={styles.brandTitle}>Acabados J&S</p>
            <p style={styles.brandSubtitle}>Tienda online · Materiales de acabado</p>
          </div>
        </div>
        <button style={styles.cartButton} onClick={() => setCarritoAbierto(true)}>
          <ShoppingCart size={18} />
          Carrito
          {totalItems > 0 && <span style={styles.cartBadge}>{totalItems}</span>}
        </button>
      </header>

      <Outlet />

      <footer style={styles.footer}>
        Acabados J&S — Pedidos referenciales, coordinamos contigo el pago y la entrega.
      </footer>

      {carritoAbierto && (
        <div style={styles.drawerOverlay} onClick={() => setCarritoAbierto(false)}>
          <div style={styles.drawer} onClick={(e) => e.stopPropagation()}>
            <div style={styles.drawerHeader}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Tu carrito</h3>
              <button
                onClick={() => setCarritoAbierto(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={styles.drawerItems}>
              {items.length === 0 ? (
                <div style={styles.emptyState}>
                  <ShoppingCart size={32} />
                  <p>Tu carrito está vacío.</p>
                </div>
              ) : (
                items.map((it) => (
                  <div key={it.producto_id} style={styles.lineItem}>
                    <div
                      style={{
                        width: 52,
                        height: 52,
                        borderRadius: 8,
                        backgroundColor: '#f1f5f9',
                        overflow: 'hidden',
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {imagenUrl(it) ? (
                        <img src={imagenUrl(it)} alt={it.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        '📦'
                      )}
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>{it.nombre}</p>
                      <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#f97316', fontWeight: 700 }}>
                        {formatMoney(it.precio_venta)}
                      </p>
                      <div style={styles.qtyControls}>
                        <button style={styles.qtyBtn} onClick={() => actualizarCantidad(it.producto_id, it.cantidad - 1)}>
                          <Minus size={12} />
                        </button>
                        <span style={{ fontSize: '13px', minWidth: '18px', textAlign: 'center' }}>{it.cantidad}</span>
                        <button
                          style={styles.qtyBtn}
                          onClick={() => actualizarCantidad(it.producto_id, it.cantidad + 1)}
                          disabled={it.cantidad >= (it.stock ?? Infinity)}
                        >
                          <Plus size={12} />
                        </button>
                        <button
                          style={{ ...styles.qtyBtn, marginLeft: 'auto', borderColor: '#fecaca', color: '#dc2626' }}
                          onClick={() => quitar(it.producto_id)}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {items.length > 0 && (
              <div style={styles.drawerFooter}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px', fontSize: '14px' }}>
                  <span style={{ color: '#64748b' }}>Total</span>
                  <span style={{ fontWeight: 700, color: '#0f172a' }}>{formatMoney(totalMonto)}</span>
                </div>
                <button style={styles.primaryButton} onClick={irACheckout}>
                  Continuar con el pedido
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TiendaLayout;
