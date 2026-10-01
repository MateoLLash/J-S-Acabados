import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { styles } from './InventoryDashboard.styles';
import { Package, Plus, Search, ArrowLeft, Edit, Trash2, Camera, ImageOff } from 'lucide-react';
import { apiFetch, API_URL } from '../../utils/api';
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

// Origen del producto: 'acabados_js' (creado aquí) o 'equipo_kanari' (recibido del sistema de Lina).
const ORIGENES_PRODUCTO = {
  acabados_js: { label: 'Propio', bg: '#f1f5f9', color: '#475569', border: '#e2e8f0' },
  equipo_kanari: { label: 'Kanari', bg: '#fff7ed', color: '#c2410c', border: '#fed7aa' },
};

const BadgeOrigenProducto = ({ origen }) => {
  const cfg = ORIGENES_PRODUCTO[origen] ?? { label: origen || '—', bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' };
  return (
    <span
      title={origen === 'equipo_kanari' ? 'Recibido del sistema de Lina (equipo Kanari)' : 'Producto propio de Acabados J&S'}
      style={{
        fontSize: '10px',
        fontWeight: '600',
        padding: '2px 7px',
        borderRadius: '999px',
        backgroundColor: cfg.bg,
        color: cfg.color,
        border: `1px solid ${cfg.border}`,
        whiteSpace: 'nowrap',
      }}
    >
      {cfg.label}
    </span>
  );
};

const Productos = () => {
  const navigate = useNavigate();
  const [productos, setProductos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [marcas, setMarcas] = useState([]);
  const [search, setSearch] = useState('');
  const [filtroOrigen, setFiltroOrigen] = useState('todos'); // 'todos' | 'acabados_js' | 'equipo_kanari'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [modalAbierto, setModalAbierto] = useState(false);
  const [editando, setEditando] = useState(null); // producto que se está editando, o null si es nuevo
  const [form, setForm] = useState(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [formError, setFormError] = useState('');

  const [imagenFile, setImagenFile] = useState(null);       // archivo nuevo elegido (aún no subido)
  const [imagenPreview, setImagenPreview] = useState(null); // URL a mostrar (existente o preview local)
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
    equipo_kanari: productos.filter((p) => p.origen === 'equipo_kanari').length,
  };

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
    // Si todavía no se subió (solo estaba en preview local), basta con limpiar el estado
    if (imagenFile || !editando) {
      setImagenFile(null);
      setImagenPreview(null);
      return;
    }
    // Si la imagen ya existe en el producto guardado, la borramos también del servidor
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

      // Si el usuario eligió una foto nueva, la subimos ahora que ya existe el producto (o su id no cambió)
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
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <h3 style={{ fontFamily: 'sans-serif', color: '#f97316' }}>Cargando catálogo de productos...</h3>
      </div>
    );
  }

  return (
    <div style={{ ...styles.container, padding: '24px', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => navigate('/dashboard')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 style={{ ...styles.pageTitle, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Package color="#f97316" /> Catálogo de Productos
            </h1>
            <p style={styles.pageSubtitle}>Administración y precios de almacén</p>
          </div>
        </div>
        <button
          onClick={abrirNuevo}
          style={{ backgroundColor: '#f97316', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: '6px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
        >
          <Plus size={18} /> Nuevo Producto
        </button>
      </div>

      {error && (
        <div style={{ backgroundColor: '#fef2f2', color: '#b91c1c', padding: '10px 16px', borderRadius: '8px', width: '100%', boxSizing: 'border-box', fontSize: '13px' }}>
          {error}
        </div>
      )}

      <div style={{ ...styles.topbar, width: '100%', boxShadow: 'none', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
        <div style={styles.searchWrapper}>
          <Search size={18} style={styles.searchIcon} />
          <input
            type="text"
            placeholder="Buscar por nombre o código..."
            style={styles.searchInput}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', width: '100%' }}>
        <span style={{ fontSize: '11px', fontWeight: '600', color: '#94a3b8', marginRight: '2px' }}>Origen:</span>
        {[
          { id: 'todos', label: 'Todos' },
          { id: 'acabados_js', label: 'Propios' },
          { id: 'equipo_kanari', label: 'Kanari' },
        ].map(({ id, label }) => {
          const activo = filtroOrigen === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setFiltroOrigen(id)}
              style={{
                padding: '5px 12px',
                borderRadius: '999px',
                border: '1px solid',
                borderColor: activo ? '#f97316' : '#e2e8f0',
                backgroundColor: activo ? '#f97316' : '#fff',
                color: activo ? '#fff' : '#64748b',
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              {label} ({conteoOrigen[id]})
            </button>
          );
        })}
      </div>

      <div style={{ ...styles.tableCard, width: '100%', marginTop: 0 }}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Foto</th>
              <th style={styles.th}>Código</th>
              <th style={styles.th}>Descripción</th>
              <th style={styles.th}>Categoría</th>
              <th style={styles.th}>Marca</th>
              <th style={styles.th}>P. Compra</th>
              <th style={styles.th}>P. Venta</th>
              <th style={styles.th}>Stock</th>
              <th style={styles.th}>Unidad</th>
              <th style={styles.th}>Origen</th>
              <th style={{ ...styles.th, textAlign: 'center' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filteredProductos.length === 0 ? (
              <tr>
                <td colSpan="11" style={{ ...styles.td, textAlign: 'center', color: '#64748b' }}>No se encontraron productos.</td>
              </tr>
            ) : (
              filteredProductos.map((prod) => (
  <tr
    key={prod.id}
    style={prod.origen === 'equipo_kanari' ? { backgroundColor: '#fffaf5', boxShadow: 'inset 3px 0 0 #fb923c' } : undefined}
  >
    <td style={styles.td}>
      {prod.imagen_url ? (
        <img
          src={imagenUrl(prod)}
          alt={prod.nombre}
          style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #e2e8f0' }}
        />
      ) : (
        <div style={{ width: '40px', height: '40px', borderRadius: '6px', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ImageOff size={16} color="#cbd5e1" />
        </div>
      )}
    </td>
    <td style={styles.td}><span style={{ backgroundColor: '#f1f5f9', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap' }}>{prod.codigo}</span></td>
    <td style={{ ...styles.td, maxWidth: '220px' }}>
      <strong title={prod.nombre} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {prod.nombre}
      </strong>
    </td>
    <td style={styles.td}>{prod.categoria?.nombre || nombreCategoria(prod.categoria_id)}</td>
    <td style={styles.td}>{prod.marca?.nombre || '-'}</td>
    <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>S/ {parseFloat(prod.precio_compra).toFixed(2)}</td>
    <td style={{ ...styles.td, color: '#16a34a', fontWeight: '600', whiteSpace: 'nowrap' }}>S/ {parseFloat(prod.precio_venta).toFixed(2)}</td>
    <td style={styles.td}>{prod.stock}</td>
    <td style={styles.td}>{prod.unidad}</td>
    <td style={styles.td}><BadgeOrigenProducto origen={prod.origen} /></td>
    <td style={styles.td}>
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
        <Edit size={16} color="#3b82f6" style={{ cursor: 'pointer' }} onClick={() => abrirEditar(prod)} />
        <Trash2 size={16} color="#dc2626" style={{ cursor: 'pointer' }} onClick={() => handleEliminar(prod)} />
      </div>
    </td>
  </tr>
))
            )}
          </tbody>
        </table>
      </div>

      {modalAbierto && (
        <Modal title={editando ? 'Editar producto' : 'Nuevo producto'} onClose={() => setModalAbierto(false)}>
          <form onSubmit={handleGuardar}>
            {formError && (
              <div style={{ backgroundColor: '#fef2f2', color: '#b91c1c', padding: '8px 12px', borderRadius: '6px', fontSize: '13px', marginBottom: '8px' }}>
                {formError}
              </div>
            )}

            <label style={labelStyle}>Código</label>
            <input required style={inputStyle} value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} />

            <label style={labelStyle}>Nombre</label>
            <input required style={inputStyle} value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />

            <div style={{ marginTop: '4px', marginBottom: '4px' }}>
              <label style={labelStyle}>Foto del producto</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {imagenPreview ? (
                  <img src={imagenPreview} alt="Vista previa" style={{ width: '64px', height: '64px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #e2e8f0' }} />
                ) : (
                  <div style={{ width: '64px', height: '64px', borderRadius: '8px', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <ImageOff size={22} color="#cbd5e1" />
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', borderRadius: '6px', padding: '6px 12px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', width: 'fit-content' }}>
                    <Camera size={14} /> {imagenPreview ? 'Cambiar foto' : 'Elegir foto'}
                    <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleElegirImagen} style={{ display: 'none' }} />
                  </label>
                  {imagenPreview && (
                    <button type="button" onClick={handleQuitarImagen} disabled={subiendoImagen} style={{ border: 'none', background: 'none', color: '#dc2626', fontSize: '12px', fontWeight: 600, cursor: 'pointer', padding: 0, textAlign: 'left' }}>
                      {subiendoImagen ? 'Quitando...' : 'Quitar foto'}
                    </button>
                  )}
                </div>
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
              <button type="submit" disabled={guardando} style={{ ...primaryButtonStyle, opacity: guardando ? 0.7 : 1 }}>
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