import React, { useState, useEffect } from 'react';
import { Plus, Eye, Check, Building2, Pencil } from 'lucide-react';
import { styles } from './InventoryDashboard.styles';
import { apiFetch } from '../../utils/api';
import Modal, { inputStyle, labelStyle, primaryButtonStyle, secondaryButtonStyle } from '../../utils/Modal';

const Compras = () => {
  const [activeTab, setActiveTab] = useState('ordenes');
  const [compras, setCompras] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [productos, setProductos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editandoProveedorId, setEditandoProveedorId] = useState(null);

  // Modal nueva compra
  const [modalCompra, setModalCompra] = useState(false);
  const [formCompra, setFormCompra] = useState({ proveedor_id: '', items: [{ producto_id: '', cantidad: '', precio_unitario: '' }] });
  const [guardandoCompra, setGuardandoCompra] = useState(false);
  const [errorCompra, setErrorCompra] = useState('');

  // Modal detalle
  const [compraDetalle, setCompraDetalle] = useState(null);

  // Modal nuevo/editar proveedor
  const [modalProveedor, setModalProveedor] = useState(false);
  const [formProveedor, setFormProveedor] = useState({ nombre: '', contacto: '', telefono: '', email: '' });
  const [guardandoProveedor, setGuardandoProveedor] = useState(false);
  const [errorProveedor, setErrorProveedor] = useState('');

  const cargarTodo = async () => {
    try {
      setLoading(true);
      const [comprasData, proveedoresData, productosData] = await Promise.all([
        apiFetch('/compras/'),
        apiFetch('/proveedores'),
        apiFetch('/productos/'),
      ]);
      setCompras(comprasData);
      setProveedores(proveedoresData);
      setProductos(productosData);
      setError('');
    } catch (err) {
      console.error('Error cargando compras:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarTodo();
  }, []);

  const totalMontoCompras = compras.reduce((sum, item) => sum + Number(item.total || 0), 0);

  const proveedorNombre = (id) => proveedores.find((p) => p.id === id)?.nombre || `Proveedor #${id}`;

  // Métricas por proveedor calculadas a partir de las compras reales (para las tarjetas)
  const proveedoresConMetricas = proveedores.map((prov) => {
    const ordenesProveedor = compras.filter((c) => c.proveedor_id === prov.id);
    const totalComprado = ordenesProveedor.reduce((sum, c) => sum + Number(c.total || 0), 0);
    return { ...prov, numOrdenes: ordenesProveedor.length, totalComprado };
  });

  // --- Nueva compra ---
  const abrirNuevaCompra = () => {
    setFormCompra({ proveedor_id: '', items: [{ producto_id: '', cantidad: '', precio_unitario: '' }] });
    setErrorCompra('');
    setModalCompra(true);
  };

  const actualizarItem = (idx, campo, valor) => {
    const items = [...formCompra.items];
    items[idx] = { ...items[idx], [campo]: valor };
    // Autocompletar precio de compra sugerido al elegir producto
    if (campo === 'producto_id') {
      const prod = productos.find((p) => p.id === Number(valor));
      if (prod) items[idx].precio_unitario = prod.precio_compra;
    }
    setFormCompra({ ...formCompra, items });
  };

  const agregarItem = () => {
    setFormCompra({ ...formCompra, items: [...formCompra.items, { producto_id: '', cantidad: '', precio_unitario: '' }] });
  };

  const quitarItem = (idx) => {
    setFormCompra({ ...formCompra, items: formCompra.items.filter((_, i) => i !== idx) });
  };

  const totalNuevaCompra = formCompra.items.reduce(
    (acc, it) => acc + (Number(it.cantidad) || 0) * (Number(it.precio_unitario) || 0),
    0
  );

  const handleGuardarCompra = async (e) => {
    e.preventDefault();
    setGuardandoCompra(true);
    setErrorCompra('');
    try {
      const payload = {
        proveedor_id: Number(formCompra.proveedor_id),
        items: formCompra.items.map((it) => ({
          producto_id: Number(it.producto_id),
          cantidad: Number(it.cantidad),
          precio_unitario: Number(it.precio_unitario),
        })),
      };
      await apiFetch('/compras/', { method: 'POST', body: JSON.stringify(payload) });
      setModalCompra(false);
      cargarTodo();
    } catch (err) {
      setErrorCompra(err.message);
    } finally {
      setGuardandoCompra(false);
    }
  };

  const handleRecibir = async (compra) => {
    try {
      await apiFetch(`/compras/${compra.id}/recibir`, { method: 'POST' });
      cargarTodo();
    } catch (err) {
      alert(`No se pudo marcar como recibida: ${err.message}`);
    }
  };

  // --- Nuevo / editar proveedor ---
  const handleGuardarProveedor = async (e) => {
    e.preventDefault();
    setGuardandoProveedor(true);
    setErrorProveedor('');
    try {
      const payload = {
        nombre: formProveedor.nombre,
        contacto: formProveedor.contacto || null,
        telefono: formProveedor.telefono || null,
        email: formProveedor.email || null,
      };

      if (editandoProveedorId) {
        await apiFetch(`/proveedores/${editandoProveedorId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch('/proveedores', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }

      setModalProveedor(false);
      setEditandoProveedorId(null);
      setFormProveedor({ nombre: '', contacto: '', telefono: '', email: '' });
      cargarTodo();
    } catch (err) {
      setErrorProveedor(err.message);
    } finally {
      setGuardandoProveedor(false);
    }
  };

  const abrirNuevoProveedor = () => {
    setFormProveedor({ nombre: '', contacto: '', telefono: '', email: '' });
    setEditandoProveedorId(null);
    setErrorProveedor('');
    setModalProveedor(true);
  };

  const abrirEdicionProveedor = (prov) => {
    setFormProveedor({
      nombre: prov.nombre,
      contacto: prov.contacto || '',
      telefono: prov.telefono || '',
      email: prov.email || '',
    });
    setEditandoProveedorId(prov.id);
    setErrorProveedor('');
    setModalProveedor(true);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <h3 style={{ fontFamily: 'sans-serif', color: '#f97316' }}>Cargando módulo de compras...</h3>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', gap: '20px', fontFamily: 'sans-serif' }}>

      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '700', color: '#1e293b' }}>Compras</h1>
          <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: '#64748b' }}>
            {compras.length} órdenes · S/ {totalMontoCompras.toFixed(2)} en compras
          </p>
        </div>
        <button onClick={abrirNuevaCompra} style={{ backgroundColor: '#1e3a8a', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: '6px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px' }}>
          <Plus size={16} /> Nueva compra
        </button>
      </div>

      {error && (
        <div style={{ backgroundColor: '#fef2f2', color: '#b91c1c', padding: '10px 16px', borderRadius: '8px', fontSize: '13px' }}>
          {error}
        </div>
      )}

      {/* TABS */}
      <div style={{ display: 'flex', gap: '8px', background: '#e2e8f0', padding: '4px', borderRadius: '8px', width: 'fit-content' }}>
        <button
          onClick={() => setActiveTab('ordenes')}
          style={{ border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: '600', backgroundColor: activeTab === 'ordenes' ? '#fff' : 'transparent', color: activeTab === 'ordenes' ? '#1e293b' : '#64748b' }}
        >
          Órdenes de compra
        </button>
        <button
          onClick={() => setActiveTab('proveedores')}
          style={{ border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: '600', backgroundColor: activeTab === 'proveedores' ? '#fff' : 'transparent', color: activeTab === 'proveedores' ? '#1e293b' : '#64748b' }}
        >
          Proveedores
        </button>
      </div>

      {/* CONTENIDO TABLA */}
      {activeTab === 'ordenes' ? (
        <div style={{ ...styles.tableCard, width: '100%', marginTop: 0, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={{ ...styles.th, color: '#94a3b8', fontSize: '11px' }}>#</th>
                <th style={{ ...styles.th, color: '#94a3b8', fontSize: '11px' }}>FECHA</th>
                <th style={{ ...styles.th, color: '#94a3b8', fontSize: '11px' }}>PROVEEDOR</th>
                <th style={{ ...styles.th, color: '#94a3b8', fontSize: '11px' }}>PRODUCTOS</th>
                <th style={{ ...styles.th, color: '#94a3b8', fontSize: '11px' }}>TOTAL</th>
                <th style={{ ...styles.th, color: '#94a3b8', fontSize: '11px' }}>ESTADO</th>
                <th style={{ ...styles.th, color: '#94a3b8', fontSize: '11px', textAlign: 'center' }}></th>
              </tr>
            </thead>
            <tbody>
              {compras.length === 0 ? (
                <tr><td colSpan="7" style={{ ...styles.td, textAlign: 'center', color: '#64748b' }}>Aún no hay compras registradas.</td></tr>
              ) : compras.map((row) => {
                const esRecibido = row.estado === 'recibido' || row.estado === 'Recibido';
                return (
                  <tr key={row.id}>
                    <td style={{ ...styles.td, color: '#64748b', fontSize: '13px' }}>OC-{String(row.id).padStart(4, '0')}</td>
                    <td style={{ ...styles.td, color: '#64748b', fontSize: '13px' }}>{new Date(row.fecha).toLocaleDateString('es-PE')}</td>
                    <td style={{ ...styles.td, color: '#1e293b', fontSize: '13px' }}><strong>{proveedorNombre(row.proveedor_id)}</strong></td>
                    <td style={{ ...styles.td, color: '#64748b', fontSize: '13px' }}>{row.items?.length || 0} items</td>
                    <td style={{ ...styles.td, color: '#1e3a8a', fontSize: '13px', fontWeight: '700' }}>S/ {Number(row.total).toFixed(2)}</td>
                    <td style={styles.td}>
                      <span style={{
                        backgroundColor: esRecibido ? '#f0fdf4' : '#fff7ed',
                        color: esRecibido ? '#16a34a' : '#f97316',
                        padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '600', textTransform: 'capitalize',
                      }}>
                        {row.estado}
                      </span>
                    </td>
                    <td style={{ ...styles.td, textAlign: 'center', display: 'flex', gap: '10px', justifyContent: 'center' }}>
                      <Eye size={16} color="#3b82f6" style={{ cursor: 'pointer' }} onClick={() => setCompraDetalle(row)} />
                      {!esRecibido && (
                        <Check size={16} color="#16a34a" style={{ cursor: 'pointer' }} onClick={() => handleRecibir(row)} title="Marcar como recibida" />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
            <button
              onClick={abrirNuevoProveedor}
              style={{ background: 'none', border: '1px dashed #94a3b8', color: '#475569', padding: '7px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Plus size={14} /> Nuevo proveedor
            </button>
          </div>

          {proveedoresConMetricas.length === 0 ? (
            <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', color: '#64748b', textAlign: 'center' }}>
              Aún no hay proveedores registrados.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '20px', width: '100%' }}>
              {proveedoresConMetricas.map((prov) => (
                <div key={prov.id} style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', padding: '20px' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px' }}>
                    <Building2 size={20} color="#1e3a8a" />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '700', color: '#1e293b' }}>{prov.nombre}</h3>
                    <button
                      onClick={() => abrirEdicionProveedor(prov)}
                      style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '2px' }}
                      title="Editar proveedor"
                    >
                      <Pencil size={14} />
                    </button>
                  </div>
                  <p style={{ margin: '4px 0 14px 0', fontSize: '12px', color: '#94a3b8' }}>{prov.numOrdenes} órdenes</p>
                  <p style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: '#1e3a8a' }}>S/ {prov.totalComprado.toFixed(2)}</p>
                  <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#94a3b8' }}>total comprado</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MODAL NUEVA COMPRA */}
      {modalCompra && (
        <Modal title="Nueva orden de compra" onClose={() => setModalCompra(false)} width="640px">
          <form onSubmit={handleGuardarCompra}>
            {errorCompra && (
              <div style={{ backgroundColor: '#fef2f2', color: '#b91c1c', padding: '8px 12px', borderRadius: '6px', fontSize: '13px', marginBottom: '8px' }}>
                {errorCompra}
              </div>
            )}

            <label style={labelStyle}>Proveedor</label>
            <select required style={inputStyle} value={formCompra.proveedor_id} onChange={(e) => setFormCompra({ ...formCompra, proveedor_id: e.target.value })}>
              <option value="">Selecciona un proveedor</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>

            <div style={{ marginTop: '16px' }}>
              <label style={labelStyle}>Productos</label>
              {formCompra.items.map((item, idx) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: '8px', marginTop: '8px', alignItems: 'center' }}>
                  <select required style={{ ...inputStyle, marginTop: 0 }} value={item.producto_id} onChange={(e) => actualizarItem(idx, 'producto_id', e.target.value)}>
                    <option value="">Producto</option>
                    {productos.map((p) => (
                      <option key={p.id} value={p.id}>{p.nombre}</option>
                    ))}
                  </select>
                  <input required type="number" min="1" placeholder="Cant." style={{ ...inputStyle, marginTop: 0 }} value={item.cantidad} onChange={(e) => actualizarItem(idx, 'cantidad', e.target.value)} />
                  <input required type="number" min="0" step="0.01" placeholder="P. unit." style={{ ...inputStyle, marginTop: 0 }} value={item.precio_unitario} onChange={(e) => actualizarItem(idx, 'precio_unitario', e.target.value)} />
                  <button type="button" onClick={() => quitarItem(idx)} disabled={formCompra.items.length === 1} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: formCompra.items.length === 1 ? 'not-allowed' : 'pointer', opacity: formCompra.items.length === 1 ? 0.4 : 1, fontSize: '18px' }}>×</button>
                </div>
              ))}
              <button type="button" onClick={agregarItem} style={{ marginTop: '10px', background: 'none', border: '1px dashed #94a3b8', color: '#475569', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>
                + Agregar producto
              </button>
            </div>

            <div style={{ marginTop: '18px', textAlign: 'right', fontSize: '15px', fontWeight: 700, color: '#1e3a8a' }}>
              Total: S/ {totalNuevaCompra.toFixed(2)}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '18px' }}>
              <button type="button" style={secondaryButtonStyle} onClick={() => setModalCompra(false)}>Cancelar</button>
              <button type="submit" disabled={guardandoCompra} style={{ ...primaryButtonStyle, opacity: guardandoCompra ? 0.7 : 1 }}>
                {guardandoCompra ? 'Guardando...' : 'Registrar compra'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL DETALLE DE COMPRA */}
      {compraDetalle && (
        <Modal title={`Detalle de OC-${String(compraDetalle.id).padStart(4, '0')}`} onClose={() => setCompraDetalle(null)}>
          <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 12px 0' }}>
            Proveedor: <strong>{proveedorNombre(compraDetalle.proveedor_id)}</strong> · Fecha: {new Date(compraDetalle.fecha).toLocaleDateString('es-PE')} · Estado: <strong>{compraDetalle.estado}</strong>
          </p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ textAlign: 'left', padding: '6px 0' }}>Producto</th>
                <th style={{ textAlign: 'right', padding: '6px 0' }}>Cant.</th>
                <th style={{ textAlign: 'right', padding: '6px 0' }}>P. Unit.</th>
                <th style={{ textAlign: 'right', padding: '6px 0' }}>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {(compraDetalle.items || []).map((it) => {
                const prod = productos.find((p) => p.id === it.producto_id);
                return (
                  <tr key={it.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '6px 0' }}>{prod ? prod.nombre : `Producto #${it.producto_id}`}</td>
                    <td style={{ padding: '6px 0', textAlign: 'right' }}>{it.cantidad}</td>
                    <td style={{ padding: '6px 0', textAlign: 'right' }}>S/ {Number(it.precio_unitario).toFixed(2)}</td>
                    <td style={{ padding: '6px 0', textAlign: 'right' }}>S/ {(Number(it.precio_unitario) * it.cantidad).toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ textAlign: 'right', marginTop: '14px', fontWeight: 700, color: '#1e3a8a' }}>
            Total: S/ {Number(compraDetalle.total).toFixed(2)}
          </div>
        </Modal>
      )}

      {/* MODAL NUEVO / EDITAR PROVEEDOR */}
      {modalProveedor && (
        <Modal title={editandoProveedorId ? 'Editar proveedor' : 'Nuevo proveedor'} onClose={() => { setModalProveedor(false); setEditandoProveedorId(null); }}>
          <form onSubmit={handleGuardarProveedor}>
            {errorProveedor && (
              <div style={{ backgroundColor: '#fef2f2', color: '#b91c1c', padding: '8px 12px', borderRadius: '6px', fontSize: '13px', marginBottom: '8px' }}>
                {errorProveedor}
              </div>
            )}
            <label style={labelStyle}>Nombre</label>
            <input required style={inputStyle} value={formProveedor.nombre} onChange={(e) => setFormProveedor({ ...formProveedor, nombre: e.target.value })} />
            <label style={labelStyle}>Contacto</label>
            <input style={inputStyle} value={formProveedor.contacto} onChange={(e) => setFormProveedor({ ...formProveedor, contacto: e.target.value })} />
            <label style={labelStyle}>Teléfono</label>
            <input style={inputStyle} value={formProveedor.telefono} onChange={(e) => setFormProveedor({ ...formProveedor, telefono: e.target.value })} />
            <label style={labelStyle}>Email</label>
            <input type="email" style={inputStyle} value={formProveedor.email} onChange={(e) => setFormProveedor({ ...formProveedor, email: e.target.value })} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '22px' }}>
              <button type="button" style={secondaryButtonStyle} onClick={() => { setModalProveedor(false); setEditandoProveedorId(null); }}>Cancelar</button>
              <button type="submit" disabled={guardandoProveedor} style={{ ...primaryButtonStyle, opacity: guardandoProveedor ? 0.7 : 1 }}>
                {guardandoProveedor ? 'Guardando...' : editandoProveedorId ? 'Guardar cambios' : 'Crear proveedor'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

export default Compras;