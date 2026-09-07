import React, { useState, useEffect, useMemo } from 'react';
import { Tag, Users, Wallet, Truck, Plus, Search, Banknote, CreditCard, Smartphone, Landmark, Mail, Phone, FileText } from 'lucide-react';
import { apiFetch } from '../../utils/api';
import Modal, { inputStyle, labelStyle, primaryButtonStyle, secondaryButtonStyle } from '../../utils/Modal';

const FORM_MARCA_VACIO = { nombre: '' };
const FORM_CLIENTE_VACIO = { nombre: '', telefono: '', documento: '' };
const FORM_PROVEEDOR_VACIO = { nombre: '', contacto: '', telefono: '', email: '' };

// Colores estables por inicial, para que cada marca/cliente tenga su propio "avatar" de color.
const PALETA_AVATAR = ['#1e3a8a', '#f97316', '#16a34a', '#7c3aed', '#0891b2', '#be123c', '#a16207'];
const colorPorTexto = (texto = '') => {
  const codigo = texto.charCodeAt(0) || 0;
  return PALETA_AVATAR[codigo % PALETA_AVATAR.length];
};

// Ícono según el nombre del método de pago (best-effort, cae en Wallet si no matchea nada).
const iconoMetodoPago = (nombre = '') => {
  const n = nombre.toLowerCase();
  if (n.includes('efectivo')) return Banknote;
  if (n.includes('tarjeta') || n.includes('visa') || n.includes('master')) return CreditCard;
  if (n.includes('yape') || n.includes('plin') || n.includes('transfer')) return Smartphone;
  if (n.includes('deposito') || n.includes('banco')) return Landmark;
  return Wallet;
};

const Catalogos = () => {
  const [tab, setTab] = useState('marcas'); // 'marcas' | 'clientes' | 'proveedores' | 'metodos-pago'
  const [busqueda, setBusqueda] = useState('');

  const [marcas, setMarcas] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [metodosPago, setMetodosPago] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [modalMarca, setModalMarca] = useState(false);
  const [formMarca, setFormMarca] = useState(FORM_MARCA_VACIO);
  const [guardandoMarca, setGuardandoMarca] = useState(false);
  const [errorMarca, setErrorMarca] = useState('');

  const [modalCliente, setModalCliente] = useState(false);
  const [formCliente, setFormCliente] = useState(FORM_CLIENTE_VACIO);
  const [guardandoCliente, setGuardandoCliente] = useState(false);
  const [errorCliente, setErrorCliente] = useState('');

  const [modalProveedor, setModalProveedor] = useState(false);
  const [formProveedor, setFormProveedor] = useState(FORM_PROVEEDOR_VACIO);
  const [guardandoProveedor, setGuardandoProveedor] = useState(false);
  const [errorProveedor, setErrorProveedor] = useState('');

  const cargarTodo = async () => {
    try {
      setLoading(true);
      const [marcasData, clientesData, proveedoresData, metodosData] = await Promise.all([
        apiFetch('/marcas'),
        apiFetch('/clientes'),
        apiFetch('/proveedores'),
        apiFetch('/metodos-pago'),
      ]);
      setMarcas(marcasData);
      setClientes(clientesData);
      setProveedores(proveedoresData);
      setMetodosPago(metodosData);
      setError('');
    } catch (err) {
      console.error('Error cargando catálogos:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarTodo();
  }, []);

  // Al cambiar de pestaña, limpiamos el buscador para no arrastrar un filtro que no aplica.
  useEffect(() => {
    setBusqueda('');
  }, [tab]);

  // --- Marcas ---
  const abrirNuevaMarca = () => {
    setFormMarca(FORM_MARCA_VACIO);
    setErrorMarca('');
    setModalMarca(true);
  };

  const handleGuardarMarca = async (e) => {
    e.preventDefault();
    setGuardandoMarca(true);
    setErrorMarca('');
    try {
      await apiFetch('/marcas', { method: 'POST', body: JSON.stringify({ nombre: formMarca.nombre }) });
      setModalMarca(false);
      cargarTodo();
    } catch (err) {
      setErrorMarca(err.message);
    } finally {
      setGuardandoMarca(false);
    }
  };

  // --- Clientes ---
  const abrirNuevoCliente = () => {
    setFormCliente(FORM_CLIENTE_VACIO);
    setErrorCliente('');
    setModalCliente(true);
  };

  const handleGuardarCliente = async (e) => {
    e.preventDefault();
    setGuardandoCliente(true);
    setErrorCliente('');
    try {
      const payload = {
        nombre: formCliente.nombre,
        telefono: formCliente.telefono || null,
        documento: formCliente.documento || null,
      };
      await apiFetch('/clientes', { method: 'POST', body: JSON.stringify(payload) });
      setModalCliente(false);
      cargarTodo();
    } catch (err) {
      setErrorCliente(err.message);
    } finally {
      setGuardandoCliente(false);
    }
  };

  // --- Proveedores ---
  const abrirNuevoProveedor = () => {
    setFormProveedor(FORM_PROVEEDOR_VACIO);
    setErrorProveedor('');
    setModalProveedor(true);
  };

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
      await apiFetch('/proveedores', { method: 'POST', body: JSON.stringify(payload) });
      setModalProveedor(false);
      cargarTodo();
    } catch (err) {
      setErrorProveedor(err.message);
    } finally {
      setGuardandoProveedor(false);
    }
  };

  // --- Filtros de búsqueda por pestaña (memoizados para no recalcular en cada render) ---
  const marcasFiltradas = useMemo(
    () => marcas.filter((m) => m.nombre.toLowerCase().includes(busqueda.toLowerCase())),
    [marcas, busqueda]
  );
  const clientesFiltrados = useMemo(
    () => clientes.filter((c) =>
      c.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      (c.documento || '').toLowerCase().includes(busqueda.toLowerCase())
    ),
    [clientes, busqueda]
  );
  const proveedoresFiltrados = useMemo(
    () => proveedores.filter((p) => p.nombre.toLowerCase().includes(busqueda.toLowerCase())),
    [proveedores, busqueda]
  );

  const tabButtonStyle = (activo) => ({
    padding: '9px 18px',
    borderRadius: '8px',
    border: '1px solid',
    borderColor: activo ? '#cbd5e1' : 'transparent',
    backgroundColor: activo ? '#ffffff' : 'transparent',
    fontWeight: activo ? '600' : '400',
    color: activo ? '#0f172a' : '#64748b',
    boxShadow: activo ? '0 1px 3px rgba(0,0,0,0.05)' : 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '14px',
  });

  const cardContainerStyle = {
    backgroundColor: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: '12px',
    padding: '20px',
    marginBottom: '24px',
  };

  const filaAccionesStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '18px',
    flexWrap: 'wrap',
  };

  const buscadorStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    padding: '8px 12px',
    minWidth: '220px',
    flex: 1,
    maxWidth: '320px',
  };

  const botonNuevo = {
    background: '#1e3a8a',
    border: 'none',
    color: '#fff',
    padding: '9px 16px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '600',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  };

  const gridCards = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
    gap: '14px',
  };

  const itemCard = {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    border: '1px solid #f1f5f9',
    backgroundColor: '#fafafa',
    borderRadius: '10px',
    padding: '14px',
  };

  const avatarStyle = (bg) => ({
    width: '38px',
    height: '38px',
    borderRadius: '10px',
    backgroundColor: bg,
    color: '#fff',
    fontWeight: '700',
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  });

  const estadoVacio = (texto) => (
    <div style={{ padding: '36px 16px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>{texto}</div>
  );

  if (loading) {
    return (
      <div style={{ padding: '30px', textAlign: 'center', color: '#f97316', fontWeight: '500', fontFamily: 'sans-serif' }}>
        Cargando catálogos...
      </div>
    );
  }

  return (
    <div style={{ padding: '4px', fontFamily: 'sans-serif' }}>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#0f172a', margin: 0 }}>Catálogos</h1>
        <p style={{ color: '#64748b', fontSize: '14px', margin: '4px 0 0 0' }}>
          Marcas, clientes, proveedores y métodos de pago usados en productos, ventas y compras.
        </p>
      </div>

      {error && (
        <div style={{ backgroundColor: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', padding: '12px 16px', borderRadius: '10px', marginBottom: '16px', fontSize: '13px' }}>
          ⚠️ {error}
        </div>
      )}

      {/* RESUMEN NUMÉRICO */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '20px' }}>
        {[
          { label: 'Marcas', valor: marcas.length, Icono: Tag, color: '#1e3a8a' },
          { label: 'Clientes', valor: clientes.length, Icono: Users, color: '#16a34a' },
          { label: 'Proveedores', valor: proveedores.length, Icono: Truck, color: '#d97706' },
          { label: 'Métodos de pago', valor: metodosPago.length, Icono: Wallet, color: '#7c3aed' },
        ].map(({ label, valor, Icono, color }) => (
          <div key={label} style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '38px', height: '38px', borderRadius: '10px', backgroundColor: `${color}1a`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icono size={18} color={color} />
            </div>
            <div>
              <div style={{ fontSize: '20px', fontWeight: '700', color: '#0f172a', lineHeight: 1 }}>{valor}</div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{label}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <button style={tabButtonStyle(tab === 'marcas')} onClick={() => setTab('marcas')}>
          <Tag size={15} /> Marcas
        </button>
        <button style={tabButtonStyle(tab === 'clientes')} onClick={() => setTab('clientes')}>
          <Users size={15} /> Clientes
        </button>
        <button style={tabButtonStyle(tab === 'proveedores')} onClick={() => setTab('proveedores')}>
          <Truck size={15} /> Proveedores
        </button>
        <button style={tabButtonStyle(tab === 'metodos-pago')} onClick={() => setTab('metodos-pago')}>
          <Wallet size={15} /> Métodos de pago
        </button>
      </div>

      {/* MARCAS */}
      {tab === 'marcas' && (
        <div style={cardContainerStyle}>
          <div style={filaAccionesStyle}>
            <div style={buscadorStyle}>
              <Search size={15} color="#94a3b8" />
              <input
                placeholder="Buscar marca..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                style={{ border: 'none', outline: 'none', background: 'none', fontSize: '13px', width: '100%', color: '#334155' }}
              />
            </div>
            <button style={botonNuevo} onClick={abrirNuevaMarca}>
              <Plus size={14} /> Nueva marca
            </button>
          </div>

          {marcasFiltradas.length === 0 ? (
            estadoVacio(marcas.length === 0 ? 'Aún no hay marcas registradas.' : 'Ninguna marca coincide con tu búsqueda.')
          ) : (
            <div style={gridCards}>
              {marcasFiltradas.map((m) => (
                <div key={m.id} style={itemCard}>
                  <div style={avatarStyle(colorPorTexto(m.nombre))}>{m.nombre.charAt(0).toUpperCase()}</div>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b' }}>{m.nombre}</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>ID #{m.id}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* CLIENTES */}
      {tab === 'clientes' && (
        <div style={cardContainerStyle}>
          <div style={filaAccionesStyle}>
            <div style={buscadorStyle}>
              <Search size={15} color="#94a3b8" />
              <input
                placeholder="Buscar por nombre o documento..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                style={{ border: 'none', outline: 'none', background: 'none', fontSize: '13px', width: '100%', color: '#334155' }}
              />
            </div>
            <button style={botonNuevo} onClick={abrirNuevoCliente}>
              <Plus size={14} /> Nuevo cliente
            </button>
          </div>

          {clientesFiltrados.length === 0 ? (
            estadoVacio(clientes.length === 0 ? 'Aún no hay clientes registrados.' : 'Ningún cliente coincide con tu búsqueda.')
          ) : (
            <div style={gridCards}>
              {clientesFiltrados.map((c) => (
                <div key={c.id} style={itemCard}>
                  <div style={avatarStyle(colorPorTexto(c.nombre))}>{c.nombre.charAt(0).toUpperCase()}</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nombre}</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', gap: '10px', marginTop: '2px' }}>
                      {c.telefono && <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><Phone size={10} /> {c.telefono}</span>}
                      {c.documento && <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><FileText size={10} /> {c.documento}</span>}
                      {!c.telefono && !c.documento && <span>Sin datos de contacto</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* PROVEEDORES */}
      {tab === 'proveedores' && (
        <div style={cardContainerStyle}>
          <div style={filaAccionesStyle}>
            <div style={buscadorStyle}>
              <Search size={15} color="#94a3b8" />
              <input
                placeholder="Buscar proveedor..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                style={{ border: 'none', outline: 'none', background: 'none', fontSize: '13px', width: '100%', color: '#334155' }}
              />
            </div>
            <button style={botonNuevo} onClick={abrirNuevoProveedor}>
              <Plus size={14} /> Nuevo proveedor
            </button>
          </div>

          {proveedoresFiltrados.length === 0 ? (
            estadoVacio(proveedores.length === 0 ? 'Aún no hay proveedores registrados.' : 'Ningún proveedor coincide con tu búsqueda.')
          ) : (
            <div style={gridCards}>
              {proveedoresFiltrados.map((p) => (
                <div key={p.id} style={itemCard}>
                  <div style={avatarStyle(colorPorTexto(p.nombre))}>{p.nombre.charAt(0).toUpperCase()}</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nombre}</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '2px' }}>
                      {p.contacto && <span>{p.contacto}</span>}
                      <span style={{ display: 'flex', gap: '10px' }}>
                        {p.telefono && <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><Phone size={10} /> {p.telefono}</span>}
                        {p.email && <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><Mail size={10} /> {p.email}</span>}
                      </span>
                      {!p.contacto && !p.telefono && !p.email && <span>Sin datos de contacto</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* METODOS DE PAGO */}
      {tab === 'metodos-pago' && (
        <div style={cardContainerStyle}>
          <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 16px 0' }}>
            Catálogo fijo del sistema (no editable desde aquí).
          </p>
          {metodosPago.length === 0 ? (
            estadoVacio('No hay métodos de pago configurados.')
          ) : (
            <div style={gridCards}>
              {metodosPago.map((mp) => {
                const Icono = iconoMetodoPago(mp.nombre);
                return (
                  <div key={mp.id} style={itemCard}>
                    <div style={avatarStyle('#334155')}>
                      <Icono size={17} />
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', textTransform: 'capitalize' }}>{mp.nombre}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {modalMarca && (
        <Modal title="Nueva marca" onClose={() => setModalMarca(false)}>
          <form onSubmit={handleGuardarMarca}>
            {errorMarca && (
              <div style={{ backgroundColor: '#fef2f2', color: '#b91c1c', padding: '8px 12px', borderRadius: '6px', fontSize: '13px', marginBottom: '8px' }}>
                {errorMarca}
              </div>
            )}
            <label style={labelStyle}>Nombre</label>
            <input required style={inputStyle} value={formMarca.nombre} onChange={(e) => setFormMarca({ ...formMarca, nombre: e.target.value })} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '22px' }}>
              <button type="button" style={secondaryButtonStyle} onClick={() => setModalMarca(false)}>Cancelar</button>
              <button type="submit" disabled={guardandoMarca} style={{ ...primaryButtonStyle, opacity: guardandoMarca ? 0.7 : 1 }}>
                {guardandoMarca ? 'Guardando...' : 'Crear marca'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {modalCliente && (
        <Modal title="Nuevo cliente" onClose={() => setModalCliente(false)}>
          <form onSubmit={handleGuardarCliente}>
            {errorCliente && (
              <div style={{ backgroundColor: '#fef2f2', color: '#b91c1c', padding: '8px 12px', borderRadius: '6px', fontSize: '13px', marginBottom: '8px' }}>
                {errorCliente}
              </div>
            )}
            <label style={labelStyle}>Nombre</label>
            <input required style={inputStyle} value={formCliente.nombre} onChange={(e) => setFormCliente({ ...formCliente, nombre: e.target.value })} />
            <label style={labelStyle}>Teléfono</label>
            <input style={inputStyle} value={formCliente.telefono} onChange={(e) => setFormCliente({ ...formCliente, telefono: e.target.value })} />
            <label style={labelStyle}>Documento (DNI/RUC)</label>
            <input style={inputStyle} value={formCliente.documento} onChange={(e) => setFormCliente({ ...formCliente, documento: e.target.value })} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '22px' }}>
              <button type="button" style={secondaryButtonStyle} onClick={() => setModalCliente(false)}>Cancelar</button>
              <button type="submit" disabled={guardandoCliente} style={{ ...primaryButtonStyle, opacity: guardandoCliente ? 0.7 : 1 }}>
                {guardandoCliente ? 'Guardando...' : 'Crear cliente'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {modalProveedor && (
        <Modal title="Nuevo proveedor" onClose={() => setModalProveedor(false)}>
          <form onSubmit={handleGuardarProveedor}>
            {errorProveedor && (
              <div style={{ backgroundColor: '#fef2f2', color: '#b91c1c', padding: '8px 12px', borderRadius: '6px', fontSize: '13px', marginBottom: '8px' }}>
                {errorProveedor}
              </div>
            )}
            <label style={labelStyle}>Nombre / Razón social</label>
            <input required style={inputStyle} value={formProveedor.nombre} onChange={(e) => setFormProveedor({ ...formProveedor, nombre: e.target.value })} />
            <label style={labelStyle}>Contacto</label>
            <input style={inputStyle} value={formProveedor.contacto} onChange={(e) => setFormProveedor({ ...formProveedor, contacto: e.target.value })} />
            <label style={labelStyle}>Teléfono</label>
            <input style={inputStyle} value={formProveedor.telefono} onChange={(e) => setFormProveedor({ ...formProveedor, telefono: e.target.value })} />
            <label style={labelStyle}>Email</label>
            <input type="email" style={inputStyle} value={formProveedor.email} onChange={(e) => setFormProveedor({ ...formProveedor, email: e.target.value })} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '22px' }}>
              <button type="button" style={secondaryButtonStyle} onClick={() => setModalProveedor(false)}>Cancelar</button>
              <button type="submit" disabled={guardandoProveedor} style={{ ...primaryButtonStyle, opacity: guardandoProveedor ? 0.7 : 1 }}>
                {guardandoProveedor ? 'Guardando...' : 'Crear proveedor'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

export default Catalogos;