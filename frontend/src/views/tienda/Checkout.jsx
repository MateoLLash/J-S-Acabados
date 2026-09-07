import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Minus, Plus, Trash2 } from 'lucide-react';
import { styles } from './Tienda.styles';
import { apiFetch } from '../../utils/api';
import { formatMoney, formatFecha, imagenUrl } from '../../utils/format';
import { useCarrito } from '../../context/CarritoContext';
import { inputStyle, labelStyle } from '../../utils/Modal';

const FORM_VACIO = { nombre: '', telefono: '', email: '', direccion: '' };
const METODOS_PAGO = [
  { valor: 'tienda-online', etiqueta: 'A coordinar (por defecto)' },
  { valor: 'efectivo', etiqueta: 'Efectivo contra entrega' },
  { valor: 'yape', etiqueta: 'Yape / Plin' },
  { valor: 'transferencia', etiqueta: 'Transferencia bancaria' },
];

const Checkout = () => {
  const navigate = useNavigate();
  const { items, actualizarCantidad, quitar, totalMonto, vaciar } = useCarrito();

  const [form, setForm] = useState(FORM_VACIO);
  const [metodoPago, setMetodoPago] = useState('tienda-online');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [pedidoConfirmado, setPedidoConfirmado] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (items.length === 0) return;
    setEnviando(true);
    setError('');
    try {
      const payload = {
        cliente: {
          nombre: form.nombre,
          telefono: form.telefono,
          email: form.email,
          direccion: form.direccion,
        },
        metodo_pago: metodoPago,
        items: items.map((it) => ({ producto_id: it.producto_id, cantidad: it.cantidad })),
      };
      const pedido = await apiFetch('/tienda/pedidos', { method: 'POST', body: JSON.stringify(payload) });
      setPedidoConfirmado(pedido);
      vaciar();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  };

  if (pedidoConfirmado) {
    return (
      <div style={{ ...styles.content, textAlign: 'center', maxWidth: '480px' }}>
        <CheckCircle2 size={52} color="#16a34a" style={{ marginBottom: '12px' }} />
        <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a' }}>¡Pedido registrado!</h1>
        <p style={{ color: '#64748b', fontSize: '14px', marginTop: '6px' }}>
          Pedido #{pedidoConfirmado.id} · {formatFecha(new Date(pedidoConfirmado.fecha))}
        </p>
        <p style={{ fontSize: '22px', fontWeight: 700, color: '#f97316', margin: '14px 0' }}>
          Total: {formatMoney(pedidoConfirmado.total)}
        </p>
        <p style={{ color: '#64748b', fontSize: '13px' }}>
          Nos pondremos en contacto contigo para coordinar el pago y la entrega.
        </p>
        <button style={{ ...styles.primaryButton, marginTop: '20px' }} onClick={() => navigate('/tienda')}>
          Seguir comprando
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div style={{ ...styles.content, textAlign: 'center' }}>
        <p style={{ color: '#64748b' }}>Tu carrito está vacío.</p>
        <button style={styles.secondaryLink} onClick={() => navigate('/tienda')}>Ir al catálogo</button>
      </div>
    );
  }

  return (
    <div style={styles.content}>
      <button style={styles.secondaryLink} onClick={() => navigate('/tienda')}>
        <ArrowLeft size={14} style={{ verticalAlign: 'middle' }} /> Seguir comprando
      </button>

      <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a', margin: '16px 0' }}>Confirmar pedido</h1>

      <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '280px' }}>
          {items.map((it) => (
            <div key={it.producto_id} style={styles.lineItem}>
              <div
                style={{
                  width: 52, height: 52, borderRadius: 8, backgroundColor: '#f1f5f9',
                  overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                {imagenUrl(it) ? (
                  <img src={imagenUrl(it)} alt={it.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : '📦'}
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>{it.nombre}</p>
                <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#f97316', fontWeight: 700 }}>{formatMoney(it.precio_venta)}</p>
                <div style={styles.qtyControls}>
                  <button style={styles.qtyBtn} onClick={() => actualizarCantidad(it.producto_id, it.cantidad - 1)}><Minus size={12} /></button>
                  <span style={{ fontSize: '13px', minWidth: '18px', textAlign: 'center' }}>{it.cantidad}</span>
                  <button style={styles.qtyBtn} onClick={() => actualizarCantidad(it.producto_id, it.cantidad + 1)} disabled={it.cantidad >= (it.stock ?? Infinity)}><Plus size={12} /></button>
                  <button style={{ ...styles.qtyBtn, marginLeft: 'auto', borderColor: '#fecaca', color: '#dc2626' }} onClick={() => quitar(it.producto_id)}><Trash2 size={12} /></button>
                </div>
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 0', fontSize: '15px' }}>
            <span style={{ color: '#64748b' }}>Total</span>
            <span style={{ fontWeight: 700, color: '#0f172a' }}>{formatMoney(totalMonto)}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ flex: 1, minWidth: '280px', backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px' }}>
          <h3 style={{ margin: '0 0 14px', fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>Tus datos de contacto</h3>

          {error && (
            <div style={{ backgroundColor: '#fef2f2', color: '#b91c1c', padding: '8px 12px', borderRadius: '6px', fontSize: '13px', marginBottom: '10px' }}>
              {error}
            </div>
          )}

          <label style={labelStyle}>Nombre completo</label>
          <input required style={inputStyle} value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />

          <label style={labelStyle}>Teléfono</label>
          <input required style={inputStyle} value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />

          <label style={labelStyle}>Correo electrónico</label>
          <input required type="email" style={inputStyle} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />

          <label style={labelStyle}>Dirección de entrega</label>
          <input required style={inputStyle} value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} />

          <label style={labelStyle}>Método de pago</label>
          <select style={inputStyle} value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)}>
            {METODOS_PAGO.map((m) => (
              <option key={m.valor} value={m.valor}>{m.etiqueta}</option>
            ))}
          </select>

          <button type="submit" disabled={enviando} style={{ ...styles.primaryButton, marginTop: '18px', opacity: enviando ? 0.7 : 1 }}>
            {enviando ? 'Enviando pedido...' : 'Confirmar pedido'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Checkout;
