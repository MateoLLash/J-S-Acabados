import React, { useState, useEffect } from 'react';
import { styles } from './Ventas.styles';
import { apiFetch } from '../../utils/api';
import { 
  ShoppingCart, Trash2, Plus, Minus, 
  User, Receipt, CreditCard, CheckCircle2, Check, UserPlus, FileDown
} from 'lucide-react';

export default function Ventas() {
  const [productos, setProductos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [metodosPago, setMetodosPago] = useState([]);
  const [carrito, setCarrito] = useState([]);
  const [vista, setVista] = useState('pos'); // 'pos' o 'historial'
  const [busqueda, setBusqueda] = useState('');
  const [clienteId, setClienteId] = useState('');
  const [tipoComprobante, setTipoComprobante] = useState('boleta');
  const [metodoPagoId, setMetodoPagoId] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState('');
  const [ventas, setVentas] = useState([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);
  const [descargandoId, setDescargandoId] = useState(null);

  // NUEVO: Estado para controlar la visibilidad del Modal / Popup
  const [showModal, setShowModal] = useState(false);

  // Alta rápida de cliente sin salir del POS
  const [modalCliente, setModalCliente] = useState(false);
  const [nuevoCliente, setNuevoCliente] = useState({ nombre: '', telefono: '', documento: '' });
  const [guardandoCliente, setGuardandoCliente] = useState(false);
  const [errorCliente, setErrorCliente] = useState('');

  const token = localStorage.getItem('token') || '';

  const cargarProductos = () => {
    apiFetch('/productos/')
      .then((data) => setProductos(data))
      .catch((err) => console.error(err));
  };

  const cargarClientesYMetodos = () => {
    Promise.all([apiFetch('/clientes'), apiFetch('/metodos-pago')])
      .then(([clientesData, metodosData]) => {
        setClientes(clientesData);
        setMetodosPago(metodosData);
        setMetodoPagoId((prev) => prev || (metodosData[0] ? String(metodosData[0].id) : ''));
      })
      .catch((err) => console.error(err));
  };

  useEffect(() => {
    cargarProductos();
    cargarClientesYMetodos();
  }, []);

  const handleGuardarNuevoCliente = async (e) => {
    e.preventDefault();
    setGuardandoCliente(true);
    setErrorCliente('');
    try {
      const payload = {
        nombre: nuevoCliente.nombre,
        telefono: nuevoCliente.telefono || null,
        documento: nuevoCliente.documento || null,
      };
      const creado = await apiFetch('/clientes', { method: 'POST', body: JSON.stringify(payload) });
      setClientes((prev) => [...prev, creado]);
      setClienteId(String(creado.id));
      setModalCliente(false);
      setNuevoCliente({ nombre: '', telefono: '', documento: '' });
    } catch (err) {
      setErrorCliente(err.message);
    } finally {
      setGuardandoCliente(false);
    }
  };

  const cargarHistorial = () => {
    setCargandoHistorial(true);
    apiFetch('/ventas/')
      .then((data) => setVentas(data))
      .catch((err) => setError(err.message))
      .finally(() => setCargandoHistorial(false));
  };

  useEffect(() => {
    if (vista === 'historial') {
      cargarHistorial();
    }
  }, [vista]);

  // Cálculos financieros para el resumen
  const subtotal = carrito.reduce(
    (acc, item) => acc + parseFloat(item.precio_venta) * (Number(item.cantidad) || 0),
    0
  );
  const igv = subtotal * 0.18;
  const total = subtotal + igv;

  const productosFiltrados = productos.filter((p) =>
    p.nombre.toLowerCase().includes(busqueda.toLowerCase())
  );

  const agregarAlCarrito = (producto) => {
    setCarrito((prev) => {
      const existente = prev.find((item) => item.id === producto.id);
      if (existente) {
        return prev.map((item) =>
          item.id === producto.id ? { ...item, cantidad: (Number(item.cantidad) || 0) + 1 } : item
        );
      }
      return [...prev, { ...producto, cantidad: 1 }];
    });
  };

  const modificarCantidad = (id, delta) => {
    setCarrito((prev) =>
      prev
        .map((item) =>
          item.id === id ? { ...item, cantidad: (Number(item.cantidad) || 0) + delta } : item
        )
        .filter((item) => item.cantidad > 0)
    );
  };

  // Permite escribir la cantidad directamente en vez de dar clic varias veces
  // (útil cuando se vende una cantidad grande, ej. 50 cajas de porcelanato).
  const cambiarCantidadTexto = (id, valorTexto) => {
    // Mientras tipea, dejamos que el campo quede vacío momentáneamente
    if (valorTexto === '') {
      setCarrito((prev) => prev.map((item) => (item.id === id ? { ...item, cantidad: '' } : item)));
      return;
    }
    const n = parseInt(valorTexto, 10);
    if (isNaN(n) || n < 0) return;
    setCarrito((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const maxDisponible = item.stock ?? n;
        return { ...item, cantidad: Math.min(n, maxDisponible) };
      })
    );
  };

  // Al salir del campo: si quedó vacío o en 0, lo regresamos a 1
  // (no tiene sentido tener un producto en el carrito con cantidad 0).
  const confirmarCantidad = (id) => {
    setCarrito((prev) =>
      prev.map((item) =>
        item.id === id && (item.cantidad === '' || Number(item.cantidad) < 1)
          ? { ...item, cantidad: 1 }
          : item
      )
    );
  };

  const quitarDelCarrito = (id) => {
    setCarrito((prev) => prev.filter((item) => item.id !== id));
  };

  const handleFinalizarVenta = async () => {
    if (carrito.length === 0) {
      setError('Agrega al menos un producto al carrito.');
      return;
    }
    if (!clienteId) {
      setError('Selecciona un cliente (o crea uno nuevo) antes de completar la venta.');
      return;
    }
    setProcesando(true);
    setError('');
    try {
      await apiFetch('/ventas/', {
        method: 'POST',
        body: JSON.stringify({
          cliente_id: Number(clienteId),
          tipo_comprobante: tipoComprobante,
          metodo_pago_id: metodoPagoId ? Number(metodoPagoId) : null,
          items: carrito.map((item) => ({
            producto_id: item.id,
            cantidad: Number(item.cantidad) || 1,
            precio_unitario: item.precio_venta,
          })),
        }),
      });
      
      // Limpiamos carrito (mantenemos el cliente seleccionado por si sigue comprando)
      setCarrito([]);
      cargarProductos();
      
      // MOSTRAR EL POPUP MODAL EN LUGAR DE alert()
      setShowModal(true);

    } catch (err) {
      setError(err.message);
    } finally {
      setProcesando(false);
    }
  };

  // Descarga el comprobante en PDF directamente desde el backend.
  // Se hace con fetch crudo (no apiFetch) porque la respuesta es un
  // archivo binario (blob), no JSON.
  const handleDescargarPDF = async (ventaId, serie, numero) => {
    setDescargandoId(ventaId);
    try {
      const response = await fetch(`http://localhost:8000/ventas/${ventaId}/pdf`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) throw new Error('No se pudo generar el PDF del comprobante');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Comprobante-${serie || 'B001'}-${numero}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error al descargar el PDF:', err);
      setError('Hubo un error al descargar el comprobante en PDF.');
    } finally {
      setDescargandoId(null);
    }
  };

  // Colores del badge de estado SUNAT, siguiendo la misma paleta que ya
  // usa el resto de la pantalla (verde de "disponible", rojo de error).
  const estiloEstadoSunat = (estado) => {
    switch (estado) {
      case 'aceptado':
      case 'enviado':
        return { backgroundColor: '#ecfdf5', color: '#047857' };
      case 'rechazado':
        return { backgroundColor: '#fef2f2', color: '#b91c1c' };
      default:
        return { backgroundColor: '#f1f5f9', color: '#475569' };
    }
  };

  return (
    <div style={styles.container}>
      {/* Cabecera y Tabs */}
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#0f172a' }}>Ventas / Punto de Venta</h1>
        <p style={{ color: '#64748B', fontSize: '14px' }}>POS — Registra y gestiona tus ventas rápidamente</p>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <button 
          onClick={() => setVista('pos')} 
          style={{ 
            padding: '9px 18px', 
            borderRadius: '8px', 
            border: '1px solid',
            borderColor: vista === 'pos' ? '#cbd5e1' : 'transparent',
            backgroundColor: vista === 'pos' ? '#ffffff' : 'transparent', 
            fontWeight: vista === 'pos' ? '600' : '400',
            color: vista === 'pos' ? '#0f172a' : '#64748b',
            boxShadow: vista === 'pos' ? '0 1px 3px rgba(0,0,0,0.05)' : 'none',
            cursor: 'pointer' 
          }}
        >
          Punto de Venta
        </button>
        <button 
          onClick={() => setVista('historial')} 
          style={{ 
            padding: '9px 18px', 
            borderRadius: '8px', 
            border: '1px solid',
            borderColor: vista === 'historial' ? '#cbd5e1' : 'transparent',
            backgroundColor: vista === 'historial' ? '#ffffff' : 'transparent', 
            fontWeight: vista === 'historial' ? '600' : '400',
            color: vista === 'historial' ? '#0f172a' : '#64748b',
            boxShadow: vista === 'historial' ? '0 1px 3px rgba(0,0,0,0.05)' : 'none',
            cursor: 'pointer' 
          }}
        >
          Historial de ventas
        </button>
      </div>

      {error && (
        <div style={{ backgroundColor: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', padding: '12px 16px', borderRadius: '10px', marginBottom: '16px', fontSize: '13px' }}>
          ⚠️ {error}
        </div>
      )}

      {vista === 'historial' ? (
        <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 16px', borderBottom: '1px solid #f1f5f9' }}>
            <button
              onClick={cargarHistorial}
              style={{ backgroundColor: '#f1f5f9', color: '#334155', border: 'none', padding: '7px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
            >
              Actualizar
            </button>
          </div>
          {cargandoHistorial ? (
            <div style={{ padding: '30px', textAlign: 'center', color: '#f97316', fontWeight: '500' }}>Cargando historial...</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                  <th style={{ padding: '14px 16px' }}>#</th>
                  <th style={{ padding: '14px 16px' }}>Fecha</th>
                  <th style={{ padding: '14px 16px' }}>Cliente</th>
                  <th style={{ padding: '14px 16px' }}>Comprobante</th>
                  <th style={{ padding: '14px 16px' }}>Pago</th>
                  <th style={{ padding: '14px 16px' }}>Total</th>
                  <th style={{ padding: '14px 16px' }}>Estado SUNAT</th>
                  <th style={{ padding: '14px 16px', textAlign: 'center' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {ventas.length === 0 ? (
                  <tr><td colSpan="8" style={{ padding: '30px', textAlign: 'center', color: '#64748b' }}>Aún no hay ventas registradas.</td></tr>
                ) : ventas.map((v) => (
                  <tr key={v.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '14px 16px', fontWeight: '600' }}>#{v.id}</td>
                    <td style={{ padding: '14px 16px', color: '#475569' }}>{new Date(v.fecha).toLocaleString('es-PE')}</td>
                    <td style={{ padding: '14px 16px' }}>{v.cliente?.nombre || (v.cliente_id ? `Cliente #${v.cliente_id}` : '-')}</td>
                    <td style={{ padding: '14px 16px', textTransform: 'capitalize' }}>{v.tipo_comprobante}</td>
                    <td style={{ padding: '14px 16px', textTransform: 'capitalize' }}>{v.metodo_pago?.nombre || '-'}</td>
                    <td style={{ padding: '14px 16px', fontWeight: 700, color: '#059669' }}>S/ {Number(v.total).toFixed(2)}</td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{
                        ...estiloEstadoSunat(v.estado_sunat),
                        fontSize: '11px',
                        fontWeight: '600',
                        padding: '3px 10px',
                        borderRadius: '12px',
                        textTransform: 'capitalize'
                      }}>
                        {v.estado_sunat || 'pendiente'}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                      <button
                        onClick={() => handleDescargarPDF(v.id, v.serie, v.numero)}
                        disabled={descargandoId === v.id}
                        style={{
                          backgroundColor: '#ffffff',
                          color: '#334155',
                          border: '1px solid #cbd5e1',
                          padding: '6px 12px',
                          borderRadius: '8px',
                          fontSize: '12px',
                          fontWeight: '600',
                          cursor: descargandoId === v.id ? 'not-allowed' : 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          opacity: descargandoId === v.id ? 0.6 : 1
                        }}
                      >
                        <FileDown size={13} />
                        {descargandoId === v.id ? 'Generando...' : 'PDF'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '20px', alignItems: 'start' }}>
          
          {/* LADO IZQUIERDO: CATÁLOGO */}
          <div>
            <input
              placeholder="🔍 Buscar producto por nombre o código..."
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: '10px',
                border: '1px solid #cbd5e1',
                backgroundColor: '#ffffff',
                fontSize: '14px',
                outline: 'none',
                marginBottom: '16px',
                boxSizing: 'border-box'
              }}
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
            <div style={styles.contenedorProductos}>
              {productosFiltrados.map((p) => (
                <div key={p.id} style={styles.cardProducto} onClick={() => agregarAlCarrito(p)}>
                  <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a', marginBottom: '4px' }}>{p.nombre}</h3>
                  <p style={{ fontSize: '12px', color: '#64748B', marginBottom: '8px' }}>{p.marca?.nombre || ''}</p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <p style={{ color: '#ea580c', fontWeight: '700', fontSize: '15px' }}>S/ {parseFloat(p.precio_venta).toFixed(2)}</p>
                    <span style={{ fontSize: '11px', backgroundColor: '#ecfdf5', color: '#047857', padding: '3px 8px', borderRadius: '12px', fontWeight: '500' }}>
                      {p.stock} disp.
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* LADO DERECHO: CARRITO */}
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '14px',
            border: '1px solid #e2e8f0',
            padding: '20px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.03)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            
            {/* Header Carrito */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShoppingCart size={18} color="#ea580c" />
                <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', margin: 0 }}>Carrito de venta</h2>
                <span style={{ backgroundColor: '#ffedd5', color: '#c2410c', fontSize: '11px', fontWeight: '700', borderRadius: '10px', padding: '2px 7px' }}>
                  {carrito.length}
                </span>
              </div>
              {carrito.length > 0 && (
                <button 
                  onClick={() => setCarrito([])} 
                  style={{ color: '#ef4444', border: 'none', background: 'none', fontSize: '12px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <Trash2 size={13} /> Limpiar
                </button>
              )}
            </div>

            {/* Inputs de Venta */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '4px', display: 'block' }}>CLIENTE</label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center', flex: 1 }}>
                    <User size={15} color="#94a3b8" style={{ position: 'absolute', left: '10px', zIndex: 1 }} />
                    <select
                      value={clienteId}
                      onChange={(e) => setClienteId(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 10px 8px 32px',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        fontSize: '13px',
                        outline: 'none',
                        boxSizing: 'border-box',
                        backgroundColor: '#fff',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="">Selecciona un cliente...</option>
                      {clientes.map((c) => (
                        <option key={c.id} value={c.id}>{c.nombre}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setErrorCliente(''); setModalCliente(true); }}
                    title="Nuevo cliente"
                    style={{
                      width: '34px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      backgroundColor: '#fff',
                      color: '#ea580c',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <UserPlus size={15} />
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '4px', display: 'block' }}>COMPROBANTE</label>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <Receipt size={14} color="#94a3b8" style={{ position: 'absolute', left: '8px', zIndex: 1 }} />
                    <select 
                      value={tipoComprobante} 
                      onChange={(e) => setTipoComprobante(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 8px 8px 28px',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        fontSize: '12px',
                        backgroundColor: '#fff',
                        outline: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="boleta">Boleta</option>
                      <option value="factura">Factura</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '4px', display: 'block' }}>PAGO</label>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <CreditCard size={14} color="#94a3b8" style={{ position: 'absolute', left: '8px', zIndex: 1 }} />
                    <select 
                      value={metodoPagoId} 
                      onChange={(e) => setMetodoPagoId(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 8px 8px 28px',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        fontSize: '12px',
                        backgroundColor: '#fff',
                        outline: 'none',
                        cursor: 'pointer',
                        textTransform: 'capitalize'
                      }}
                    >
                      {metodosPago.length === 0 && <option value="">Sin métodos configurados</option>}
                      {metodosPago.map((mp) => (
                        <option key={mp.id} value={mp.id} style={{ textTransform: 'capitalize' }}>{mp.nombre}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Lista Carrito */}
            <div style={{
              minHeight: '160px',
              maxHeight: '260px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              paddingRight: '4px'
            }}>
              {carrito.length === 0 ? (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '30px 0',
                  color: '#94a3b8',
                  gap: '8px'
                }}>
                  <ShoppingCart size={32} strokeWidth={1.5} color="#cbd5e1" />
                  <span style={{ fontSize: '13px', fontWeight: '500' }}>Tu carrito está vacío</span>
                </div>
              ) : (
                carrito.map((item) => (
                  <div key={item.id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    backgroundColor: '#f8fafc',
                    border: '1px solid #f1f5f9'
                  }}>
                    <div style={{ flex: 1, paddingRight: '8px' }}>
                      <div style={{ fontSize: '12px', fontWeight: '600', color: '#1e293b', lineHeight: '1.2' }}>{item.nombre}</div>
                      <div style={{ fontSize: '11px', color: '#ea580c', fontWeight: '600', marginTop: '2px' }}>
                        S/ {parseFloat(item.precio_venta).toFixed(2)}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <button 
                        onClick={() => modificarCantidad(item.id, -1)}
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '6px',
                          border: '1px solid #cbd5e1',
                          backgroundColor: '#ffffff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          color: '#475569'
                        }}
                      >
                        <Minus size={12} />
                      </button>

                      {/* Cantidad editable directamente: evita tener que dar clic
                          muchas veces cuando se vende una cantidad grande. */}
                      <input
                        type="number"
                        min="1"
                        value={item.cantidad}
                        onChange={(e) => cambiarCantidadTexto(item.id, e.target.value)}
                        onBlur={() => confirmarCantidad(item.id)}
                        onFocus={(e) => e.target.select()}
                        style={{
                          width: '38px',
                          fontSize: '13px',
                          fontWeight: '700',
                          textAlign: 'center',
                          color: '#0f172a',
                          border: '1px solid #cbd5e1',
                          borderRadius: '6px',
                          padding: '3px 2px',
                          outline: 'none',
                        }}
                      />

                      <button 
                        onClick={() => modificarCantidad(item.id, 1)}
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '6px',
                          border: '1px solid #cbd5e1',
                          backgroundColor: '#ffffff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          color: '#475569'
                        }}
                      >
                        <Plus size={12} />
                      </button>

                      <button 
                        onClick={() => quitarDelCarrito(item.id)}
                        style={{ border: 'none', background: 'none', color: '#94a3b8', cursor: 'pointer', padding: '2px', marginLeft: '4px' }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Resumen Final */}
            <div style={{
              borderTop: '1px solid #e2e8f0',
              paddingTop: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#64748b' }}>
                <span>Subtotal</span>
                <span>S/ {subtotal.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#64748b' }}>
                <span>IGV (18%)</span>
                <span>S/ {igv.toFixed(2)}</span>
              </div>

              <div style={{
                backgroundColor: '#0f172a',
                color: '#ffffff',
                padding: '12px 16px',
                borderRadius: '10px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: '4px'
              }}>
                <span style={{ fontSize: '13px', fontWeight: '500', color: '#94a3b8' }}>TOTAL A PAGAR</span>
                <span style={{ fontSize: '18px', fontWeight: '800', color: '#38bdf8' }}>S/ {total.toFixed(2)}</span>
              </div>

              <button
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '10px',
                  border: 'none',
                  backgroundColor: procesando || carrito.length === 0 ? '#cbd5e1' : '#ea580c',
                  color: '#ffffff',
                  fontWeight: '700',
                  fontSize: '14px',
                  cursor: procesando || carrito.length === 0 ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  marginTop: '4px',
                  boxShadow: procesando || carrito.length === 0 ? 'none' : '0 4px 10px rgba(234, 88, 12, 0.25)',
                  transition: 'all 0.2s ease'
                }}
                onClick={handleFinalizarVenta}
                disabled={procesando || carrito.length === 0}
              >
                <CheckCircle2 size={18} />
                {procesando ? 'Procesando Venta...' : 'Completar Venta'}
              </button>
            </div>

          </div>

        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 🚀 MODAL / POPUP PERSONALIZADO DE ÉXITO ESTILO MODERNO        */}
      {/* ------------------------------------------------------------- */}
      {showModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div style={{
            backgroundColor: '#111827',
            border: '1px solid #374151',
            borderRadius: '16px',
            padding: '28px 24px',
            width: '340px',
            textAlign: 'center',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '14px'
          }}>
            
            {/* Círculo de Check verde fluorescente */}
            <div style={{
              width: '54px',
              height: '54px',
              borderRadius: '50%',
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid #059669',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#10b981'
            }}>
              <Check size={28} strokeWidth={2.5} />
            </div>

            {/* Título y Mensaje */}
            <div>
              <h3 style={{ margin: 0, color: '#ffffff', fontSize: '18px', fontWeight: '700' }}>
                ¡Venta completada!
              </h3>
              <p style={{ margin: '6px 0 0 0', color: '#9ca3af', fontSize: '13px' }}>
                La venta fue registrada correctamente en el sistema.
              </p>
            </div>

            {/* Botón de Aceptar */}
            <button
              onClick={() => setShowModal(false)}
              style={{
                marginTop: '8px',
                width: '100%',
                padding: '10px',
                backgroundColor: '#10b981',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontWeight: '600',
                fontSize: '14px',
                cursor: 'pointer',
                transition: 'background-color 0.2s',
                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
              }}
            >
              Aceptar
            </button>

          </div>
        </div>
      )}

      {/* MODAL ALTA RÁPIDA DE CLIENTE */}
      {modalCliente && (
        <div
          onClick={() => setModalCliente(false)}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ backgroundColor: '#fff', borderRadius: '12px', width: '380px', maxWidth: '92vw', padding: '22px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <h2 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 700, color: '#1e293b' }}>Nuevo cliente</h2>
            <form onSubmit={handleGuardarNuevoCliente}>
              {errorCliente && (
                <div style={{ backgroundColor: '#fef2f2', color: '#b91c1c', padding: '8px 12px', borderRadius: '6px', fontSize: '13px', marginBottom: '10px' }}>
                  {errorCliente}
                </div>
              )}
              <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '4px' }}>Nombre</label>
              <input
                required
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box', marginBottom: '10px' }}
                value={nuevoCliente.nombre}
                onChange={(e) => setNuevoCliente({ ...nuevoCliente, nombre: e.target.value })}
              />
              <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '4px' }}>Teléfono</label>
              <input
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box', marginBottom: '10px' }}
                value={nuevoCliente.telefono}
                onChange={(e) => setNuevoCliente({ ...nuevoCliente, telefono: e.target.value })}
              />
              <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '4px' }}>Documento (DNI/RUC)</label>
              <input
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' }}
                value={nuevoCliente.documento}
                onChange={(e) => setNuevoCliente({ ...nuevoCliente, documento: e.target.value })}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '18px' }}>
                <button type="button" onClick={() => setModalCliente(false)} style={{ backgroundColor: '#f1f5f9', color: '#334155', border: 'none', padding: '10px 18px', borderRadius: '6px', fontWeight: '600', cursor: 'pointer', fontSize: '14px' }}>Cancelar</button>
                <button type="submit" disabled={guardandoCliente} style={{ backgroundColor: '#1e3a8a', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: '6px', fontWeight: '600', cursor: 'pointer', fontSize: '14px', opacity: guardandoCliente ? 0.7 : 1 }}>
                  {guardandoCliente ? 'Guardando...' : 'Crear cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}