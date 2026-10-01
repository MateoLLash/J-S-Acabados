import React, { useState, useEffect } from 'react';
import { apiFetch, API_URL } from '../../utils/api';
import { 
  Truck, MapPin, Package, Plus, Trash2, CheckCircle2, X, Check, Eye 
} from 'lucide-react';

export default function GuiasRemision() {
  const [guias, setGuias] = useState([]);
  const [productos, setProductos] = useState([]);
  const [clientes, setClientes] = useState([]);
  
  const [cargando, setCargando] = useState(false);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState('');
  
  const [showModalExito, setShowModalExito] = useState(false);

  // Estados para el Visualizador PDF
  const [pdfModalAbierto, setPdfModalAbierto] = useState(false);
  const [pdfUrl, setPdfUrl] = useState(null);

  const [formData, setFormData] = useState({
    fecha_traslado: new Date().toISOString().split('T')[0],
    motivo_traslado: '01',
    descripcion_motivo: 'Venta',
    peso_total: '',
    ubigeo_partida: '150101', 
    direccion_partida: '',
    ubigeo_llegada: '',
    direccion_llegada: '',
    destinatario_tipo_doc: '6', 
    destinatario_num_doc: '',
    destinatario_nombre: '',
    modalidad_transporte: '01', 
    transportista_doc: '',
    transportista_nombre: '',
    vehiculo_placa: '',
    conductor_doc: ''
  });

  const [itemsTraslado, setItemsTraslado] = useState([]);
  const [productoSeleccionado, setProductoSeleccionado] = useState('');
  const [cantidadInput, setCantidadInput] = useState('');

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = () => {
    setCargando(true);
    Promise.all([
      apiFetch('/guias/').catch(() => []),
      apiFetch('/productos/').catch(() => []),
      apiFetch('/clientes/').catch(() => [])
    ]).then(([guiasData, prodData, clientesData]) => {
      setGuias(guiasData);
      setProductos(prodData);
      setClientes(clientesData);
      setCargando(false);
    });
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSeleccionarCliente = (e) => {
    const clienteSeleccionado = clientes.find(c => String(c.id) === e.target.value);
    
    if (clienteSeleccionado) {
      const numeroDoc = clienteSeleccionado.numero_documento || clienteSeleccionado.documento || clienteSeleccionado.ruc || clienteSeleccionado.dni || '';
      const tipoDoc = numeroDoc.length === 11 ? '6' : '1';

      setFormData({
        ...formData,
        destinatario_tipo_doc: tipoDoc,
        destinatario_num_doc: numeroDoc,
        destinatario_nombre: clienteSeleccionado.nombre || ''
      });
    }
  };

  const agregarProducto = () => {
    if (!productoSeleccionado || !cantidadInput || Number(cantidadInput) <= 0) return;
    
    const prod = productos.find(p => String(p.id) === productoSeleccionado);
    if (!prod) return;

    setItemsTraslado([...itemsTraslado, {
      producto_id: prod.id,
      codigo_producto: `PROD-${prod.id}`, 
      descripcion: prod.nombre,
      cantidad: Number(cantidadInput),
      unidad_medida: 'NIU'
    }]);

    setProductoSeleccionado('');
    setCantidadInput('');
  };

  const quitarProducto = (index) => {
    setItemsTraslado(itemsTraslado.filter((_, i) => i !== index));
  };

  const handleVerPDF = async (guiaId) => {
    try {
      const token = localStorage.getItem('token');

      const response = await fetch(`${API_URL}/guias/${guiaId}/pdf`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.status === 401) {
        throw new Error('Sesión expirada, inicia sesión de nuevo.');
      }
      if (!response.ok) throw new Error('No se pudo generar el PDF');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      setPdfUrl(url);
      setPdfModalAbierto(true);
    } catch (err) {
      alert('Error al cargar PDF: ' + err.message);
    }
  };

  // 🔥 NUEVA FUNCIÓN PARA ANULAR GUÍA
  const handleAnularGuia = async (guiaId) => {
    if (!window.confirm('¿Estás seguro de que deseas anular esta guía de remisión? Recuerda que según SUNAT, solo se puede anular si el traslado AÚN NO ha iniciado.')) {
      return;
    }
    
    setCargando(true);
    try {
      await apiFetch(`/guias/${guiaId}/anular`, {
        method: 'POST'
      });
      alert('Guía anulada con éxito en SUNAT.');
      cargarDatos();
    } catch (err) {
      alert(`Error al anular: ${err.message || err.detail || 'Error desconocido'}`);
      setCargando(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (itemsTraslado.length === 0) {
      setError('Debes agregar al menos un producto para trasladar.');
      return;
    }
    if (!formData.peso_total || Number(formData.peso_total) <= 0) {
      setError('El peso total debe ser mayor a 0.');
      return;
    }
    if (!formData.destinatario_num_doc || !formData.destinatario_nombre) {
      setError('Los datos del destinatario (Cliente) son obligatorios.');
      return;
    }

    setProcesando(true);
    setError('');

    try {
      const payload = { ...formData, peso_total: Number(formData.peso_total), detalles: itemsTraslado };
      await apiFetch('/guias/', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      
      setModalAbierto(false);
      setShowModalExito(true);
      
      setFormData({ ...formData, peso_total: '', destinatario_num_doc: '', destinatario_nombre: '', vehiculo_placa: '', conductor_doc: '', direccion_llegada: '', ubigeo_llegada: '' });
      setItemsTraslado([]);
      cargarDatos();
    } catch (err) {
      let msjError = err.message || 'Error desconocido';
      if (typeof err.detail === 'string') msjError = err.detail;
      else if (Array.isArray(err.detail)) msjError = "Faltan campos obligatorios revisa el formulario.";
      setError(`Error al procesar: ${msjError}`);
    } finally {
      setProcesando(false);
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#0f172a', margin: 0 }}>Guías de Remisión</h1>
          <p style={{ color: '#64748B', fontSize: '14px', margin: '4px 0 0 0' }}>Control y traslado de mercadería (Remitente)</p>
        </div>
        <button 
          onClick={() => { setError(''); setModalAbierto(true); }}
          style={{ backgroundColor: '#1e40af', color: 'white', padding: '10px 16px', borderRadius: '8px', border: 'none', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
        >
          <Truck size={18} /> Nueva Guía
        </button>
      </div>

      {/* HISTORIAL DE GUÍAS */}
      <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
        {cargando ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Cargando guías...</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                <th style={{ padding: '14px 16px' }}>Guía Nro.</th>
                <th style={{ padding: '14px 16px' }}>Fecha Traslado</th>
                <th style={{ padding: '14px 16px' }}>Destinatario</th>
                <th style={{ padding: '14px 16px' }}>Motivo</th>
                <th style={{ padding: '14px 16px' }}>Peso (Kg)</th>
                <th style={{ padding: '14px 16px' }}>Estado SUNAT</th>
                <th style={{ padding: '14px 16px', textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {guias.length === 0 ? (
                <tr><td colSpan="7" style={{ padding: '30px', textAlign: 'center', color: '#64748b' }}>No hay guías de remisión registradas.</td></tr>
              ) : guias.map(g => (
                <tr key={g.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '14px 16px', fontWeight: '600', color: '#0f172a' }}>{g.serie}-{String(g.numero).padStart(8, '0')}</td>
                  <td style={{ padding: '14px 16px', color: '#475569' }}>{g.fecha_traslado}</td>
                  <td style={{ padding: '14px 16px' }}>{g.destinatario_nombre} <br/><span style={{ fontSize: '11px', color: '#64748b' }}>{g.destinatario_num_doc}</span></td>
                  <td style={{ padding: '14px 16px' }}>{g.descripcion_motivo}</td>
                  <td style={{ padding: '14px 16px', fontWeight: '600' }}>{g.peso_total} kg</td>
                  <td style={{ padding: '14px 16px' }}>
                    <span style={{ fontSize: '11px', fontWeight: '600', padding: '3px 10px', borderRadius: '12px', backgroundColor: g.estado_sunat === 'aceptado' || g.estado_sunat === 'enviado' ? '#ecfdf5' : '#fef2f2', color: g.estado_sunat === 'aceptado' || g.estado_sunat === 'enviado' ? '#047857' : '#b91c1c', textTransform: 'capitalize' }}>
                      {g.estado_sunat}
                    </span>
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'center', display: 'flex', gap: '8px', justifyContent: 'center' }}>
                    <button 
                      onClick={() => handleVerPDF(g.id)} 
                      style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '6px', cursor: 'pointer', color: '#1e40af', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                      title="Ver Comprobante"
                    >
                      <Eye size={18} />
                    </button>
                    
                    {/* 🔥 Botón de Anulación Condicional */}
                    {g.estado_sunat === 'aceptado' && (
                      <button 
                        onClick={() => handleAnularGuia(g.id)} 
                        style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '6px', cursor: 'pointer', color: '#b91c1c', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                        title="Anular Guía de Remisión"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* MODAL NUEVA GUÍA */}
      {modalAbierto && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '20px' }}>
          <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', width: '850px', maxWidth: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
            
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f8fafc' }}>
              <h2 style={{ margin: '0', fontSize: '18px', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}><Truck size={20} color="#1e40af" /> Emitir Guía de Remisión (Remitente)</h2>
              <button onClick={() => setModalAbierto(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={20}/></button>
            </div>

            <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
              {error && <div style={{ backgroundColor: '#fef2f2', color: '#b91c1c', padding: '12px', borderRadius: '8px', border: '1px solid #fecaca', marginBottom: '20px', fontSize: '13px' }}>⚠️ {error}</div>}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                {/* COLUMNA IZQUIERDA */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
                    <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#334155', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>1. Datos Generales</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>Fecha de Traslado</label>
                        <input type="date" name="fecha_traslado" value={formData.fecha_traslado} onChange={handleChange} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', outline: 'none' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>Peso Bruto (KG)</label>
                        <input type="number" step="0.01" name="peso_total" placeholder="Ej. 120.5" value={formData.peso_total} onChange={handleChange} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', outline: 'none' }} />
                      </div>
                      <div style={{ gridColumn: 'span 2' }}>
                        <label style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>Motivo de Traslado</label>
                        <select name="motivo_traslado" value={formData.motivo_traslado} onChange={(e) => {
                          const desc = e.target.options[e.target.selectedIndex].text.split('- ')[1];
                          setFormData({ ...formData, motivo_traslado: e.target.value, descripcion_motivo: desc });
                        }} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', outline: 'none' }}>
                          <option value="01">01 - Venta</option>
                          <option value="02">02 - Compra</option>
                          <option value="04">04 - Traslado entre establecimientos de la misma empresa</option>
                          <option value="14">14 - Venta sujeta a confirmación del comprador</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
                    <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#334155', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>2. Direcciones</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div style={{ backgroundColor: '#f8fafc', padding: '10px', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
                        <p style={{ margin: '0 0 8px 0', fontSize: '12px', fontWeight: 'bold', color: '#475569', display: 'flex', alignItems: 'center', gap: '4px' }}><MapPin size={14}/> Partida</p>
                        <input type="text" name="ubigeo_partida" placeholder="Ubigeo (Ej. 150101)" value={formData.ubigeo_partida} onChange={handleChange} style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', marginBottom: '6px' }} maxLength={6} />
                        <input type="text" name="direccion_partida" placeholder="Dirección exacta de partida" value={formData.direccion_partida} onChange={handleChange} style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }} />
                      </div>
                      <div style={{ backgroundColor: '#fff7ed', padding: '10px', borderRadius: '8px', border: '1px solid #ffedd5' }}>
                        <p style={{ margin: '0 0 8px 0', fontSize: '12px', fontWeight: 'bold', color: '#c2410c', display: 'flex', alignItems: 'center', gap: '4px' }}><MapPin size={14}/> Llegada</p>
                        <input type="text" name="ubigeo_llegada" placeholder="Ubigeo (Ej. 150103)" value={formData.ubigeo_llegada} onChange={handleChange} style={{ width: '100%', padding: '6px 8px', border: '1px solid #fdba74', borderRadius: '4px', fontSize: '12px', marginBottom: '6px' }} maxLength={6} />
                        <input type="text" name="direccion_llegada" placeholder="Dirección exacta de destino" value={formData.direccion_llegada} onChange={handleChange} style={{ width: '100%', padding: '6px 8px', border: '1px solid #fdba74', borderRadius: '4px', fontSize: '12px' }} />
                      </div>
                    </div>
                  </div>

                </div>

                {/* COLUMNA DERECHA */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
                    <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#334155', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>3. Destinatario (Cliente)</h3>
                    
                    <div style={{ marginBottom: '12px' }}>
                      <select 
                        onChange={handleSeleccionarCliente}
                        defaultValue=""
                        style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', outline: 'none', backgroundColor: '#f8fafc', color: '#0f172a' }}
                      >
                        <option value="" disabled>Buscar cliente en la base de datos...</option>
                        {clientes.map(cliente => {
                          const doc = cliente.numero_documento || cliente.documento || cliente.ruc || cliente.dni || 'Sin doc';
                          return (
                            <option key={cliente.id} value={cliente.id}>
                              {cliente.nombre} - {doc}
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                      <select name="destinatario_tipo_doc" value={formData.destinatario_tipo_doc} onChange={handleChange} style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', outline: 'none' }}>
                        <option value="6">RUC</option>
                        <option value="1">DNI</option>
                        <option value="4">CE</option>
                      </select>
                      <input type="text" name="destinatario_num_doc" placeholder="Número de doc." value={formData.destinatario_num_doc} onChange={handleChange} style={{ flex: 1, padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', outline: 'none' }} />
                    </div>
                    <input type="text" name="destinatario_nombre" placeholder="Nombre completo o Razón Social" value={formData.destinatario_nombre} onChange={handleChange} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', outline: 'none' }} />
                  </div>

                  <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
                    <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#334155', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>4. Datos de Transporte</h3>
                    <select name="modalidad_transporte" value={formData.modalidad_transporte} onChange={handleChange} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', outline: 'none', marginBottom: '12px', fontWeight: '600' }}>
                      <option value="01">Transporte Público (Agencia tercerizada)</option>
                      <option value="02">Transporte Privado (Mis vehículos)</option>
                    </select>

                    {formData.modalidad_transporte === '02' ? (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div>
                          <label style={{ fontSize: '11px', color: '#64748b' }}>Placa Vehículo</label>
                          <input type="text" name="vehiculo_placa" placeholder="Ej. ABC-123" value={formData.vehiculo_placa} onChange={handleChange} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', outline: 'none', textTransform: 'uppercase' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: '11px', color: '#64748b' }}>DNI Conductor</label>
                          <input type="text" name="conductor_doc" placeholder="8 dígitos" value={formData.conductor_doc} onChange={handleChange} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', outline: 'none' }} maxLength={8} />
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <input type="text" name="transportista_doc" placeholder="RUC de Agencia de Transporte" value={formData.transportista_doc} onChange={handleChange} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', outline: 'none' }} maxLength={11} />
                        <input type="text" name="transportista_nombre" placeholder="Razón Social Agencia" value={formData.transportista_nombre} onChange={handleChange} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', outline: 'none' }} />
                      </div>
                    )}
                  </div>

                </div>
              </div>

              {/* SECCIÓN DE PRODUCTOS */}
              <div style={{ marginTop: '24px', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}><Package size={16}/> 5. Bienes a Trasladar</h3>
                
                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                  <select value={productoSeleccionado} onChange={(e) => setProductoSeleccionado(e.target.value)} style={{ flex: 1, padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', outline: 'none' }}>
                    <option value="">Buscar producto en inventario...</option>
                    {productos.map(p => <option key={p.id} value={p.id}>{p.nombre} (Stock: {p.stock})</option>)}
                  </select>
                  <input type="number" placeholder="Cant." value={cantidadInput} onChange={(e) => setCantidadInput(e.target.value)} style={{ width: '80px', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', outline: 'none', textAlign: 'center' }} />
                  <button onClick={agregarProducto} type="button" style={{ backgroundColor: '#0f172a', color: 'white', padding: '0 16px', borderRadius: '6px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px' }}>
                    <Plus size={14}/> Add
                  </button>
                </div>

                <div style={{ backgroundColor: '#f8fafc', borderRadius: '8px', minHeight: '100px', border: '1px dashed #cbd5e1', padding: '8px' }}>
                  {itemsTraslado.length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#94a3b8', padding: '30px 0', fontSize: '13px' }}>Agrega los productos que irán en el camión.</div>
                  ) : (
                    itemsTraslado.map((item, index) => (
                      <div key={index} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', marginBottom: '6px' }}>
                        <div>
                          <p style={{ margin: 0, fontSize: '13px', fontWeight: '600', color: '#1e293b' }}>{item.descripcion}</p>
                          <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: '#64748b' }}>Cód: {item.codigo_producto}</p>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                          <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#0f172a', backgroundColor: '#f1f5f9', padding: '4px 12px', borderRadius: '12px' }}>{item.cantidad} uni.</span>
                          <button onClick={() => quitarProducto(index)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}><Trash2 size={16}/></button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', backgroundColor: '#f8fafc', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={() => setModalAbierto(false)} style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', fontWeight: '600', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={handleSubmit} disabled={procesando} style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', backgroundColor: procesando ? '#93c5fd' : '#1e40af', color: '#fff', fontWeight: '600', cursor: procesando ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                {procesando ? 'Enviando a SUNAT...' : <><CheckCircle2 size={18}/> Generar Guía</>}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* MODAL DE ÉXITO */}
      {showModalExito && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '16px', padding: '28px 24px', width: '340px', textAlign: 'center', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: '54px', height: '54px', borderRadius: '50%', backgroundColor: 'rgba(16, 185, 129, 0.15)', border: '1px solid #059669', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
              <Check size={28} strokeWidth={2.5} />
            </div>
            <div>
              <h3 style={{ margin: 0, color: '#ffffff', fontSize: '18px', fontWeight: '700' }}>¡Guía Emitida!</h3>
              <p style={{ margin: '6px 0 0 0', color: '#9ca3af', fontSize: '13px' }}>La guía de remisión fue registrada y enviada a SUNAT con éxito.</p>
            </div>
            <button type="button" onClick={() => setShowModalExito(false)} style={{ marginTop: '8px', width: '100%', padding: '10px', backgroundColor: '#10b981', color: '#ffffff', border: 'none', borderRadius: '8px', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}>
              Aceptar
            </button>
          </div>
        </div>
      )}

      {/* MODAL VISUALIZADOR DE COMPROBANTE (PDF) */}
      {pdfModalAbierto && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10500, padding: '20px' }}>
          <div style={{ backgroundColor: '#1e293b', borderRadius: '8px', width: '900px', maxWidth: '100%', height: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}>
            
            <div style={{ padding: '12px 20px', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1e293b' }}>
              <h2 style={{ margin: '0', fontSize: '16px', fontWeight: 600, color: '#f8fafc' }}>
                Visualizador de Comprobante
              </h2>
              <button 
                onClick={() => { 
                  setPdfModalAbierto(false); 
                  if (pdfUrl) URL.revokeObjectURL(pdfUrl);
                  setPdfUrl(null); 
                }} 
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ flex: 1, backgroundColor: '#334155' }}>
              {pdfUrl && (
                <iframe 
                  src={pdfUrl} 
                  title="Visor PDF" 
                  style={{ width: '100%', height: '100%', border: 'none' }}
                />
              )}
            </div>

          </div>
        </div>
      )}
    </div>
  );
}