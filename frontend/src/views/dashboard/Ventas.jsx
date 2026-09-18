import React, { useState, useEffect, useMemo } from 'react';
import { styles } from './Ventas.styles';
import { apiFetch } from '../../utils/api';
import { 
  ShoppingCart, Trash2, Plus, Minus, 
  User, Receipt, CreditCard, CheckCircle2, Check, UserPlus, FileDown, Eye, X, Ban, ChevronDown
} from 'lucide-react';

// ==========================================
// Constantes para validación de Clientes
// ==========================================
const PAISES = [
  { codigo: "PE", nombre: "Perú", prefijo: "+51", digitos: 9, empiezaCon: ["9"] },
  { codigo: "CO", nombre: "Colombia", prefijo: "+57", digitos: 10, empiezaCon: ["3"] },
  { codigo: "CL", nombre: "Chile", prefijo: "+56", digitos: 9, empiezaCon: ["9"] },
  { codigo: "MX", nombre: "México", prefijo: "+52", digitos: 10 },
  { codigo: "AR", nombre: "Argentina", prefijo: "+54", digitos: 10 },
  { codigo: "EC", nombre: "Ecuador", prefijo: "+593", digitos: 9, empiezaCon: ["9"] },
  { codigo: "BO", nombre: "Bolivia", prefijo: "+591", digitos: 8, empiezaCon: ["6", "7"] },
  { codigo: "US", nombre: "Estados Unidos", prefijo: "+1", digitos: 10 },
];

const TIPOS_DOC = {
  DNI: { label: "DNI", digitos: 8, campoNombre: "Nombre completo" },
  RUC: { label: "RUC", digitos: 11, campoNombre: "Razón social" },
};

function soloDigitos(valor) {
  return valor.replace(/\D/g, "");
}

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

  // Estados para el Modal Visor de PDF
  const [pdfUrlModal, setPdfUrlModal] = useState(null);
  const [cargandoPdfModal, setCargandoPdfModal] = useState(false);

  // Estados para el Modal de Anulación Inteligente (Baja vs NC)
  const [modalAnular, setModalAnular] = useState(false);
  const [ventaSeleccionada, setVentaSeleccionada] = useState(null);
  const [tipoAnulacion, setTipoAnulacion] = useState('BAJA'); // 'BAJA' o 'NC'
  const [motivoSeleccionado, setMotivoSeleccionado] = useState('RA'); // 'RA' o código de Catálogo 09
  const [descripcionMotivo, setDescripcionMotivo] = useState('');
  const [confirmadoCheckbox, setConfirmadoCheckbox] = useState(false);
  const [anulando, setAnulando] = useState(false);

  const [showModal, setShowModal] = useState(false);

  // ==========================================
  // Estados y lógica para Nuevo Cliente Modal
  // ==========================================
  const [modalCliente, setModalCliente] = useState(false);
  const [tipoDocCliente, setTipoDocCliente] = useState("DNI");
  const [nombreCliente, setNombreCliente] = useState("");
  const [documentoCliente, setDocumentoCliente] = useState("");
  const [paisCodigoCliente, setPaisCodigoCliente] = useState("PE");
  const [telefonoCliente, setTelefonoCliente] = useState("");
  const [tocadoCliente, setTocadoCliente] = useState({});
  const [guardandoCliente, setGuardandoCliente] = useState(false);
  const [errorCliente, setErrorCliente] = useState('');

  const pais = useMemo(() => PAISES.find((p) => p.codigo === paisCodigoCliente), [paisCodigoCliente]);
  const configDoc = TIPOS_DOC[tipoDocCliente];

  const erroresCliente = {
    nombre: nombreCliente.trim().length === 0 ? "Este campo es obligatorio" : "",
    documento:
      documentoCliente.length === 0
        ? "Este campo es obligatorio"
        : documentoCliente.length !== configDoc.digitos
        ? `El ${configDoc.label} debe tener ${configDoc.digitos} dígitos`
        : "",
    telefono:
      telefonoCliente.length === 0
        ? "Este campo es obligatorio"
        : telefonoCliente.length !== pais.digitos
        ? `El teléfono de ${pais.nombre} debe tener ${pais.digitos} dígitos`
        : pais.empiezaCon && !pais.empiezaCon.includes(telefonoCliente[0])
        ? `Debe empezar con ${pais.empiezaCon.join(" o ")}`
        : "",
  };

  const formClienteValido = !erroresCliente.nombre && !erroresCliente.documento && !erroresCliente.telefono;

  const marcarTocadoCliente = (campo) => setTocadoCliente((prev) => ({ ...prev, [campo]: true }));

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

  // ==========================================
  // 🚀 LÓGICA AUTOMÁTICA: DNI -> Boleta | RUC -> Factura
  // ==========================================
  useEffect(() => {
    const clienteActivo = clientes.find((c) => String(c.id) === String(clienteId));
    if (clienteActivo) {
      const doc = clienteActivo.documento || "";
      if (doc.length === 11) {
        setTipoComprobante('factura');
      } else {
        setTipoComprobante('boleta');
      }
    } else {
      setTipoComprobante('boleta');
    }
  }, [clienteId, clientes]);

  const clienteActivo = clientes.find((c) => String(c.id) === String(clienteId));
  const esClienteRUC = clienteActivo && clienteActivo.documento && clienteActivo.documento.length === 11;


  const handleGuardarNuevoCliente = async (e) => {
    e.preventDefault();
    setTocadoCliente({ nombre: true, documento: true, telefono: true });
    if (!formClienteValido) return;

    setGuardandoCliente(true);
    setErrorCliente('');
    try {
      const payload = {
        nombre: nombreCliente,
        telefono: `${pais.prefijo} ${telefonoCliente}`,
        documento: documentoCliente,
      };
      const creado = await apiFetch('/clientes', { method: 'POST', body: JSON.stringify(payload) });
      setClientes((prev) => [...prev, creado]);
      setClienteId(String(creado.id));
      setModalCliente(false);
      
      setTipoDocCliente("DNI");
      setNombreCliente("");
      setDocumentoCliente("");
      setPaisCodigoCliente("PE");
      setTelefonoCliente("");
      setTocadoCliente({});
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

  const cambiarCantidadTexto = (id, valorTexto) => {
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
      setError('Selecciona un cliente antes de completar la venta.');
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
      
      setCarrito([]);
      cargarProductos();
      setShowModal(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setProcesando(false);
    }
  };

  const handleDescargarPDF = async (ventaId, serie, numero) => {
    setDescargandoId(ventaId);
    try {
      const response = await fetch(`http://localhost:8000/ventas/${ventaId}/pdf/descargar`, {
        headers: { 'Authorization': `Bearer ${token}` }
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

  const handleVerPDF = async (ventaId) => {
    setCargandoPdfModal(true);
    try {
      const response = await fetch(`http://localhost:8000/ventas/${ventaId}/pdf`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('No se pudo cargar el PDF');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      setPdfUrlModal(url);
    } catch (err) {
      console.error('Error al visualizar PDF:', err);
      setError('No se pudo abrir el visor del PDF.');
    } finally {
      setCargandoPdfModal(false);
    }
  };

  const handleVerNC = async (ventaIdOriginal) => {
    setCargandoPdfModal(true);
    try {
      const response = await fetch(`http://localhost:8000/ventas/${ventaIdOriginal}/pdf-nc`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('No se encontró el PDF de la Nota de Crédito');
      const blob = await response.blob();
      setPdfUrlModal(window.URL.createObjectURL(blob));
    } catch (err) {
      setError('Error al visualizar la Nota de Crédito.');
    } finally {
      setCargandoPdfModal(false);
    }
  };

  const cerrarModalPdf = () => {
    if (pdfUrlModal) {
      window.URL.revokeObjectURL(pdfUrlModal);
    }
    setPdfUrlModal(null);
  };

  // ==========================================
  // 🚀 APERTURA INTELIGENTE DEL MODAL DE ANULACIÓN (REGLA 7 DÍAS SUNAT)
  // ==========================================
  const abrirModalAnular = (v) => {
    setVentaSeleccionada(v);
    
    // Calcular días transcurridos desde la emisión
    const fechaVenta = new Date(v.fecha);
    const hoy = new Date();
    const diferenciaDias = Math.floor((hoy - fechaVenta) / (1000 * 60 * 60 * 24));

    // Si está dentro de los 7 días, seleccionamos Baja por defecto. Si no, Nota de Crédito.
    if (diferenciaDias <= 7) {
      setTipoAnulacion('BAJA');
      setMotivoSeleccionado('RA');
    } else {
      setTipoAnulacion('NC');
      setMotivoSeleccionado('01');
    }

    setDescripcionMotivo('');
    setConfirmadoCheckbox(false);
    setModalAnular(true);
  };

  const handleConfirmarAnulacion = async (e) => {
    e.preventDefault();
    if (!confirmadoCheckbox || !ventaSeleccionada) return;
    setAnulando(true);
    try {
      await apiFetch(`/ventas/${ventaSeleccionada.id}/anular`, {
        method: 'POST',
        body: JSON.stringify({ 
          codigo: motivoSeleccionado,
          motivo: descripcionMotivo.trim() || 'Anulación de la operación'
        })
      });
      setModalAnular(false);
      setVentaSeleccionada(null);
      cargarHistorial();
    } catch (err) {
      setError('Error al anular comprobante: ' + err.message);
    } finally {
      setAnulando(false);
    }
  };

  const estiloEstadoSunat = (estado) => {
    switch (estado) {
      case 'aceptado':
      case 'enviado':
        return { backgroundColor: '#ecfdf5', color: '#047857' };
      case 'rechazado':
      case 'anulado':
        return { backgroundColor: '#fef2f2', color: '#b91c1c' };
      default:
        return { backgroundColor: '#f1f5f9', color: '#475569' };
    }
  };

  const formatearFechaSegura = (fecha) => {
    if (!fecha) return '-';
    try {
      return new Date(fecha).toLocaleString('es-PE');
    } catch (e) {
      return String(fecha);
    }
  };

  return (
    <div style={styles.container}>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#0f172a' }}>Ventas / Punto de Venta</h1>
        <p style={{ color: '#64748B', fontSize: '14px' }}>POS — Registra y gestiona tus ventas rápidamente</p>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <button 
          type="button"
          onClick={() => setVista('pos')} 
          style={{ padding: '9px 18px', borderRadius: '8px', border: '1px solid', borderColor: vista === 'pos' ? '#cbd5e1' : 'transparent', backgroundColor: vista === 'pos' ? '#ffffff' : 'transparent', fontWeight: vista === 'pos' ? '600' : '400', color: vista === 'pos' ? '#0f172a' : '#64748b', cursor: 'pointer' }}
        >
          Punto de Venta
        </button>
        <button 
          type="button"
          onClick={() => setVista('historial')} 
          style={{ padding: '9px 18px', borderRadius: '8px', border: '1px solid', borderColor: vista === 'historial' ? '#cbd5e1' : 'transparent', backgroundColor: vista === 'historial' ? '#ffffff' : 'transparent', fontWeight: vista === 'historial' ? '600' : '400', color: vista === 'historial' ? '#0f172a' : '#64748b', cursor: 'pointer' }}
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
              type="button"
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
                ) : ventas.map((v) => {
                  const esNotaCredito = v.tipo_documento_id === '07';
                  const estaAnulado = v.estado_sunat === 'anulado';

                  return (
                    <tr key={v.id} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: estaAnulado ? '#f8fafc' : '#ffffff' }}>
                      <td style={{ padding: '14px 16px', fontWeight: '600', color: estaAnulado ? '#94a3b8' : '#0f172a' }}>
                        #{v.id} {esNotaCredito && <span style={{ fontSize: '10px', backgroundColor: '#e0f2fe', color: '#0369a1', padding: '2px 6px', borderRadius: '4px', marginLeft: '4px' }}>NC</span>}
                      </td>
                      <td style={{ padding: '14px 16px', color: '#475569' }}>{formatearFechaSegura(v.fecha)}</td>
                      <td style={{ padding: '14px 16px' }}>{v.cliente?.nombre || (v.cliente_id ? `Cliente #${v.cliente_id}` : '-')}</td>
                      <td style={{ padding: '14px 16px', textTransform: 'capitalize' }}>
                        {esNotaCredito ? 'Nota de Crédito' : (v.tipo_comprobante || 'Boleta')}
                        {v.serie && <span style={{ display: 'block', fontSize: '11px', color: '#64748b' }}>{v.serie}-{String(v.numero || v.id).padStart(8, '0')}</span>}
                      </td>
                      <td style={{ padding: '14px 16px', textTransform: 'capitalize' }}>{v.metodo_pago?.nombre || '-'}</td>
                      <td style={{ padding: '14px 16px', fontWeight: 700, color: estaAnulado ? '#94a3b8' : '#059669', textDecoration: estaAnulado ? 'line-through' : 'none' }}>
                        S/ {Number(v.total || 0).toFixed(2)}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <span style={{
                          ...estiloEstadoSunat(v.estado_sunat),
                          fontSize: '11px', fontWeight: '600', padding: '3px 10px', borderRadius: '12px', textTransform: 'capitalize'
                        }}>
                          {estaAnulado ? 'Anulado (Con NC)' : (v.estado_sunat || 'pendiente')}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                        <div className="flex items-center gap-2 justify-center">
                          <button
                            type="button"
                            onClick={(e) => { e.preventDefault(); handleVerPDF(v.id); }}
                            disabled={cargandoPdfModal}
                            style={{ background: 'none', border: 'none', color: '#7c3aed', fontSize: '12px', fontWeight: '600', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '3px', padding: 0 }}
                          >
                            <Eye size={13} /> Ver
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.preventDefault(); handleDescargarPDF(v.id, v.serie, v.numero); }}
                            disabled={descargandoId === v.id}
                            style={{ background: 'none', border: 'none', color: '#0284c7', fontSize: '12px', fontWeight: '600', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '3px', padding: 0, opacity: descargandoId === v.id ? 0.6 : 1 }}
                          >
                            <FileDown size={13} /> Descargar
                          </button>

                          {estaAnulado && (
                            <button
                              type="button"
                              onClick={(e) => { e.preventDefault(); handleVerNC(v.id); }}
                              disabled={cargandoPdfModal}
                              style={{ background: '#e0f2fe', border: '1px solid #bae6fd', color: '#0369a1', fontSize: '11px', fontWeight: '700', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: '6px', marginLeft: '4px', transition: 'all 0.2s' }}
                              title="Visualizar la Nota de Crédito Electrónica de esta anulación"
                            >
                              <Receipt size={12} /> Ver NC
                            </button>
                          )}

                          {!estaAnulado && !esNotaCredito && (
                            <button
                              type="button"
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); abrirModalAnular(v); }}
                              style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: '12px', fontWeight: '600', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '3px', padding: 0, marginLeft: '4px' }}
                              title="Anular comprobante"
                            >
                              <Ban size={13} /> Anular
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '20px', alignItems: 'start' }}>
          <div>
            <input
              placeholder="🔍 Buscar producto por nombre o código..."
              style={{ width: '100%', padding: '12px 16px', borderRadius: '10px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', fontSize: '14px', outline: 'none', marginBottom: '16px', boxSizing: 'border-box' }}
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

          <div style={{ backgroundColor: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '20px', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.03)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShoppingCart size={18} color="#ea580c" />
                <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', margin: 0 }}>Carrito de venta</h2>
                <span style={{ backgroundColor: '#ffedd5', color: '#c2410c', fontSize: '11px', fontWeight: '700', borderRadius: '10px', padding: '2px 7px' }}>
                  {carrito.length}
                </span>
              </div>
              {carrito.length > 0 && (
                <button type="button" onClick={() => setCarrito([])} style={{ color: '#ef4444', border: 'none', background: 'none', fontSize: '12px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Trash2 size={13} /> Limpiar
                </button>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '4px', display: 'block' }}>CLIENTE</label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center', flex: 1 }}>
                    <User size={15} color="#94a3b8" style={{ position: 'absolute', left: '10px', zIndex: 1 }} />
                    <select
                      value={clienteId}
                      onChange={(e) => setClienteId(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px 8px 32px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none', backgroundColor: '#fff', cursor: 'pointer' }}
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
                    style={{ width: '34px', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#ea580c', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
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
                      disabled 
                      style={{ 
                        width: '100%', 
                        padding: '8px 8px 8px 28px', 
                        borderRadius: '8px', 
                        border: '1px solid #cbd5e1', 
                        fontSize: '12px', 
                        backgroundColor: '#f1f5f9', 
                        color: '#475569',
                        fontWeight: '600',
                        outline: 'none', 
                        cursor: 'not-allowed' 
                      }}
                    >
                      {esClienteRUC ? (
                        <option value="factura">Factura</option>
                      ) : (
                        <option value="boleta">Boleta</option>
                      )}
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '4px', display: 'block' }}>PAGO</label>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <CreditCard size={14} color="#94a3b8" style={{ position: 'absolute', left: '8px', zIndex: '1' }} />
                    <select 
                      value={metodoPagoId} 
                      onChange={(e) => setMetodoPagoId(e.target.value)}
                      style={{ width: '100%', padding: '8px 8px 8px 28px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', backgroundColor: '#fff', outline: 'none', cursor: 'pointer', textTransform: 'capitalize' }}
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

            <div style={{ minHeight: '160px', maxHeight: '260px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
              {carrito.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '30px 0', color: '#94a3b8', gap: '8px' }}>
                  <ShoppingCart size={32} strokeWidth={1.5} color="#cbd5e1" />
                  <span style={{ fontSize: '13px', fontWeight: '500' }}>Tu carrito está vacío</span>
                </div>
              ) : (
                carrito.map((item) => (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: '8px', backgroundColor: '#f8fafc', border: '1px solid #f1f5f9' }}>
                    <div style={{ flex: 1, paddingRight: '8px' }}>
                      <div style={{ fontSize: '12px', fontWeight: '600', color: '#1e293b', lineHeight: '1.2' }}>{item.nombre}</div>
                      <div style={{ fontSize: '11px', color: '#ea580c', fontWeight: '600', marginTop: '2px' }}>
                        S/ {parseFloat(item.precio_venta).toFixed(2)}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <button type="button" onClick={() => modificarCantidad(item.id, -1)} style={{ width: '24px', height: '24px', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#475569' }}>
                        <Minus size={12} />
                      </button>
                      <input
                        type="number" min="1" value={item.cantidad}
                        onChange={(e) => cambiarCantidadTexto(item.id, e.target.value)}
                        onBlur={() => confirmarCantidad(item.id)}
                        onFocus={(e) => e.target.select()}
                        style={{ width: '38px', fontSize: '13px', fontWeight: '700', textAlign: 'center', color: '#0f172a', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '3px 2px', outline: 'none' }}
                      />
                      <button type="button" onClick={() => modificarCantidad(item.id, 1)} style={{ width: '24px', height: '24px', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#475569' }}>
                        <Plus size={12} />
                      </button>
                      <button type="button" onClick={() => quitarDelCarrito(item.id)} style={{ border: 'none', background: 'none', color: '#94a3b8', cursor: 'pointer', padding: '2px', marginLeft: '4px' }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#64748b' }}>
                <span>Subtotal</span>
                <span>S/ {subtotal.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#64748b' }}>
                <span>IGV (18%)</span>
                <span>S/ {igv.toFixed(2)}</span>
              </div>
              <div style={{ backgroundColor: '#0f172a', color: '#ffffff', padding: '12px 16px', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                <span style={{ fontSize: '13px', fontWeight: '500', color: '#94a3b8' }}>TOTAL A PAGAR</span>
                <span style={{ fontSize: '18px', fontWeight: '800', color: '#38bdf8' }}>S/ {total.toFixed(2)}</span>
              </div>
              <button
                type="button"
                style={{ width: '100%', padding: '12px', borderRadius: '10px', border: 'none', backgroundColor: procesando || carrito.length === 0 ? '#cbd5e1' : '#ea580c', color: '#ffffff', fontWeight: '700', fontSize: '14px', cursor: procesando || carrito.length === 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '4px' }}
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
      {/* 🚀 MODAL VISOR EMERGENTE DE PDF                                */}
      {/* ------------------------------------------------------------- */}
      {pdfUrlModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '20px' }}>
          <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', width: '100%', maxWidth: '850px', height: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
            <div style={{ padding: '14px 20px', backgroundColor: '#1e293b', color: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>Visualizador de Comprobante</h3>
              <button type="button" onClick={cerrarModalPdf} style={{ background: 'none', border: 'none', color: '#ffffff', cursor: 'pointer', padding: '4px' }}>
                <X size={20} />
              </button>
            </div>
            <div style={{ flex: 1, backgroundColor: '#e2e8f0' }}>
              <iframe src={pdfUrlModal} title="Vista previa PDF" style={{ width: '100%', height: '100%', border: 'none' }} />
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 🚀 MODAL DE ANULACIÓN INTELIGENTE (COMBOBOX RESTRINGIDO SUNAT) */}
      {/* ------------------------------------------------------------- */}
      {modalAnular && ventaSeleccionada && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '20px' }}>
          <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '28px', width: '440px', maxWidth: '95vw', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', position: 'relative', display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '90vh', overflowY: 'auto' }}>
            
            <button type="button" onClick={() => setModalAnular(false)} style={{ position: 'absolute', top: '20px', right: '20px', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
              <X size={20} />
            </button>

            <div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>Anular comprobante</h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>
                Esta acción comunica directamente con SUNAT y no se puede deshacer.
              </p>
            </div>

            <div style={{ backgroundColor: '#f8fafc', borderRadius: '12px', padding: '14px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Comprobante</span>
                <span style={{ fontWeight: 600, color: '#0f172a', textTransform: 'capitalize' }}>
                  {ventaSeleccionada.tipo_comprobante || 'Documento'} {ventaSeleccionada.serie || 'F001'}-{String(ventaSeleccionada.numero || ventaSeleccionada.id).padStart(8, '0')}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Cliente</span>
                <span style={{ fontWeight: 600, color: '#0f172a' }}>
                  {ventaSeleccionada.cliente?.nombre || 'Cliente General'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Fecha emisión</span>
                <span style={{ fontWeight: 600, color: '#0f172a' }}>
                  {formatearFechaSegura(ventaSeleccionada.fecha)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Total</span>
                <span style={{ fontWeight: 600, color: '#0f172a' }}>
                  S/ {Number(ventaSeleccionada.total || 0).toFixed(2)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#64748b' }}>Estado SUNAT</span>
                <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 10px', borderRadius: '12px', backgroundColor: '#ecfdf5', color: '#047857', textTransform: 'capitalize' }}>
                  {ventaSeleccionada.estado_sunat || 'Enviado'}
                </span>
              </div>
            </div>

            <form onSubmit={handleConfirmarAnulacion} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              
              {/* COMBOBOX DE TIPO DE ANULACIÓN CON RESTRICCIÓN DE 7 DÍAS SUNAT */}
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '4px' }}>Método de anulación</label>
                <select
                  value={tipoAnulacion}
                  onChange={(e) => {
                    const val = e.target.value;
                    setTipoAnulacion(val);
                    if (val === 'BAJA') {
                      setMotivoSeleccionado('RA');
                    } else {
                      setMotivoSeleccionado('01');
                    }
                  }}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', backgroundColor: '#fff', outline: 'none', cursor: 'pointer', fontWeight: '600' }}
                >
                  {(() => {
                    const fechaVenta = new Date(ventaSeleccionada.fecha);
                    const hoy = new Date();
                    const diferenciaDias = Math.floor((hoy - fechaVenta) / (1000 * 60 * 60 * 24));
                    const plazoVencido = diferenciaDias > 7;

                    return (
                      <>
                        <option value="BAJA" disabled={plazoVencido}>
                          {plazoVencido ? '❌ Comunicación de Baja (Bloqueado: > 7 días SUNAT)' : '⚡ Comunicación de Baja (RA - Plazo vigente)'}
                        </option>
                        <option value="NC">
                          📄 Nota de Crédito Electrónica (Catálogo 09)
                        </option>
                      </>
                    );
                  })()}
                </select>
              </div>

              {/* Dependiendo de la selección mostramos Catálogo 09 o Nota Informativa de Baja */}
              {tipoAnulacion === 'NC' ? (
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '4px' }}>Motivo Nota de Crédito (Catálogo SUNAT No. 09)</label>
                  <select
                    value={motivoSeleccionado}
                    onChange={(e) => setMotivoSeleccionado(e.target.value)}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', backgroundColor: '#fff', outline: 'none', cursor: 'pointer' }}
                  >
                    <option value="01">01 - Anulación de la operación</option>
                    <option value="02">02 - Anulación por error en el RUC</option>
                    <option value="03">03 - Corrección por error en la descripción</option>
                    <option value="04">04 - Descuento global</option>
                    <option value="05">05 - Descuento por ítem</option>
                    <option value="06">06 - Devolución total</option>
                    <option value="07">07 - Devolución por ítem</option>
                    <option value="08">08 - Bonificación</option>
                    <option value="09">09 - Disminución en el valor</option>
                    <option value="10">10 - Otros Conceptos</option>
                  </select>
                </div>
              ) : (
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '4px' }}>Código SUNAT</label>
                  <input
                    type="text"
                    value="RA - Comunicación de Baja Electrónica"
                    readOnly
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', backgroundColor: '#f1f5f9', color: '#475569', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
              )}

              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '4px' }}>Descripción del motivo</label>
                <textarea
                  rows={3}
                  placeholder={tipoAnulacion === 'BAJA' ? "Ej. Error de digitación en el comprobante..." : "Detalles adicionales internos..."}
                  value={descripcionMotivo}
                  onChange={(e) => setDescripcionMotivo(e.target.value)}
                  required={tipoAnulacion === 'BAJA'}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none', boxSizing: 'border-box', resize: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '12px', color: '#334155', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  id="chkConfirmar"
                  checked={confirmadoCheckbox}
                  onChange={(e) => setConfirmadoCheckbox(e.target.checked)}
                  style={{ marginTop: '2px', cursor: 'pointer' }}
                />
                <label htmlFor="chkConfirmar" style={{ cursor: 'pointer' }}>
                  Confirmo que los datos son correctos y autorizo la anulación ante SUNAT.
                </label>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                <button
                  type="button"
                  onClick={() => setModalAnular(false)}
                  style={{ flex: 1, backgroundColor: '#ffffff', color: '#334155', border: '1px solid #cbd5e1', padding: '10px', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontSize: '14px' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!confirmadoCheckbox || anulando}
                  style={{
                    flex: 1,
                    backgroundColor: !confirmadoCheckbox || anulando ? '#fca5a5' : '#dc2626',
                    color: '#fff', border: 'none', padding: '10px', borderRadius: '8px', fontWeight: '600',
                    cursor: !confirmadoCheckbox || anulando ? 'not-allowed' : 'pointer', fontSize: '14px'
                  }}
                >
                  {anulando ? 'Procesando...' : 'Confirmar Anulación'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 🚀 MODAL DE ÉXITO DE VENTA                                     */}
      {/* ------------------------------------------------------------- */}
      {showModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '16px', padding: '28px 24px', width: '340px', textAlign: 'center', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: '54px', height: '54px', borderRadius: '50%', backgroundColor: 'rgba(16, 185, 129, 0.15)', border: '1px solid #059669', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
              <Check size={28} strokeWidth={2.5} />
            </div>
            <div>
              <h3 style={{ margin: 0, color: '#ffffff', fontSize: '18px', fontWeight: '700' }}>¡Venta completada!</h3>
              <p style={{ margin: '6px 0 0 0', color: '#9ca3af', fontSize: '13px' }}>La venta fue registrada correctamente en el sistema.</p>
            </div>
            <button type="button" onClick={() => setShowModal(false)} style={{ marginTop: '8px', width: '100%', padding: '10px', backgroundColor: '#10b981', color: '#ffffff', border: 'none', borderRadius: '8px', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}>
              Aceptar
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 🚀 MODAL ALTA RÁPIDA DE CLIENTE CON VALIDACIÓN AVANZADA        */}
      {/* ------------------------------------------------------------- */}
      {modalCliente && (
        <div onClick={() => setModalCliente(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '20px' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ backgroundColor: '#fff', borderRadius: '16px', width: '448px', maxWidth: '92vw', padding: '28px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', position: 'relative' }}>
            
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#0f172a' }}>Nuevo cliente</h2>
              <button type="button" onClick={() => setModalCliente(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0 }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleGuardarNuevoCliente}>
              {errorCliente && (
                <div style={{ backgroundColor: '#fef2f2', color: '#b91c1c', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '16px', border: '1px solid #fecaca' }}>
                  {errorCliente}
                </div>
              )}

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#475569', marginBottom: '6px' }}>Tipo de documento</label>
                <div style={{ position: 'relative' }}>
                  <select 
                    value={tipoDocCliente} 
                    onChange={(e) => { 
                      setTipoDocCliente(e.target.value); 
                      setDocumentoCliente(''); 
                      setTocadoCliente(prev => ({...prev, documento: false})); 
                    }} 
                    style={{ width: '100%', appearance: 'none', padding: '10px 36px 10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', color: '#0f172a', outline: 'none', backgroundColor: '#fff', cursor: 'pointer' }}
                  >
                    <option value="DNI">DNI</option>
                    <option value="RUC">RUC</option>
                  </select>
                  <ChevronDown size={16} color="#94a3b8" style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#475569', marginBottom: '6px' }}>{configDoc.campoNombre}</label>
                <input 
                  type="text" 
                  value={nombreCliente} 
                  onChange={(e) => setNombreCliente(e.target.value)} 
                  onBlur={() => marcarTocadoCliente('nombre')} 
                  placeholder={tipoDocCliente === "DNI" ? "Ej. Ana Torres Ríos" : "Ej. Comercial Andina S.A.C."} 
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: `1px solid ${tocadoCliente.nombre && erroresCliente.nombre ? '#f87171' : '#cbd5e1'}`, fontSize: '14px', color: '#0f172a', boxSizing: 'border-box', outline: 'none' }} 
                />
                {tocadoCliente.nombre && erroresCliente.nombre && (
                  <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#ef4444' }}>{erroresCliente.nombre}</p>
                )}
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#475569', marginBottom: '6px' }}>{configDoc.label}</label>
                <input 
                  type="text" 
                  inputMode="numeric" 
                  value={documentoCliente} 
                  onChange={(e) => { 
                    const digitos = soloDigitos(e.target.value).slice(0, configDoc.digitos); 
                    setDocumentoCliente(digitos); 
                  }} 
                  onBlur={() => marcarTocadoCliente('documento')} 
                  placeholder={tipoDocCliente === "DNI" ? "8 dígitos" : "11 dígitos"} 
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: `1px solid ${tocadoCliente.documento && erroresCliente.documento ? '#f87171' : '#cbd5e1'}`, fontSize: '14px', color: '#0f172a', boxSizing: 'border-box', outline: 'none' }} 
                />
                <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  {tocadoCliente.documento && erroresCliente.documento ? (
                    <p style={{ margin: 0, fontSize: '12px', color: '#ef4444' }}>{erroresCliente.documento}</p>
                  ) : (
                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>{documentoCliente.length}/{configDoc.digitos} dígitos</span>
                  )}
                </div>
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#475569', marginBottom: '6px' }}>Teléfono</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <select 
                      value={paisCodigoCliente} 
                      onChange={(e) => { 
                        setPaisCodigoCliente(e.target.value); 
                        setTelefonoCliente(''); 
                        setTocadoCliente(prev => ({...prev, telefono: false})); 
                      }} 
                      style={{ height: '100%', appearance: 'none', padding: '10px 32px 10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', color: '#0f172a', outline: 'none', backgroundColor: '#fff', cursor: 'pointer' }}
                    >
                      {PAISES.map((p) => (
                        <option key={p.codigo} value={p.codigo}>{p.prefijo} {p.codigo}</option>
                      ))}
                    </select>
                    <ChevronDown size={14} color="#94a3b8" style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                  </div>
                  <input 
                    type="text" 
                    inputMode="numeric" 
                    value={telefonoCliente} 
                    onChange={(e) => { 
                      const digitos = soloDigitos(e.target.value).slice(0, pais.digitos); 
                      setTelefonoCliente(digitos); 
                    }} 
                    onBlur={() => marcarTocadoCliente('telefono')} 
                    placeholder={`${pais.digitos} dígitos`} 
                    style={{ flex: 1, minWidth: 0, padding: '10px 14px', borderRadius: '8px', border: `1px solid ${tocadoCliente.telefono && erroresCliente.telefono ? '#f87171' : '#cbd5e1'}`, fontSize: '14px', color: '#0f172a', boxSizing: 'border-box', outline: 'none' }} 
                  />
                </div>
                <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  {tocadoCliente.telefono && erroresCliente.telefono ? (
                    <p style={{ margin: 0, fontSize: '12px', color: '#ef4444' }}>{erroresCliente.telefono}</p>
                  ) : (
                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>{telefonoCliente.length}/{pais.digitos} dígitos · {pais.nombre}</span>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" onClick={() => setModalCliente(false)} style={{ backgroundColor: '#f1f5f9', color: '#334155', border: 'none', padding: '10px 16px', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontSize: '14px' }}>
                  Cancelar
                </button>
                <button type="submit" disabled={guardandoCliente} style={{ backgroundColor: '#1e3a8a', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontSize: '14px', opacity: guardandoCliente ? 0.7 : 1 }}>
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