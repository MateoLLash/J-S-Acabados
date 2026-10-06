import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, Plus, Search, ArrowLeft, Edit, Trash2, Camera, ImageOff, Boxes, Wallet, AlertTriangle } from 'lucide-react';
import { apiFetch } from '../../utils/api';
import Modal, { inputStyle, labelStyle, primaryButtonStyle, secondaryButtonStyle } from '../../utils/Modal';
import { imagenUrl } from '../../utils/format';

const FORM_VACIO = {
  codigo: '',
  nombre: '',
  categoria_id: '',
  marca_id: '',
  precio_compra: '',
  precio_venta: '',
  stock: '',
  stock_minimo: '',
  unidad: 'unidad',
};

const ORIGENES_PRODUCTO = {
  acabados_js: { label: 'Propio', bg: '#f1f5f9', color: '#475569', border: '#e2e8f0' },
  lina: { label: 'Lina', bg: '#fff7ed', color: '#c2410c', border: '#fed7aa' },
};

const FILTROS = [
  { id: 'todos', label: 'Todos' },
  { id: 'acabados_js', label: 'Propios' },
  { id: 'lina', label: 'Lina' },
];

/* ---------- Estilos locales compactos (sobrescriben los de InventoryDashboard) ---------- */
const s = {
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '920px' },
  th: {
    textAlign: 'left', padding: '9px 10px', fontSize: '10.5px', fontWeight: 700,
    color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.4px',
    backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap',
  },
  td: { padding: '8px 10px', borderBottom: '1px solid #f1f5f9', color: '#334155', whiteSpace: 'nowrap', verticalAlign: 'middle' },
};

/* ---------- Componentes pequeños ---------- */
const BadgeOrigenProducto = ({ origen }) => {
  const cfg = ORIGENES_PRODUCTO[origen] ?? { label: origen || '—', bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' };
  return (
    <span
      title={origen === 'lina' ? 'Recibido del sistema de Lina' : 'Producto propio de Acabados J&S'}
      style={{ fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '999px', backgroundColor: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`, whiteSpace: 'nowrap' }}
    >
      {cfg.label}
    </span>
  );
};

const StatCard = ({ icon, label, value, color, bg }) => (
  <div className="stat-card" style={{ flex: 1, minWidth: '170px', backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '12px' }}>
    <div style={{ width: '38px', height: '38px', borderRadius: '9px', backgroundColor: bg, color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {icon}
    </div>
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: '10.5px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</div>
      <div style={{ fontSize: '17px', fontWeight: 700, color: '#1e293b', lineHeight: 1.3 }}>{value}</div>
    </div>
  </div>
);

const SectionTitle = ({ children }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '18px 0 10px' }}>
    <span style={{ fontSize: '11px', fontWeight: 700, color: '#f97316', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{children}</span>
    <span style={{ flex: 1, height: '1px', backgroundColor: '#f1f5f9' }} />
  </div>
);

const Productos = () => {
  const navigate = useNavigate();
  const [productos, setProductos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [marcas, setMarcas] = useState([]);
  const [search, setSearch] = useState('');
  const [filtroOrigen, setFiltroOrigen] = useState('todos');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [modalAbierto, setModalAbierto] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [formError, setFormError] = useState('');

  const [imagenFile, setImagenFile] = useState(null);
  const [imagenPreview, setImagenPreview] = useState(null);
  const [subiendoImagen, setSubiendoImagen] = useState(false);

  const cargarProductos = async () => {
    try {
      setLoading(true);
      const [productosData, categoriasData, marcasData] = await Promise.all([
        apiFetch('/productos/'),
        apiFetch('/categorias'),
        apiFetch('/marcas'),
      ]);
      setProductos(productosData);
      setCategorias(categoriasData);
      setMarcas(marcasData);
      setError('');
    } catch (err) {
      console.error('Error cargando productos:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarProductos();
  }, []);

  const nombreCategoria = (id) => categorias.find((c) => c.id === id)?.nombre || 'Sin categoría';

  const conteoOrigen = {
    todos: productos.length,
    acabados_js: productos.filter((p) => p.origen === 'acabados_js').length,
    lina: productos.filter((p) => p.origen === 'lina').length,
  };

  const totalInventario = productos.reduce((acc, p) => acc + (Number(p.precio_compra) || 0) * (Number(p.stock) || 0), 0);
  const stockBajo = productos.filter((p) => Number(p.stock) <= Number(p.stock_minimo || 0)).length;

  const filteredProductos = productos.filter((p) => {
    const coincideTexto =
      p.nombre.toLowerCase().includes(search.toLowerCase()) ||
      p.codigo.toLowerCase().includes(search.toLowerCase());
    const coincideOrigen = filtroOrigen === 'todos' || p.origen === filtroOrigen;
    return coincideTexto && coincideOrigen;
  });

  const abrirNuevo = () => {
    setEditando(null);
    setForm(FORM_VACIO);
    setFormError('');
    setImagenFile(null);
    setImagenPreview(null);
    setModalAbierto(true);
  };

  const abrirEditar = (prod) => {
    setEditando(prod);
    setForm({
      codigo: prod.codigo,
      nombre: prod.nombre,
      categoria_id: prod.categoria_id || '',
      marca_id: prod.marca_id || '',
      precio_compra: prod.precio_compra,
      precio_venta: prod.precio_venta,
      stock: prod.stock,
      stock_minimo: prod.stock_minimo,
      unidad: prod.unidad,
    });
    setFormError('');
    setImagenFile(null);
    setImagenPreview(prod.imagen_url ? imagenUrl(prod) : null);
    setModalAbierto(true);
  };

  const handleElegirImagen = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const extensionesPermitidas = ['image/jpeg', 'image/png', 'image/webp'];
    if (!extensionesPermitidas.includes(file.type)) {
      setFormError('Formato de imagen no permitido. Usa JPG, PNG o WEBP.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setFormError('La imagen no puede pesar más de 5MB.');
      return;
    }

    setFormError('');
    setImagenFile(file);
    setImagenPreview(URL.createObjectURL(file));
  };

  const handleQuitarImagen = async () => {
    if (imagenFile || !editando) {
      setImagenFile(null);
      setImagenPreview(null);
      return;
    }
    try {
      setSubiendoImagen(true);
      const actualizado = await apiFetch(`/productos/${editando.id}/imagen`, { method: 'DELETE' });
      setImagenPreview(null);
      setImagenFile(null);
      setEditando(actualizado);
      setProductos((prev) => prev.map((p) => (p.id === actualizado.id ? actualizado : p)));
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubiendoImagen(false);
    }
  };

  const handleGuardar = async (e) => {
    e.preventDefault();
    setGuardando(true);
    setFormError('');
    try {
      const payload = {
        codigo: form.codigo,
        nombre: form.nombre,
        categoria_id: form.categoria_id ? Number(form.categoria_id) : null,
        marca_id: form.marca_id ? Number(form.marca_id) : null,
        precio_compra: Number(form.precio_compra),
        precio_venta: Number(form.precio_venta),
        stock_minimo: Number(form.stock_minimo || 0),
        unidad: form.unidad || 'unidad',
      };

      let productoGuardado;
      if (editando) {
        productoGuardado = await apiFetch(`/productos/${editando.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        payload.stock = Number(form.stock || 0);
        productoGuardado = await apiFetch('/productos/', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }

      if (imagenFile && productoGuardado?.id) {
        const formData = new FormData();
        formData.append('imagen', imagenFile);
        await apiFetch(`/productos/${productoGuardado.id}/imagen`, {
          method: 'POST',
          body: formData,
        });
      }

      setModalAbierto(false);
      cargarProductos();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const handleEliminar = async (prod) => {
    if (!window.confirm(`¿Eliminar el producto "${prod.nombre}"? Esta acción no se puede deshacer.`)) return;
    try {
      await apiFetch(`/productos/${prod.id}`, { method: 'DELETE' });
      cargarProductos();
    } catch (err) {
      alert(`No se pudo eliminar: ${err.message}`);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '12px', height: '100vh' }}>
        <Package size={36} color="#f97316" className="pulse-icon" />
        <h3 style={{ fontFamily: 'sans-serif', color: '#64748b', fontWeight: 600, fontSize: '15px' }}>Cargando catálogo de productos...</h3>
      </div>
    );
  }

  // ✅ Después
return (
  <div style={{
    minHeight: '100vh',
    backgroundColor: '#f1f5f9',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    boxSizing: 'border-box',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  }}>
      {/* Efectos hover (los estilos inline no soportan hover) */}
      <style>{`
        .ptable tbody tr { transition: background-color .12s ease; }
        .ptable tbody tr:hover { background-color: #f8fafc !important; }
        .act-btn { border-radius: 7px; padding: 5px; display: inline-flex; border: none; background: transparent; cursor: pointer; transition: background-color .15s ease; }
        .act-btn.edit:hover { background-color: #eff6ff; }
        .act-btn.del:hover { background-color: #fef2f2; }
        .pill-btn { transition: border-color .15s ease, color .15s ease; }
        .pill-btn:hover:not(.activo) { border-color: #fb923c; color: #ea580c; }
        .btn-primary { transition: background-color .15s ease; }
        .btn-primary:hover { background-color: #ea580c !important; }
        .btn-back { transition: background-color .15s ease; border-radius: 8px; }
        .btn-back:hover { background-color: #f1f5f9; }
        .stat-card { transition: box-shadow .15s ease, transform .15s ease; }
        .stat-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,.07); transform: translateY(-1px); }
        @keyframes pulseIcon { 0%,100% { opacity: .5; } 50% { opacity: 1; } }
        .pulse-icon { animation: pulseIcon 1.2s ease-in-out infinite; }
      `}</style>

      {/* ---------- Encabezado ---------- */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => navigate('/dashboard')} className="btn-back" title="Volver" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '6px', display: 'flex' }}>
            <ArrowLeft size={22} />
          </button>
          <div style={{ width: '42px', height: '42px', borderRadius: '11px', backgroundColor: '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Package color="#f97316" size={22} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: '#1e293b' }}>Catálogo de Productos</h1>
            <p style={{ margin: 0, fontSize: '12.5px', color: '#94a3b8' }}>Administración y precios de almacén</p>
          </div>
        </div>
        <button onClick={abrirNuevo} className="btn-primary" style={{ backgroundColor: '#f97316', color: '#fff', border: 'none', padding: '9px 16px', borderRadius: '8px', fontWeight: 600, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '7px', cursor: 'pointer', boxShadow: '0 2px 6px rgba(249,115,22,.3)' }}>
          <Plus size={17} /> Nuevo Producto
        </button>
      </div>

      {error && (
        <div style={{ backgroundColor: '#fef2f2', color: '#b91c1c', padding: '10px 16px', borderRadius: '8px', width: '100%', boxSizing: 'border-box', fontSize: '13px', border: '1px solid #fecaca' }}>
          {error}
        </div>
      )}

      {/* ---------- Tarjetas de resumen ---------- */}
      <div style={{ display: 'flex', gap: '12px', width: '100%', flexWrap: 'wrap' }}>
        <StatCard icon={<Boxes size={19} />} label="Total productos" value={productos.length} color="#f97316" bg="#fff7ed" />
        <StatCard icon={<Wallet size={19} />} label="Valor inventario (compra)" value={`S/ ${totalInventario.toFixed(2)}`} color="#2563eb" bg="#eff6ff" />
        <StatCard icon={<AlertTriangle size={19} />} label="Stock bajo" value={stockBajo} color="#dc2626" bg="#fef2f2" />
      </div>

      {/* ---------- Buscador + filtros ---------- */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 12px', width: '100%', boxSizing: 'border-box' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '220px', maxWidth: '340px' }}>
          <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            type="text"
            placeholder="Buscar por nombre o código..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px 8px 32px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', outline: 'none', backgroundColor: '#f8fafc', color: '#334155' }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          {FILTROS.map(({ id, label }) => {
            const activo = filtroOrigen === id;
            return (
              <button
                key={id}
                type="button"
                className={`pill-btn ${activo ? 'activo' : ''}`}
                onClick={() => setFiltroOrigen(id)}
                style={{ padding: '6px 12px', borderRadius: '999px', border: '1px solid', borderColor: activo ? '#f97316' : '#e2e8f0', backgroundColor: activo ? '#fff7ed' : '#fff', color: activo ? '#ea580c' : '#64748b', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: activo ? '#f97316' : '#cbd5e1' }} />
                {label} <span style={{ fontWeight: 700, color: activo ? '#f97316' : '#94a3b8' }}>{conteoOrigen[id]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ---------- Tabla ---------- */}
      <div style={{ width: '100%', backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="ptable" style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Foto</th>
                <th style={s.th}>Código</th>
                <th style={s.th}>Descripción</th>
                <th style={s.th}>Categoría</th>
                <th style={s.th}>Marca</th>
                <th style={{ ...s.th, textAlign: 'right' }}>P. Compra</th>
                <th style={{ ...s.th, textAlign: 'right' }}>P. Venta</th>
                <th style={{ ...s.th, textAlign: 'center' }}>Stock</th>
                <th style={s.th}>Unidad</th>
                <th style={s.th}>Origen</th>
                <th style={{ ...s.th, textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredProductos.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ ...s.td, textAlign: 'center', padding: '40px 10px', whiteSpace: 'normal' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                      <Package size={30} color="#cbd5e1" />
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#94a3b8' }}>No se encontraron productos</span>
                      <span style={{ fontSize: '12px', color: '#cbd5e1' }}>Prueba con otra búsqueda o cambia el filtro de origen</span>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredProductos.map((prod) => (
                  <tr
                    key={prod.id}
                    style={prod.origen === 'lina' ? { backgroundColor: '#fffbf7', boxShadow: 'inset 3px 0 0 #fb923c' } : undefined}
                  >
                    <td style={s.td}>
                      {prod.imagen_url ? (
                        <img src={imagenUrl(prod)} alt={prod.nombre} style={{ width: '36px', height: '36px', objectFit: 'cover', borderRadius: '7px', border: '1px solid #e2e8f0', display: 'block' }} />
                      ) : (
                        <div style={{ width: '36px', height: '36px', borderRadius: '7px', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <ImageOff size={15} color="#cbd5e1" />
                        </div>
                      )}
                    </td>
                    <td style={s.td}>
                      <span style={{ backgroundColor: '#f1f5f9', padding: '3px 7px', borderRadius: '5px', fontSize: '11.5px', fontWeight: 600, color: '#475569' }}>{prod.codigo}</span>
                    </td>
                    <td style={{ ...s.td, maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      <strong title={prod.nombre} style={{ fontWeight: 600, color: '#1e293b' }}>{prod.nombre}</strong>
                    </td>
                    <td style={{ ...s.td, color: '#64748b' }}>{prod.categoria?.nombre || nombreCategoria(prod.categoria_id)}</td>
                    <td style={{ ...s.td, color: '#64748b' }}>{prod.marca?.nombre || '—'}</td>
                    <td style={{ ...s.td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>S/ {Number(prod.precio_compra || 0).toFixed(2)}</td>
                    <td style={{ ...s.td, textAlign: 'right', color: '#16a34a', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>S/ {Number(prod.precio_venta || 0).toFixed(2)}</td>
                    <td style={{ ...s.td, textAlign: 'center', fontWeight: 600 }}>{prod.stock}</td>
                    <td style={{ ...s.td, color: '#64748b' }}>{prod.unidad}</td>
                    <td style={s.td}><BadgeOrigenProducto origen={prod.origen} /></td>
                    <td style={{ ...s.td, textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', gap: '4px' }}>
                        <button className="act-btn edit" title="Editar" onClick={() => abrirEditar(prod)}><Edit size={15} color="#3b82f6" /></button>
                        <button className="act-btn del" title="Eliminar" onClick={() => handleEliminar(prod)}><Trash2 size={15} color="#dc2626" /></button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---------- Modal ---------- */}
      {modalAbierto && (
        <Modal title={editando ? 'Editar producto' : 'Nuevo producto'} onClose={() => setModalAbierto(false)}>
          <form onSubmit={handleGuardar}>
            {formError && (
              <div style={{ backgroundColor: '#fef2f2', color: '#b91c1c', padding: '8px 12px', borderRadius: '7px', fontSize: '13px', marginBottom: '8px', border: '1px solid #fecaca' }}>
                {formError}
              </div>
            )}

            <SectionTitle>Información general</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '12px' }}>
              <div>
                <label style={labelStyle}>Código</label>
                <input required style={inputStyle} value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Nombre</label>
                <input required style={inputStyle} value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
              </div>
            </div>

            {/* Zona de foto */}
            <div style={{ marginTop: '14px', border: '1px dashed #cbd5e1', borderRadius: '10px', padding: '12px', backgroundColor: '#f8fafc', display: 'flex', alignItems: 'center', gap: '14px' }}>
              {imagenPreview ? (
                <img src={imagenPreview} alt="Vista previa" style={{ width: '60px', height: '60px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #e2e8f0' }} />
              ) : (
                <div style={{ width: '60px', height: '60px', borderRadius: '8px', backgroundColor: '#fff', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <ImageOff size={20} color="#cbd5e1" />
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', borderRadius: '7px', padding: '6px 12px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', width: 'fit-content' }}>
                  <Camera size={14} /> {imagenPreview ? 'Cambiar foto' : 'Elegir foto'}
                  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleElegirImagen} style={{ display: 'none' }} />
                </label>
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>JPG, PNG o WEBP · máx. 5MB</span>
                {imagenPreview && (
                  <button type="button" onClick={handleQuitarImagen} disabled={subiendoImagen} style={{ border: 'none', background: 'none', color: '#dc2626', fontSize: '12px', fontWeight: 600, cursor: 'pointer', padding: 0, textAlign: 'left', width: 'fit-content' }}>
                    {subiendoImagen ? 'Quitando...' : 'Quitar foto'}
                  </button>
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={labelStyle}>Categoría</label>
                <select style={inputStyle} value={form.categoria_id} onChange={(e) => setForm({ ...form, categoria_id: e.target.value })}>
                  <option value="">Sin categoría</option>
                  {categorias.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.nombre}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Marca</label>
                <select style={inputStyle} value={form.marca_id} onChange={(e) => setForm({ ...form, marca_id: e.target.value })}>
                  <option value="">Sin marca</option>
                  {marcas.map((m) => (
                    <option key={m.id} value={m.id}>{m.nombre}</option>
                  ))}
                </select>
              </div>
            </div>

            <SectionTitle>Precios e inventario</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={labelStyle}>Precio de compra (S/)</label>
                <input required type="number" step="0.01" min="0" style={inputStyle} value={form.precio_compra} onChange={(e) => setForm({ ...form, precio_compra: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Precio de venta (S/)</label>
                <input required type="number" step="0.01" min="0" style={inputStyle} value={form.precio_venta} onChange={(e) => setForm({ ...form, precio_venta: e.target.value })} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: editando ? '1fr 1fr' : '1fr 1fr 1fr', gap: '12px' }}>
              {!editando && (
                <div>
                  <label style={labelStyle}>Stock inicial</label>
                  <input type="number" min="0" style={inputStyle} value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
                </div>
              )}
              <div>
                <label style={labelStyle}>Stock mínimo</label>
                <input type="number" min="0" style={inputStyle} value={form.stock_minimo} onChange={(e) => setForm({ ...form, stock_minimo: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Unidad</label>
                <input style={inputStyle} value={form.unidad} onChange={(e) => setForm({ ...form, unidad: e.target.value })} />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '22px' }}>
              <button type="button" style={secondaryButtonStyle} onClick={() => setModalAbierto(false)}>Cancelar</button>
              <button type="submit" disabled={guardando} className="btn-primary" style={{ ...primaryButtonStyle, opacity: guardando ? 0.7 : 1 }}>
                {guardando ? 'Guardando...' : editando ? 'Guardar cambios' : 'Crear producto'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

export default Productos;