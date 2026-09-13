import React, { useState, useEffect, useMemo } from 'react';
import { competenciaService } from '../../services/competenciaService';
import {
  Search, RefreshCw, ExternalLink, Link2, Unlink, TrendingUp,
  TrendingDown, Minus, X, LineChart as LineChartIcon
} from 'lucide-react';
import { apiFetch } from '../../utils/api';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

export default function CompetenciaView() {
  const [tabActiva, setTabActiva] = useState('comparativa');
  const [productosCompetencia, setProductosCompetencia] = useState([]);
  const [comparativa, setComparativa] = useState([]);
  const [competidores, setCompetidores] = useState([]);
  const [productosInternos, setProductosInternos] = useState([]);

  const [busqueda, setBusqueda] = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState('');
  const [loading, setLoading] = useState(false);
  const [mensajeScraper, setMensajeScraper] = useState(null);

  const [filtroEstado, setFiltroEstado] = useState('todos');

  const [modalAbierto, setModalAbierto] = useState(false);
  const [productoSeleccionado, setProductoSeleccionado] = useState(null);
  const [busquedaInterna, setBusquedaInterna] = useState('');

  const [historicoAbierto, setHistoricoAbierto] = useState(false);
  const [historicoData, setHistoricoData] = useState([]);
  const [historicoNombre, setHistoricoNombre] = useState('');
  const [cargandoHistorico, setCargandoHistorico] = useState(false);

  useEffect(() => {
    cargarDatosGenerales();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabActiva]);

  const cargarDatosGenerales = async () => {
    setLoading(true);
    try {
      const comps = await competenciaService.listarCompetidores();
      setCompetidores(comps);

      if (tabActiva === 'catalogo') {
        // Nota: dejamos que el backend filtre solo por texto de búsqueda.
        // La categoría se filtra en el cliente (ver comparativaVisible más
        // abajo) porque `categoria` se guarda como varias categorías juntas
        // en un mismo string ("bano, ceramico, cocina, ...") y un filtro
        // exacto en el backend contra una sola pieza nunca hace match.
        const prods = await competenciaService.listarProductos('', busqueda);
        setProductosCompetencia(prods);
      } else if (tabActiva === 'comparativa') {
        const compData = await competenciaService.obtenerComparativa();
        setComparativa(compData);
      }
    } catch (error) {
      console.error("Error al cargar datos:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleBuscar = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const prods = await competenciaService.listarProductos('', busqueda);
      setProductosCompetencia(prods);
    } catch (error) {
      console.error("Error en búsqueda:", error);
    } finally {
      setLoading(false);
    }
  };

  // Categorías únicas presentes en lo cargado — separa strings compuestos
  // tipo "bano, ceramico, cocina" en piezas individuales para el <select>.
  const categoriasDisponibles = useMemo(() => {
    const set = new Set();
    productosCompetencia.forEach((p) => {
      if (p.categoria) {
        p.categoria.split(',').map((c) => c.trim()).filter(Boolean).forEach((c) => set.add(c));
      }
    });
    return Array.from(set).sort();
  }, [productosCompetencia]);

  // Filtro por categoría 100% en el cliente: comprueba que la categoría
  // elegida esté CONTENIDA dentro del string compuesto de cada producto,
  // en vez de exigir una igualdad exacta.
  const productosCompetenciaVisibles = useMemo(() => {
    if (!categoriaFiltro) return productosCompetencia;
    return productosCompetencia.filter((p) => {
      if (!p.categoria) return false;
      const piezas = p.categoria.split(',').map((c) => c.trim());
      return piezas.includes(categoriaFiltro);
    });
  }, [productosCompetencia, categoriaFiltro]);

  const abrirModalMatch = async (prodCompetencia) => {
    setProductoSeleccionado(prodCompetencia);
    try {
      const data = await apiFetch('/productos/');
      setProductosInternos(data);
      setModalAbierto(true);
    } catch (error) {
      console.error("Error al cargar productos internos:", error);
      alert("No se pudieron cargar tus productos internos.");
    }
  };

  const vincularProducto = async (productoInternoId) => {
    try {
      await competenciaService.crearMatch(productoInternoId, productoSeleccionado.id);
      setModalAbierto(false);
      setProductoSeleccionado(null);
      alert("¡Producto vinculado exitosamente!");
      if (tabActiva === 'comparativa') cargarDatosGenerales();
    } catch (error) {
      console.error("Error al crear match:", error);
      alert("Error al vincular el producto.");
    }
  };

  const desvincularProducto = async (matchId, nombreProducto) => {
    if (!window.confirm(`¿Desvincular "${nombreProducto}" de la comparativa?`)) return;
    try {
      await competenciaService.eliminarMatch(matchId);
      setComparativa((prev) => prev.filter((item) => item.match_id !== matchId));
    } catch (error) {
      console.error("Error al desvincular:", error);
      alert("Error al desvincular el producto.");
    }
  };

  const abrirHistorico = async (prodCompetencia) => {
    setHistoricoNombre(prodCompetencia.nombre_scrapeado || prodCompetencia.producto_competencia);
    setHistoricoAbierto(true);
    setCargandoHistorico(true);
    try {
      const idParaHistorico = prodCompetencia.id || prodCompetencia.producto_competidor_id;
      const data = await competenciaService.obtenerHistorico(idParaHistorico);
      const formateado = data.map((h) => ({
        fecha: new Date(h.fecha).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' }),
        precio: h.precio,
      }));
      setHistoricoData(formateado);
    } catch (error) {
      console.error("Error al cargar histórico:", error);
      setHistoricoData([]);
    } finally {
      setCargandoHistorico(false);
    }
  };

  const dispararScraper = async (competidorId) => {
    setMensajeScraper({ tipo: 'info', texto: 'Ejecutando scraper, esto puede tomar unos segundos...' });
    try {
      const res = await competenciaService.ejecutarScraper(competidorId);
      const resumen = res.resumen;

      if (resumen.error) {
        setMensajeScraper({
          tipo: 'error',
          texto: `No se pudo scrapear "${resumen.competidor}": ${resumen.error}`,
        });
        return;
      }

      setMensajeScraper({
        tipo: 'exito',
        texto: `¡Listo! ${resumen.competidor} — Nuevos: ${resumen.nuevos}, ` +
          `Actualizados: ${resumen.actualizados}, Sin cambio: ${resumen.sin_cambio} ` +
          `(${resumen.paginas_recorridas} página(s) revisadas).`,
      });
      cargarDatosGenerales();
    } catch (error) {
      setMensajeScraper({ tipo: 'error', texto: 'Error al ejecutar el scraper.' });
      console.error(error);
    }
  };

  const productosInternosFiltrados = productosInternos.filter((p) =>
    p.nombre.toLowerCase().includes(busquedaInterna.toLowerCase())
  );

  const kpis = useMemo(() => {
    const total = comparativa.length;
    const masCaros = comparativa.filter((i) => i.estado === 'Mas caro');
    const masBaratos = comparativa.filter((i) => i.estado === 'Mas barato');
    const iguales = total - masCaros.length - masBaratos.length;
    const sobreprecioTotal = masCaros.reduce((acc, i) => acc + i.diferencia_moneda, 0);
    return { total, masCaros: masCaros.length, masBaratos: masBaratos.length, iguales, sobreprecioTotal };
  }, [comparativa]);

  const comparativaVisible = useMemo(() => {
    let filtrada = comparativa;
    if (filtroEstado !== 'todos') {
      filtrada = filtrada.filter((i) => i.estado === filtroEstado);
    }
    return [...filtrada].sort((a, b) => b.diferencia_moneda - a.diferencia_moneda);
  }, [comparativa, filtroEstado]);

  const chipEstilo = (activo, colorFondo, colorTexto) => ({
    padding: '6px 14px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: '600',
    cursor: 'pointer', border: activo ? `1.5px solid ${colorTexto}` : '1.5px solid transparent',
    backgroundColor: colorFondo, color: colorTexto, transition: 'all 0.15s',
  });

  const estiloMensajeScraper = (tipo) => {
    if (tipo === 'error') return { background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b' };
    if (tipo === 'exito') return { background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534' };
    return { background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af' };
  };

  return (
    <div style={{ padding: '30px', maxWidth: '1400px', margin: '0 auto', fontFamily: 'Inter, sans-serif', backgroundColor: '#f8fafc', minHeight: '100vh' }}>

      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: '700', color: '#0f172a', margin: 0 }}>
            Monitoreo y Precios de la Competencia
          </h1>
          <p style={{ fontSize: '0.95rem', color: '#64748b', marginTop: '4px' }}>
            Analiza las fluctuaciones del mercado y mantén tus precios competitivos.
          </p>
        </div>
      </div>

      {tabActiva === 'comparativa' && !loading && comparativa.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '18px' }}>
            <p style={{ fontSize: '0.78rem', color: '#64748b', margin: 0, fontWeight: '600', textTransform: 'uppercase' }}>Emparejados</p>
            <p style={{ fontSize: '1.6rem', fontWeight: '700', color: '#0f172a', margin: '4px 0 0' }}>{kpis.total}</p>
          </div>
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '18px' }}>
            <p style={{ fontSize: '0.78rem', color: '#991b1b', margin: 0, fontWeight: '600', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <TrendingUp size={13} /> Más caros que ellos
            </p>
            <p style={{ fontSize: '1.6rem', fontWeight: '700', color: '#991b1b', margin: '4px 0 0' }}>{kpis.masCaros}</p>
          </div>
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '18px' }}>
            <p style={{ fontSize: '0.78rem', color: '#166534', margin: 0, fontWeight: '600', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <TrendingDown size={13} /> Más baratos
            </p>
            <p style={{ fontSize: '1.6rem', fontWeight: '700', color: '#166534', margin: '4px 0 0' }}>{kpis.masBaratos}</p>
          </div>
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '18px' }}>
            <p style={{ fontSize: '0.78rem', color: '#64748b', margin: 0, fontWeight: '600', textTransform: 'uppercase' }}>Sobreprecio acumulado</p>
            <p style={{ fontSize: '1.6rem', fontWeight: '700', color: '#0f172a', margin: '4px 0 0' }}>S/ {kpis.sobreprecioTotal.toFixed(2)}</p>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '12px', borderBottom: '2px solid #e2e8f0', marginBottom: '24px' }}>
        {[
          { key: 'comparativa', label: '📊 Comparativa de Precios' },
          { key: 'catalogo', label: '🛒 Catálogo Scrapeado' },
          { key: 'scraper', label: '⚙️ Control de Scraper' }
        ].map((tab) => (
          <button
            key={tab.key}
            style={{
              padding: '12px 20px', fontWeight: '600', fontSize: '0.95rem', cursor: 'pointer',
              background: 'none', border: 'none',
              borderBottom: tabActiva === tab.key ? '3px solid #2563eb' : '3px solid transparent',
              color: tabActiva === tab.key ? '#2563eb' : '#64748b',
              marginBottom: '-2px', transition: 'all 0.2s'
            }}
            onClick={() => setTabActiva(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading && <p style={{ color: '#2563eb', fontWeight: '600', textAlign: 'center', padding: '20px' }}>Cargando información...</p>}

      {tabActiva === 'comparativa' && !loading && (
        <div>
          {comparativa.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <div onClick={() => setFiltroEstado('todos')} style={chipEstilo(filtroEstado === 'todos', '#f1f5f9', '#334155')}>
                Todos ({kpis.total})
              </div>
              <div onClick={() => setFiltroEstado('Mas caro')} style={chipEstilo(filtroEstado === 'Mas caro', '#fee2e2', '#991b1b')}>
                🔴 Más caros ({kpis.masCaros})
              </div>
              <div onClick={() => setFiltroEstado('Mas barato')} style={chipEstilo(filtroEstado === 'Mas barato', '#dcfce7', '#166534')}>
                🟢 Más baratos ({kpis.masBaratos})
              </div>
              <div onClick={() => setFiltroEstado('Igual precio')} style={chipEstilo(filtroEstado === 'Igual precio', '#f1f5f9', '#475569')}>
                ⚪ Iguales ({kpis.iguales})
              </div>
            </div>
          )}

          <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
            <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: '900px', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', color: '#334155', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <th style={{ padding: '16px', whiteSpace: 'nowrap' }}>Tu Producto</th>
                  <th style={{ padding: '16px', whiteSpace: 'nowrap' }}>Tu Precio</th>
                  <th style={{ padding: '16px', whiteSpace: 'nowrap' }}>Producto Competencia</th>
                  <th style={{ padding: '16px', whiteSpace: 'nowrap' }}>Precio Competencia</th>
                  <th style={{ padding: '16px', whiteSpace: 'nowrap' }}>Diferencia</th>
                  <th style={{ padding: '16px', whiteSpace: 'nowrap' }}>Estado de Mercado</th>
                  <th style={{ padding: '16px', textAlign: 'center', whiteSpace: 'nowrap' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {comparativaVisible.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ padding: '50px', textAlign: 'center', color: '#94a3b8' }}>
                      <p style={{ fontSize: '1rem', fontWeight: '500' }}>
                        {comparativa.length === 0 ? 'No hay productos emparejados aún.' : 'Nada coincide con este filtro.'}
                      </p>
                      {comparativa.length === 0 && (
                        <p style={{ fontSize: '0.85rem', marginTop: '4px' }}>
                          Ve a <b>"Catálogo Scrapeado"</b> y vincula tus productos con los de la competencia para ver el análisis aquí.
                        </p>
                      )}
                    </td>
                  </tr>
                ) : (
                  comparativaVisible.map((item, index) => (
                    <tr key={index} style={{ borderBottom: '1px solid #f1f5f9' }} onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}>
                      <td style={{ padding: '16px', fontSize: '0.95rem', fontWeight: '600', color: '#0f172a' }}>{item.producto_mio}</td>
                      <td style={{ padding: '16px', fontSize: '0.95rem', fontWeight: '600', color: '#334155', whiteSpace: 'nowrap' }}>S/ {item.precio_mio.toFixed(2)}</td>
                      <td style={{ padding: '16px', fontSize: '0.9rem', maxWidth: '260px' }}>
                        <button
                          onClick={() => abrirHistorico(item)}
                          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#2563eb', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', textAlign: 'left' }}
                          title="Ver histórico de precio"
                        >
                          <LineChartIcon size={13} style={{ flexShrink: 0 }} /> <span>{item.producto_competencia}</span>
                        </button>
                        <a href={item.competidor_url} target="_blank" rel="noreferrer" style={{ color: '#94a3b8', fontSize: '0.75rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '3px', marginTop: '2px', whiteSpace: 'nowrap' }}>
                          ver en su web <ExternalLink size={10} />
                        </a>
                      </td>
                      <td style={{ padding: '16px', fontSize: '0.95rem', fontWeight: '600', color: '#334155', whiteSpace: 'nowrap' }}>S/ {item.precio_competencia.toFixed(2)}</td>
                      <td style={{ padding: '16px', fontSize: '0.95rem', fontWeight: '700', color: item.diferencia_moneda > 0 ? '#dc2626' : '#16a34a', whiteSpace: 'nowrap' }}>
                        {item.diferencia_moneda > 0
                          ? `+S/ ${item.diferencia_moneda.toFixed(2)}`
                          : `-S/ ${Math.abs(item.diferencia_moneda).toFixed(2)}`}
                        <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: '#64748b', marginLeft: '6px' }}>
                          ({item.diferencia_porcentaje}%)
                        </span>
                      </td>
                      <td style={{ padding: '16px', whiteSpace: 'nowrap' }}>
                        <span style={{
                          padding: '6px 12px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: '700', whiteSpace: 'nowrap', display: 'inline-block',
                          backgroundColor: item.estado === 'Mas caro' ? '#fee2e2' : item.estado === 'Mas barato' ? '#dcfce7' : '#f1f5f9',
                          color: item.estado === 'Mas caro' ? '#991b1b' : item.estado === 'Mas barato' ? '#166534' : '#475569'
                        }}>
                          {item.estado === 'Mas caro' ? '🔴 Más caro que ellos' : item.estado === 'Mas barato' ? '🟢 Más barato' : '⚪ Iguales'}
                        </span>
                      </td>
                      <td style={{ padding: '16px', textAlign: 'center' }}>
                        <button
                          onClick={() => desvincularProducto(item.match_id, item.producto_mio)}
                          title="Desvincular"
                          style={{
                            background: '#fff', color: '#94a3b8', border: '1px solid #e2e8f0', padding: '6px 10px',
                            borderRadius: '6px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: '600'
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = '#dc2626'; e.currentTarget.style.borderColor = '#fecaca'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
                        >
                          <Unlink size={13} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      )}

      {tabActiva === 'catalogo' && !loading && (
        <div>
          <form onSubmit={handleBuscar} style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', width: '100%', maxWidth: '450px' }}>
              <Search size={18} style={{ position: 'absolute', left: '14px', top: '12px', color: '#94a3b8' }} />
              <input
                type="text"
                placeholder="Buscar producto en la competencia..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                style={{ width: '100%', padding: '10px 14px 10px 42px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.95rem', backgroundColor: '#fff', boxSizing: 'border-box' }}
              />
            </div>

            <select
              value={categoriaFiltro}
              onChange={(e) => setCategoriaFiltro(e.target.value)}
              style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.9rem', backgroundColor: '#fff', color: '#334155', minWidth: '220px' }}
            >
              <option value="">Todas las categorías ({productosCompetencia.length})</option>
              {categoriasDisponibles.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>

            <button type="submit" style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', boxShadow: '0 2px 4px rgba(37,99,235,0.2)' }}>
              Buscar
            </button>
          </form>

          {categoriaFiltro && (
            <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '-12px', marginBottom: '16px' }}>
              Mostrando {productosCompetenciaVisibles.length} de {productosCompetencia.length} productos en <b>"{categoriaFiltro}"</b>.{' '}
              <button onClick={() => setCategoriaFiltro('')} style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', padding: 0, fontSize: '0.85rem', textDecoration: 'underline' }}>
                Quitar filtro
              </button>
            </p>
          )}

          <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', color: '#334155', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <th style={{ padding: '16px' }}>Nombre Scrapeado</th>
                  <th style={{ padding: '16px' }}>Competencia</th>
                  <th style={{ padding: '16px' }}>Categoría</th>
                  <th style={{ padding: '16px' }}>Precio Actual</th>
                  <th style={{ padding: '16px' }}>Precio Original</th>
                  <th style={{ padding: '16px' }}>Última Actualización</th>
                  <th style={{ padding: '16px', textAlign: 'center' }}>Acción</th>
                </tr>
              </thead>
              <tbody>
  {productosCompetenciaVisibles.map((prod) => (
    <tr key={prod.id} style={{ borderBottom: '1px solid #f1f5f9' }} onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}>
      <td style={{ padding: '16px', fontSize: '0.9rem', fontWeight: '500' }}>
        <button
          onClick={() => abrirHistorico(prod)}
          title="Ver histórico de precio"
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', textAlign: 'left', fontWeight: '500' }}
        >
          <LineChartIcon size={13} color="#94a3b8" /> {prod.nombre_scrapeado}
        </button>
        <a href={prod.url_producto} target="_blank" rel="noreferrer" style={{ color: '#2563eb', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', marginTop: '2px' }}>
          ver en su web <ExternalLink size={10} />
        </a>
      </td>
      <td style={{ padding: '16px' }}>
        <span style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: '600', backgroundColor: '#eef2ff', color: '#4338ca', whiteSpace: 'nowrap' }}>
          {prod.competidor_nombre || 'Sin identificar'}
        </span>
      </td>
      <td style={{ padding: '16px', fontSize: '0.85rem', color: '#64748b' }}>{prod.categoria || 'Sin categoría'}</td>
      <td style={{ padding: '16px', fontSize: '0.95rem', fontWeight: '700', color: '#0f172a' }}>S/ {Number(prod.precio).toFixed(2)}</td>
      <td style={{ padding: '16px', fontSize: '0.85rem', color: '#94a3b8', textDecoration: 'line-through' }}>
        {prod.precio_original ? `S/ ${Number(prod.precio_original).toFixed(2)}` : '-'}
      </td>
      <td style={{ padding: '16px', fontSize: '0.85rem', color: '#64748b' }}>{new Date(prod.ultima_actualizacion).toLocaleString('es-PE')}</td>
      <td style={{ padding: '16px', textAlign: 'center' }}>
        <button
          onClick={() => abrirModalMatch(prod)}
          style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <Link2 size={14} /> Vincular a mi producto
        </button>
      </td>
    </tr>
  ))}
</tbody>
            </table>
          </div>
        </div>
      )}

      {tabActiva === 'scraper' && (
        <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', padding: '30px', maxWidth: '700px', border: '1px solid #e2e8f0' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: '700', color: '#0f172a', marginBottom: '8px' }}>Control y Ejecución del Scraper</h2>
          <p style={{ fontSize: '0.9rem', color: '#64748b', marginBottom: '24px' }}>
            Fuerza la actualización de precios conectándote en tiempo real con las webs de la competencia.
          </p>

          {mensajeScraper && (
            <div style={{ padding: '14px', borderRadius: '8px', fontSize: '0.9rem', marginBottom: '24px', fontWeight: '500', ...estiloMensajeScraper(mensajeScraper.tipo) }}>
              {mensajeScraper.texto}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {competidores.map((comp) => (
              <div key={comp.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '16px' }}>
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: '600', color: '#1e293b', margin: 0 }}>{comp.nombre}</h3>
                  <a href={comp.url_base} target="_blank" rel="noreferrer" style={{ fontSize: '0.8rem', color: '#2563eb', textDecoration: 'none' }}>
                    {comp.url_base}
                  </a>
                </div>
                <button
                  onClick={() => dispararScraper(comp.id)}
                  style={{ background: '#16a34a', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 2px 4px rgba(22,163,74,0.2)' }}
                >
                  <RefreshCw size={15} /> Ejecutar Scraper Ahora
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {modalAbierto && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0, 0, 0, 0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', padding: '30px', borderRadius: '12px', width: '600px', maxWidth: '90%', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: '700', color: '#0f172a', marginBottom: '8px' }}>Vincular Producto Externo</h3>
            <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '16px' }}>
              Competencia: <b>{productoSeleccionado?.nombre_scrapeado}</b> (S/ {Number(productoSeleccionado?.precio || 0).toFixed(2)})
            </p>
            <input
              type="text"
              placeholder="Busca tu producto interno por nombre..."
              value={busquedaInterna}
              onChange={(e) => setBusquedaInterna(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.9rem', marginBottom: '16px', boxSizing: 'border-box' }}
            />
            <div style={{ maxHeight: '250px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '20px' }}>
              {productosInternosFiltrados.length === 0 ? (
                <p style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>No se encontraron tus productos.</p>
              ) : (
                productosInternosFiltrados.map((prod) => (
                  <div
                    key={prod.id}
                    onClick={() => vincularProducto(prod.id)}
                    style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'background 0.1s' }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                    onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
                  >
                    <div>
                      <span style={{ fontWeight: '600', fontSize: '0.9rem', color: '#1e293b', display: 'block' }}>{prod.nombre}</span>
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Stock: {prod.stock} | Categoría ID: {prod.categoria_id || 'N/A'}</span>
                    </div>
                    <button style={{ background: '#dcfce7', color: '#166534', border: 'none', padding: '6px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer' }}>
                      Seleccionar
                    </button>
                  </div>
                ))
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setModalAbierto(false)}
                style={{ background: '#e2e8f0', color: '#334155', border: 'none', padding: '10px 18px', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '0.85rem' }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {historicoAbierto && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0, 0, 0, 0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', padding: '28px', borderRadius: '12px', width: '560px', maxWidth: '90%', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#0f172a', margin: 0 }}>Histórico de precio</h3>
                <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '4px 0 0' }}>{historicoNombre}</p>
              </div>
              <button onClick={() => setHistoricoAbierto(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                <X size={20} />
              </button>
            </div>

            {cargandoHistorico ? (
              <p style={{ textAlign: 'center', color: '#64748b', padding: '40px 0' }}>Cargando...</p>
            ) : historicoData.length <= 1 ? (
              <p style={{ textAlign: 'center', color: '#94a3b8', padding: '40px 0', fontSize: '0.9rem' }}>
                Todavía no hay suficiente histórico — necesita al menos 2 corridas del scraper con cambio de precio para graficar una tendencia.
              </p>
            ) : (
              <div style={{ width: '100%', height: 260 }}>
                <ResponsiveContainer>
                  <LineChart data={historicoData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="fecha" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                    <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" domain={['auto', 'auto']} />
                    <Tooltip formatter={(value) => [`S/ ${Number(value).toFixed(2)}`, 'Precio']} />
                    <Line type="monotone" dataKey="precio" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}