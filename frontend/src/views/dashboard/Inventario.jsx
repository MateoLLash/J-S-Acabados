import React, { useState, useEffect } from 'react';
import { styles } from './InventoryDashboard.styles';
import { Plus, TrendingDown, Clock, ImageOff, Download, Search, X } from 'lucide-react';
import { apiFetch, API_URL } from '../../utils/api';
import Modal, { inputStyle, labelStyle, primaryButtonStyle, secondaryButtonStyle } from '../../utils/Modal';
import ExcelJS from 'exceljs/dist/exceljs.min.js';
import { imagenUrl } from '../../utils/format';

const Inventario = () => {
  const [productos, setProductos] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [activeTab, setActiveTab] = useState('stock'); // 'stock', 'historial' o 'prediccion'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [prediccion, setPrediccion] = useState(null);
  const [cargandoPrediccion, setCargandoPrediccion] = useState(false);

  const [modalAbierto, setModalAbierto] = useState(false);
  const [form, setForm] = useState({ producto_id: '', tipo: 'entrada', cantidad: '', motivo: '' });
  const [guardando, setGuardando] = useState(false);
  const [formError, setFormError] = useState('');

  // Filtros de la pestaña 'Stock Por Producto'
  const [busquedaStock, setBusquedaStock] = useState('');
  const [categoriaFiltroStock, setCategoriaFiltroStock] = useState('');
  const [estadoFiltroStock, setEstadoFiltroStock] = useState(''); // '', 'bajo', 'ok'

  // Filtro del Kardex (historial)
  const [productoFiltro, setProductoFiltro] = useState('');

  const nombreCategoria = (categoriaId) => {
    const cat = categorias.find((c) => c.id === categoriaId);
    return cat ? cat.nombre : 'Sin categoría';
  };

  const cargarProductos = async () => {
    const data = await apiFetch('/productos/');
    // El inventario/almacén solo muestra productos propios (se excluyen los recibidos de Lina)
    setProductos(data.filter((p) => p.origen !== 'lina'));
  };

  const cargarCategorias = async () => {
    const data = await apiFetch('/categorias');
    setCategorias(data);
  };

  const cargarMovimientos = async () => {
    const data = await apiFetch('/inventario/movimientos');
    setMovimientos(data);
  };

  const cargarTodo = async () => {
    try {
      setLoading(true);
      await Promise.all([cargarProductos(), cargarMovimientos(), cargarCategorias()]);
      setError('');
    } catch (err) {
      console.error('Error cargando inventario:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarTodo();
  }, []);

  const cargarPrediccion = async () => {
    try {
      setCargandoPrediccion(true);
      const data = await apiFetch('/analitica/prediccion-stock?dias_analisis=30');
      setPrediccion(data);
    } catch (err) {
      console.error('Error cargando predicción de quiebre:', err);
    } finally {
      setCargandoPrediccion(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'prediccion' && prediccion === null) {
      cargarPrediccion();
    }
  }, [activeTab]);

  const abrirModal = () => {
    setForm({ producto_id: '', tipo: 'entrada', cantidad: '', motivo: '' });
    setFormError('');
    setModalAbierto(true);
  };

  const handleGuardar = async (e) => {
    e.preventDefault();
    setGuardando(true);
    setFormError('');
    try {
      await apiFetch('/inventario/movimientos', {
        method: 'POST',
        body: JSON.stringify({
          producto_id: Number(form.producto_id),
          tipo: form.tipo,
          cantidad: Number(form.cantidad),
          detalle: form.motivo || null, // <-- Modificado para que coincida con el backend
        }),
      });
      setModalAbierto(false);
      cargarTodo();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  // --- FILTRADO DE PRODUCTOS EN VIVO (TAB STOCK) ---
  const productosFiltrados = productos.filter((prod) => {
    const termino = busquedaStock.toLowerCase().trim();
    const coincideTexto =
      prod.nombre.toLowerCase().includes(termino) ||
      (prod.marca?.nombre && prod.marca.nombre.toLowerCase().includes(termino));

    const coincideCategoria = categoriaFiltroStock
      ? String(prod.categoria_id) === categoriaFiltroStock
      : true;

    const minStock = prod.stock_minimo || 10;
    const esBajo = prod.stock <= minStock;
    const coincideEstado =
      estadoFiltroStock === 'bajo'
        ? esBajo
        : estadoFiltroStock === 'ok'
        ? !esBajo
        : true;

    return coincideTexto && coincideCategoria && coincideEstado;
  });

  // --- Kardex: filtro por producto + saldo acumulado por producto ---
  const movimientosConSaldo = (() => {
    const base = productoFiltro
      ? movimientos.filter((m) => String(m.producto_id) === productoFiltro)
      : movimientos;

    const ascendente = [...base].sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    const saldosPorProducto = {};

    const conSaldo = ascendente.map((m) => {
      const actual = saldosPorProducto[m.producto_id] ?? 0;
      const delta =
        m.tipo === 'entrada'
          ? Math.abs(m.cantidad)
          : m.tipo === 'salida'
          ? -Math.abs(m.cantidad)
          : m.cantidad;
      const nuevo = actual + delta;
      saldosPorProducto[m.producto_id] = nuevo;
      return { ...m, saldo: nuevo };
    });

    return conSaldo.reverse();
  })();

  const exportarKardexExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const hoja = workbook.addWorksheet('Kardex');

    const nombreProd = productos.find((p) => String(p.id) === productoFiltro)?.nombre;
    const titulo = `Kardex — ${nombreProd || 'Todos los productos'}`;

    hoja.mergeCells('A1:G1');
    const celdaTitulo = hoja.getCell('A1');
    celdaTitulo.value = titulo;
    celdaTitulo.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
    celdaTitulo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
    celdaTitulo.alignment = { vertical: 'middle', horizontal: 'left' };
    hoja.getRow(1).height = 26;

    hoja.mergeCells('A2:G2');
    const celdaSubtitulo = hoja.getCell('A2');
    celdaSubtitulo.value = `Generado el ${new Date().toLocaleString('es-PE')} — Acabados J&S`;
    celdaSubtitulo.font = { italic: true, size: 10, color: { argb: 'FF64748B' } };

    hoja.columns = [
      { key: 'fecha', width: 20 },
      { key: 'producto', width: 32 },
      { key: 'tipo', width: 12 },
      { key: 'cantidad', width: 12 },
      { key: 'saldo', width: 12 },
      { key: 'usuario', width: 20 }, // <-- Columna Usuario añadida al Excel
      { key: 'motivo', width: 42 },
    ];

    const filaEncabezado = hoja.getRow(4);
    filaEncabezado.values = ['Fecha', 'Producto', 'Tipo', 'Cantidad', 'Saldo', 'Usuario', 'Motivo'];
    filaEncabezado.eachCell((celda) => {
      celda.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
      celda.alignment = { vertical: 'middle', horizontal: 'center' };
    });
    hoja.views = [{ state: 'frozen', ySplit: 4 }];
    hoja.autoFilter = 'A4:G4';

    movimientosConSaldo.forEach((m) => {
      const prod = productos.find((p) => p.id === m.producto_id);
      const fila = hoja.addRow({
        fecha: new Date(m.fecha).toLocaleString('es-PE'),
        producto: prod ? prod.nombre : `#${m.producto_id}`,
        tipo: m.tipo,
        cantidad: m.cantidad,
        saldo: m.saldo,
        usuario: m.usuario_nombre || 'Sistema', // <-- Dato de usuario
        motivo: m.detalle || m.motivo || '-',   // <-- Ajustado para leer el detalle
      });

      const colorFondo = m.tipo === 'entrada' ? 'FFDCFCE7' : m.tipo === 'salida' ? 'FFFEE2E2' : 'FFFEF3C7';
      const colorTexto = m.tipo === 'entrada' ? 'FF166534' : m.tipo === 'salida' ? 'FFB91C1C' : 'FF92400E';

      const celdaTipo = fila.getCell(3);
      celdaTipo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colorFondo } };
      celdaTipo.font = { bold: true, color: { argb: colorTexto } };
      celdaTipo.alignment = { horizontal: 'center' };

      fila.getCell(4).alignment = { horizontal: 'center' };
      fila.getCell(5).alignment = { horizontal: 'center' };
      fila.getCell(5).font = { bold: true };

      fila.eachCell((celda) => {
        celda.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kardex${nombreProd ? '-' + nombreProd.replace(/\s+/g, '-') : ''}-${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', minHeight: '400px' }}>
        <h3 style={{ fontFamily: 'sans-serif', color: '#f97316' }}>Cargando Vista de Almacén...</h3>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: '24px', fontFamily: 'sans-serif' }}>
      
      {/* HEADER PRINCIPAL */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '700', color: '#1e293b' }}>Inventario / Almacén</h1>
          <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: '#64748b' }}>Almacén principal — San Juan de Lurigancho</p>
        </div>
        <button
          onClick={abrirModal}
          style={{ backgroundColor: '#1e3a8a', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: '6px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px' }}
        >
          <Plus size={16} /> Registrar movimiento
        </button>
      </div>

      {error && (
        <div style={{ backgroundColor: '#fef2f2', color: '#b91c1c', padding: '10px 16px', borderRadius: '8px', fontSize: '13px' }}>
          {error}
        </div>
      )}

      {/* PESTAÑAS (TABS) */}
      <div style={{ display: 'flex', gap: '8px', background: '#e2e8f0', padding: '4px', borderRadius: '8px', width: 'fit-content' }}>
        <button
          onClick={() => setActiveTab('stock')}
          style={{
            border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: '600',
            backgroundColor: activeTab === 'stock' ? '#fff' : 'transparent',
            color: activeTab === 'stock' ? '#1e293b' : '#64748b',
            boxShadow: activeTab === 'stock' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            transition: 'all 0.2s',
          }}
        >
          Stock Por Producto
        </button>
        <button
          onClick={() => setActiveTab('historial')}
          style={{
            border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: '600',
            backgroundColor: activeTab === 'historial' ? '#fff' : 'transparent',
            color: activeTab === 'historial' ? '#1e293b' : '#64748b',
            boxShadow: activeTab === 'historial' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            transition: 'all 0.2s',
          }}
        >
          Historial De Movimientos
        </button>
        <button
          onClick={() => setActiveTab('prediccion')}
          style={{
            border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: '600',
            backgroundColor: activeTab === 'prediccion' ? '#fff' : 'transparent',
            color: activeTab === 'prediccion' ? '#1e293b' : '#64748b',
            boxShadow: activeTab === 'prediccion' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            transition: 'all 0.2s',
            display: 'flex', alignItems: 'center', gap: '6px',
          }}
        >
          <TrendingDown size={14} /> Predicción De Quiebre
        </button>
      </div>

      {/* CONTENIDO DE LAS PESTAÑAS */}
      {activeTab === 'prediccion' ? (
        <div style={{ ...styles.tableCard, width: '100%', marginTop: 0 }}>
          {cargandoPrediccion || !prediccion ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontSize: '14px' }}>Calculando velocidad de venta...</div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: '16px', padding: '16px 20px', borderBottom: '1px solid #f1f5f9', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#64748b' }}>
                  <Clock size={14} /> Analizado sobre los últimos {prediccion.dias_analisis} días
                </div>
                <span style={{ backgroundColor: '#fef2f2', color: '#dc2626', padding: '3px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '700' }}>
                  {prediccion.criticos} crítico(s) (&le; 7 días)
                </span>
                <span style={{ backgroundColor: '#fff7ed', color: '#d97706', padding: '3px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '700' }}>
                  {prediccion.en_alerta} en alerta (&le; 15 días)
                </span>
              </div>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Producto</th>
                    <th style={styles.th}>Categoría</th>
                    <th style={styles.th}>Stock actual</th>
                    <th style={styles.th}>Vendidas (periodo)</th>
                    <th style={styles.th}>Ritmo diario</th>
                    <th style={styles.th}>Días restantes</th>
                  </tr>
                </thead>
                <tbody>
                  {prediccion.items.length === 0 ? (
                    <tr>
                      <td colSpan="6" style={{ ...styles.td, textAlign: 'center', color: '#64748b' }}>Todavía no hay ventas registradas para proyectar.</td>
                    </tr>
                  ) : (
                    prediccion.items.map((it) => {
                      const colorEstado = it.estado === 'critico' ? '#dc2626' : it.estado === 'alerta' ? '#d97706' : '#16a34a';
                      const bgEstado = it.estado === 'critico' ? '#fef2f2' : it.estado === 'alerta' ? '#fff7ed' : '#f0fdf4';
                      return (
                        <tr key={it.producto_id}>
                          <td style={styles.td}><strong>{it.nombre}</strong></td>
                          <td style={styles.td}>{it.categoria || '-'}</td>
                          <td style={styles.td}>{it.stock}</td>
                          <td style={styles.td}>{it.unidades_vendidas_periodo}</td>
                          <td style={styles.td}>{it.velocidad_diaria > 0 ? `${it.velocidad_diaria}/día` : '-'}</td>
                          <td style={styles.td}>
                            <span style={{ backgroundColor: bgEstado, color: colorEstado, padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '700' }}>
                              {it.dias_restantes !== null ? `~${it.dias_restantes} días` : (it.estado === 'alerta' ? 'Bajo mínimo' : 'Sin proyección')}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </>
          )}
        </div>
      ) : activeTab === 'stock' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>

          {/* BARRA DE FILTROS Y BÚSQUEDA */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', backgroundColor: '#fff', padding: '12px 16px', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
            <div style={{ position: 'relative', flex: '1 1 240px' }}>
              <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type="text"
                placeholder="Buscar por nombre o marca..."
                value={busquedaStock}
                onChange={(e) => setBusquedaStock(e.target.value)}
                style={{
                  padding: '8px 12px 8px 34px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13px',
                  width: '100%',
                  boxSizing: 'border-box',
                  outline: 'none',
                }}
              />
            </div>

            <select
              value={categoriaFiltroStock}
              onChange={(e) => setCategoriaFiltroStock(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontSize: '13px',
                minWidth: '170px',
                backgroundColor: '#fff',
                outline: 'none',
              }}
            >
              <option value="">Todas las categorías</option>
              {categorias.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.nombre}
                </option>
              ))}
            </select>

            <select
              value={estadoFiltroStock}
              onChange={(e) => setEstadoFiltroStock(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontSize: '13px',
                minWidth: '150px',
                backgroundColor: '#fff',
                outline: 'none',
              }}
            >
              <option value="">Todos los estados</option>
              <option value="bajo">⚠️ Stock bajo</option>
              <option value="ok">✅ En stock</option>
            </select>

            {(busquedaStock || categoriaFiltroStock || estadoFiltroStock) && (
              <button
                onClick={() => {
                  setBusquedaStock('');
                  setCategoriaFiltroStock('');
                  setEstadoFiltroStock('');
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#dc2626',
                  fontSize: '12px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  padding: '7px 12px',
                  borderRadius: '6px',
                }}
              >
                <X size={14} /> Limpiar
              </button>
            )}
          </div>

          {/* TARJETAS DE PRODUCTOS FILTRADOS */}
          {productosFiltrados.length === 0 ? (
            <div style={{ padding: '36px', textAlign: 'center', backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', color: '#64748b' }}>
              No se encontraron productos que coincidan con los filtros aplicados.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '20px', width: '100%' }}>
              {productosFiltrados.map((prod) => {
                const minStock = prod.stock_minimo || 10;
                const esBajo = prod.stock <= minStock;
                const maxEstimado = Math.max(prod.stock, minStock * 2);
                const porcentajeBarra = Math.min((prod.stock / maxEstimado) * 100, 100);
                const estadoColor = esBajo ? '#f97316' : '#22c55e';
                const estadoBg = esBajo ? '#fff7ed' : '#f0fdf4';
                const estadoTexto = esBajo ? 'Stock bajo' : 'En stock';

                return (
                  <div key={prod.id} style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', flexGrow: 1 }}>
                      {/* Imagen grande, ocupa todo el lado izquierdo */}
                      <div style={{ width: '110px', minWidth: '110px', alignSelf: 'stretch', backgroundColor: '#f1f5f9' }}>
                        {prod.imagen_url ? (
                          <img
                            src={imagenUrl(prod)}
                            alt={prod.nombre}
                            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                          />
                        ) : (
                          <div style={{ width: '100%', height: '100%', minHeight: '110px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px', color: '#cbd5e1' }}>
                            <ImageOff size={26} />
                            <span style={{ fontSize: '10px', fontWeight: 600 }}>Sin imagen</span>
                          </div>
                        )}
                      </div>

                      {/* Datos del producto */}
                      <div style={{ padding: '16px', flexGrow: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '700', color: '#1e293b', lineHeight: '1.4' }}>{prod.nombre}</h3>
                          <span style={{ backgroundColor: estadoBg, color: estadoColor, padding: '4px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap' }}>
                            {estadoTexto}
                          </span>
                        </div>
                        <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#94a3b8', fontWeight: '500' }}>
                          {prod.marca?.nombre || 'Sin marca'} · {nombreCategoria(prod.categoria_id)}
                        </p>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '20px' }}>
                          <span style={{ fontSize: '32px', fontWeight: '700', color: estadoColor, lineHeight: '1' }}>
                            {prod.stock}
                          </span>
                          <span style={{ fontSize: '12px', color: '#64748b', textAlign: 'right' }}>
                            {prod.unidad || 'cajas'} · mín. {minStock}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div style={{ width: '100%', height: '6px', backgroundColor: '#f1f5f9' }}>
                      <div style={{ width: `${porcentajeBarra}%`, height: '100%', backgroundColor: estadoColor, borderRadius: '0 4px 4px 0', transition: 'width 0.4s ease-out' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* PESTAÑA HISTORIAL / KARDEX */
        <div style={{ ...styles.tableCard, width: '100%', marginTop: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', flexWrap: 'wrap', gap: '10px' }}>
            <select
              value={productoFiltro}
              onChange={(e) => setProductoFiltro(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px', minWidth: '220px' }}
            >
              <option value="">Todos los productos</option>
              {productos.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
            <button
              onClick={exportarKardexExcel}
              disabled={movimientosConSaldo.length === 0}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#1e3a8a', color: '#fff', border: 'none', padding: '9px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', opacity: movimientosConSaldo.length === 0 ? 0.5 : 1 }}
            >
              <Download size={14} /> Exportar Excel
            </button>
          </div>

          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Fecha</th>
                <th style={styles.th}>Producto</th>
                <th style={styles.th}>Tipo</th>
                <th style={styles.th}>Cantidad</th>
                <th style={styles.th}>Saldo</th>
                <th style={styles.th}>Usuario</th> {/* <-- Agregado */}
                <th style={styles.th}>Motivo</th>
              </tr>
            </thead>
            <tbody>
              {movimientosConSaldo.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ ...styles.td, textAlign: 'center', color: '#64748b' }}>
                    {productoFiltro ? 'Este producto no tiene movimientos registrados.' : 'Aún no hay movimientos registrados.'}
                  </td>
                </tr>
              ) : (
                movimientosConSaldo.map((mov) => {
                  const prod = productos.find((p) => p.id === mov.producto_id);
                  const bgTipo = mov.tipo === 'entrada' ? '#f0fdf4' : mov.tipo === 'salida' ? '#fef2f2' : '#fef3c7';
                  const colorTipo = mov.tipo === 'entrada' ? '#16a34a' : mov.tipo === 'salida' ? '#dc2626' : '#d97706';

                  return (
                    <tr key={mov.id}>
                      <td style={styles.td}>{new Date(mov.fecha).toLocaleString('es-PE')}</td>
                      <td style={styles.td}><strong>{prod ? prod.nombre : `#${mov.producto_id}`}</strong></td>
                      <td style={styles.td}>
                        <span style={{
                          backgroundColor: bgTipo,
                          color: colorTipo,
                          padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '600', textTransform: 'capitalize',
                        }}>
                          {mov.tipo}
                        </span>
                      </td>
                      <td style={styles.td}>{mov.cantidad}</td>
                      <td style={styles.td}><strong>{mov.saldo}</strong></td>
                      
                      {/* --- NUEVAS CELDAS --- */}
                      <td style={styles.td}>{mov.usuario_nombre || 'Sistema'}</td>
                      <td style={styles.td}>{mov.detalle || mov.motivo || '-'}</td> 

                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* MODAL REGISTRAR MOVIMIENTO */}
      {modalAbierto && (
        <Modal title="Registrar movimiento de inventario" onClose={() => setModalAbierto(false)}>
          <form onSubmit={handleGuardar}>
            {formError && (
              <div style={{ backgroundColor: '#fef2f2', color: '#b91c1c', padding: '8px 12px', borderRadius: '6px', fontSize: '13px', marginBottom: '8px' }}>
                {formError}
              </div>
            )}

            <label style={labelStyle}>Producto</label>
            <select required style={inputStyle} value={form.producto_id} onChange={(e) => setForm({ ...form, producto_id: e.target.value })}>
              <option value="">Selecciona un producto</option>
              {productos.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre} (stock actual: {p.stock})</option>
              ))}
            </select>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={labelStyle}>Tipo de movimiento</label>
                <select style={inputStyle} value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
                  <option value="entrada">Entrada</option>
                  <option value="salida">Salida</option>
                  <option value="ajuste">Ajuste</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Cantidad</label>
                <input 
                  required 
                  type="number" 
                  step="any" 
                  min={form.tipo === 'ajuste' ? undefined : "1"} 
                  style={inputStyle} 
                  value={form.cantidad} 
                  onChange={(e) => setForm({ ...form, cantidad: e.target.value })} 
                />
              </div>
            </div>

            <label style={labelStyle}>Motivo (opcional)</label>
            <input style={inputStyle} placeholder="Ej. compra a proveedor, merma, conteo físico..." value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '22px' }}>
              <button type="button" style={secondaryButtonStyle} onClick={() => setModalAbierto(false)}>Cancelar</button>
              <button type="submit" disabled={guardando} style={{ ...primaryButtonStyle, opacity: guardando ? 0.7 : 1 }}>
                {guardando ? 'Guardando...' : 'Registrar movimiento'}
              </button>
            </div>
          </form>
        </Modal>
      )}

    </div>
  );
};

export default Inventario;