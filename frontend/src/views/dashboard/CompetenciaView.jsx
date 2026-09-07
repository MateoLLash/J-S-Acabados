import React, { useState, useEffect } from 'react';
import { competenciaService } from '../../services/competenciaService';
import { Search, RefreshCw, ExternalLink, Link2, Trash2, CheckCircle2 } from 'lucide-react';
import { apiFetch } from '../../utils/api'; // Para obtener tus productos internos

export default function CompetenciaView() {
  const [tabActiva, setTabActiva] = useState('comparativa');
  const [productosCompetencia, setProductosCompetencia] = useState([]);
  const [comparativa, setComparativa] = useState([]);
  const [competidores, setCompetidores] = useState([]);
  const [productosInternos, setProductosInternos] = useState([]);
  
  const [busqueda, setBusqueda] = useState('');
  const [loading, setLoading] = useState(false);
  const [mensajeScraper, setMensajeScraper] = useState(null);

  // Estados para el Modal de Vinculación
  const [modalAbierto, setModalAbierto] = useState(false);
  const [productoSeleccionado, setProductoSeleccionado] = useState(null);
  const [busquedaInterna, setBusquedaInterna] = useState('');

  useEffect(() => {
    cargarDatosGenerales();
  }, [tabActiva]);

  const cargarDatosGenerales = async () => {
    setLoading(true);
    try {
      const comps = await competenciaService.listarCompetidores();
      setCompetidores(comps);

      if (tabActiva === 'catalogo') {
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

  const abrirModalMatch = async (prodCompetencia) => {
    setProductoSeleccionado(prodCompetencia);
    try {
      // Cargamos tus productos internos para seleccionarlos en el modal
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

  const dispararScraper = async (competidorId) => {
    setMensajeScraper("Ejecutando scraper, esto puede tomar unos segundos...");
    try {
      const res = await competenciaService.ejecutarScraper(competidorId);
      setMensajeScraper(`¡Scraping exitoso! Nuevos: ${res.resumen.nuevos}, Actualizados: ${res.resumen.actualizados}`);
      cargarDatosGenerales();
    } catch (error) {
      setMensajeScraper("Error al ejecutar el scraper.");
      console.error(error);
    }
  };

  // Filtrar productos internos en el modal según búsqueda
  const productosInternosFiltrados = productosInternos.filter(p => 
    p.nombre.toLowerCase().includes(busquedaInterna.toLowerCase())
  );

  return (
    <div style={{ padding: '30px', maxWidth: '1400px', margin: '0 auto', fontFamily: 'Inter, sans-serif', backgroundColor: '#f8fafc', minHeight: '100vh' }}>
      
      {/* CABECERA */}
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

      {/* PESTAÑAS */}
      <div style={{ display: 'flex', gap: '12px', borderBottom: '2px solid #e2e8f0', marginBottom: '24px' }}>
        {[
          { key: 'comparativa', label: '📊 Comparativa de Precios' },
          { key: 'catalogo', label: '🛒 Catálogo Scrapeado' },
          { key: 'scraper', label: '⚙️ Control de Scraper' }
        ].map((tab) => (
          <button
            key={tab.key}
            style={{
              padding: '12px 20px',
              fontWeight: '600',
              fontSize: '0.95rem',
              cursor: 'pointer',
              background: 'none',
              border: 'none',
              borderBottom: tabActiva === tab.key ? '3px solid #2563eb' : '3px solid transparent',
              color: tabActiva === tab.key ? '#2563eb' : '#64748b',
              marginBottom: '-2px',
              transition: 'all 0.2s'
            }}
            onClick={() => setTabActiva(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading && <p style={{ color: '#2563eb', fontWeight: '600', textAlign: 'center', padding: '20px' }}>Cargando información...</p>}

      {/* VISTA 1: COMPARATIVA DE PRECIOS */}
      {tabActiva === 'comparativa' && !loading && (
        <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', color: '#334155', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <th style={{ padding: '16px' }}>Tu Producto</th>
                <th style={{ padding: '16px' }}>Tu Precio</th>
                <th style={{ padding: '16px' }}>Producto Competencia</th>
                <th style={{ padding: '16px' }}>Precio Competencia</th>
                <th style={{ padding: '16px' }}>Diferencia</th>
                <th style={{ padding: '16px' }}>Estado de Mercado</th>
              </tr>
            </thead>
            <tbody>
              {comparativa.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ padding: '50px', textAlign: 'center', color: '#94a3b8' }}>
                    <p style={{ fontSize: '1rem', fontWeight: '500' }}>No hay productos emparejados aún.</p>
                    <p style={{ fontSize: '0.85rem', marginTop: '4px' }}>Ve a <b>"Catálogo Scrapeado"</b> y vincula tus productos con los de la competencia para ver el análisis aquí.</p>
                  </td>
                </tr>
              ) : (
                comparativa.map((item, index) => (
                  <tr key={index} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.1s' }} onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}>
                    <td style={{ padding: '16px', fontSize: '0.95rem', fontWeight: '600', color: '#0f172a' }}>{item.producto_mio}</td>
                    <td style={{ padding: '16px', fontSize: '0.95rem', fontWeight: '600', color: '#334155' }}>S/ {item.precio_mio.toFixed(2)}</td>
                    <td style={{ padding: '16px', fontSize: '0.9rem' }}>
                      <a href={item.competidor_url} target="_blank" rel="noreferrer" style={{ color: '#2563eb', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {item.producto_competencia} <ExternalLink size={14} />
                      </a>
                    </td>
                    <td style={{ padding: '16px', fontSize: '0.95rem', fontWeight: '600', color: '#334155' }}>S/ {item.precio_competencia.toFixed(2)}</td>
                    <td style={{ padding: '16px', fontSize: '0.95rem', fontWeight: '700', color: item.diferencia_moneda > 0 ? '#dc2626' : '#16a34a' }}>
  {item.diferencia_moneda > 0 
    ? `+S/ ${item.diferencia_moneda.toFixed(2)}` 
    : `-S/ ${Math.abs(item.diferencia_moneda).toFixed(2)}`}
  <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: '#64748b', marginLeft: '6px' }}>
    ({item.diferencia_porcentaje}%)
  </span>
</td>
                    <td style={{ padding: '16px' }}>
                      <span style={{
                        padding: '6px 12px',
                        borderRadius: '20px',
                        fontSize: '0.75rem',
                        fontWeight: '700',
                        backgroundColor: item.estado === 'Mas caro' ? '#fee2e2' : item.estado === 'Mas barato' ? '#dcfce7' : '#f1f5f9',
                        color: item.estado === 'Mas caro' ? '#991b1b' : item.estado === 'Mas barato' ? '#166534' : '#475569'
                      }}>
                        {item.estado === 'Mas caro' ? '🔴 Más caro que ellos' : item.estado === 'Mas barato' ? '🟢 Más barato' : '⚪ Iguales'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* VISTA 2: CATÁLOGO DE LA COMPETENCIA */}
      {tabActiva === 'catalogo' && !loading && (
        <div>
          <form onSubmit={handleBuscar} style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
            <div style={{ position: 'relative', width: '100%', maxWidth: '450px' }}>
              <Search size={18} style={{ position: 'absolute', left: '14px', top: '12px', color: '#94a3b8' }} />
              <input
                type="text"
                placeholder="Buscar producto en la competencia..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px 10px 42px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  outline: 'none',
                  fontSize: '0.95rem',
                  backgroundColor: '#fff'
                }}
              />
            </div>
            <button type="submit" style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', boxShadow: '0 2px 4px rgba(37,99,235,0.2)' }}>
              Buscar
            </button>
          </form>

          <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', color: '#334155', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <th style={{ padding: '16px' }}>Nombre Scrapeado</th>
                  <th style={{ padding: '16px' }}>Categoría</th>
                  <th style={{ padding: '16px' }}>Precio Actual</th>
                  <th style={{ padding: '16px' }}>Precio Original</th>
                  <th style={{ padding: '16px' }}>Última Actualización</th>
                  <th style={{ padding: '16px', textAlign: 'center' }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {productosCompetencia.map((prod) => (
                  <tr key={prod.id} style={{ borderBottom: '1px solid #f1f5f9' }} onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}>
                    <td style={{ padding: '16px', fontSize: '0.9rem', fontWeight: '500' }}>
                      <a href={prod.url_producto} target="_blank" rel="noreferrer" style={{ color: '#2563eb', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {prod.nombre_scrapeado} <ExternalLink size={12} />
                      </a>
                    </td>
                    <td style={{ padding: '16px', fontSize: '0.85rem', color: '#64748b' }}>{prod.categoria || 'Sin categoría'}</td>
                    <td style={{ padding: '16px', fontSize: '0.95rem', fontWeight: '700', color: '#0f172a' }}>S/ {Number(prod.precio).toFixed(2)}</td>
                    <td style={{ padding: '16px', fontSize: '0.85rem', color: '#94a3b8', textDecoration: 'line-through' }}>
                      {prod.precio_original ? `S/ ${Number(prod.precio_original).toFixed(2)}` : '-'}
                    </td>
                    <td style={{ padding: '16px', fontSize: '0.85rem', color: '#64748b' }}>{new Date(prod.ultima_actualizacion).toLocaleString()}</td>
                    <td style={{ padding: '16px', textAlign: 'center' }}>
                      <button
                        onClick={() => abrirModalMatch(prod)}
                        style={{
                          background: '#eff6ff',
                          color: '#2563eb',
                          border: '1px solid #bfdbfe',
                          padding: '6px 12px',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontWeight: '600',
                          fontSize: '0.8rem',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
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

      {/* VISTA 3: CONTROL MANUAL DEL SCRAPER */}
      {tabActiva === 'scraper' && (
        <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', padding: '30px', maxWidth: '700px', border: '1px solid #e2e8f0' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: '700', color: '#0f172a', marginBottom: '8px' }}>Control y Ejecución del Scraper</h2>
          <p style={{ fontSize: '0.9rem', color: '#64748b', marginBottom: '24px' }}>
            Fuerza la actualización de precios conectándote en tiempo real con las webs de la competencia.
          </p>

          {mensajeScraper && (
            <div style={{ padding: '14px', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af', borderRadius: '8px', fontSize: '0.9rem', marginBottom: '24px', fontWeight: '500' }}>
              {mensajeScraper}
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
                  style={{
                    background: '#16a34a',
                    color: '#fff',
                    border: 'none',
                    padding: '10px 16px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: '600',
                    fontSize: '0.85rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: '0 2px 4px rgba(22,163,74,0.2)'
                  }}
                >
                  <RefreshCw size={15} /> Ejecutar Scraper Ahora
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL DE VINCULACIÓN (MATCHING) */}
      {modalAbierto && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
          backgroundColor: 'rgba(0, 0, 0, 0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
        }}>
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
              style={{
                width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1',
                outline: 'none', fontSize: '0.9rem', marginBottom: '16px', boxSizing: 'border-box'
              }}
            />

            <div style={{ maxHeight: '250px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '20px' }}>
              {productosInternosFiltrados.length === 0 ? (
                <p style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>No se encontraron tus productos.</p>
              ) : (
                productosInternosFiltrados.map((prod) => (
                  <div
                    key={prod.id}
                    onClick={() => vincularProducto(prod.id)}
                    style={{
                      padding: '12px 16px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'background 0.1s'
                    }}
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

    </div>
  );
}