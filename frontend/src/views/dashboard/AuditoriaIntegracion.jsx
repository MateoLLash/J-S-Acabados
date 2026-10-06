import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Activity, CheckCircle2, Timer, AlertTriangle, RefreshCw,
  ChevronDown, ChevronRight, ArrowDownLeft, ArrowUpRight, Repeat, X,
} from 'lucide-react';
import { apiFetch } from '../../utils/api';
import { styles } from './InventoryDashboard.styles';

const PAGINA = 50;

const PERIODOS = [
  { label: 'Última hora', horas: 1 },
  { label: 'Últimas 24 horas', horas: 24 },
  { label: 'Últimos 7 días', horas: 168 },
  { label: 'Últimos 30 días', horas: 720 },
];

const DIRECCIONES = [
  { value: '', label: 'Todas las direcciones' },
  { value: 'entrante', label: 'Entrante (nos consumen)' },
  { value: 'saliente', label: 'Saliente (consumimos a Lina)' },
  { value: 'interna', label: 'Sincronizaciones' },
];

const RESULTADOS = [
  { value: '', label: 'Todos los resultados' },
  { value: 'exito', label: 'Éxito' },
  { value: 'error', label: 'Error' },
  { value: 'timeout', label: 'Timeout' },
  { value: 'no_autorizado', label: 'No autorizado' },
  { value: 'error_cliente', label: 'Error de cliente (4xx)' },
  { value: 'error_servidor', label: 'Error de servidor (5xx)' },
];

const COLOR_DIRECCION = {
  entrante: { bg: '#dbeafe', color: '#1d4ed8', label: 'Entrante', Icono: ArrowDownLeft },
  saliente: { bg: '#ffedd5', color: '#c2410c', label: 'Saliente', Icono: ArrowUpRight },
  interna: { bg: '#ede9fe', color: '#6d28d9', label: 'Sync', Icono: Repeat },
};

const COLOR_RESULTADO = {
  exito: { bg: '#dcfce7', color: '#15803d', label: 'Éxito' },
  no_autorizado: { bg: '#fef9c3', color: '#a16207', label: 'No autorizado' },
  timeout: { bg: '#ffedd5', color: '#c2410c', label: 'Timeout' },
  error_cliente: { bg: '#fee2e2', color: '#b91c1c', label: 'Error 4xx' },
  error_servidor: { bg: '#fee2e2', color: '#b91c1c', label: 'Error 5xx' },
  error: { bg: '#fee2e2', color: '#b91c1c', label: 'Error' },
};

const num = (v) => (v === null || v === undefined ? 0 : Number(v));

const fmtMs = (v) => {
  if (v === null || v === undefined) return '—';
  const n = Number(v);
  return n >= 1000 ? `${(n / 1000).toFixed(1)} s` : `${Math.round(n)} ms`;
};

const colorDuracion = (v) => {
  const n = num(v);
  if (n < 500) return '#15803d';
  if (n < 2000) return '#b45309';
  return '#b91c1c';
};

const fmtBytes = (v) => {
  if (v === null || v === undefined) return '—';
  const n = Number(v);
  return n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`;
};

const fmtFecha = (iso) =>
  iso
    ? new Date(iso).toLocaleString('es-PE', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
      })
    : '—';

const Badge = ({ bg, color, children }) => (
  <span
    style={{
      backgroundColor: bg, color, padding: '3px 8px', borderRadius: '6px',
      fontSize: '11px', fontWeight: '600', whiteSpace: 'nowrap',
      display: 'inline-flex', alignItems: 'center', gap: '4px',
    }}
  >
    {children}
  </span>
);

const BadgeDireccion = ({ valor }) => {
  const c = COLOR_DIRECCION[valor] || { bg: '#f1f5f9', color: '#475569', label: valor, Icono: Activity };
  const Icono = c.Icono;
  return (
    <Badge bg={c.bg} color={c.color}>
      <Icono size={12} /> {c.label}
    </Badge>
  );
};

const BadgeResultado = ({ valor }) => {
  const c = COLOR_RESULTADO[valor] || { bg: '#f1f5f9', color: '#475569', label: valor };
  return <Badge bg={c.bg} color={c.color}>{c.label}</Badge>;
};

const selectStyle = {
  padding: '9px 12px', borderRadius: '8px', border: '1px solid #e2e8f0',
  fontSize: '13px', color: '#334155', backgroundColor: '#fff', cursor: 'pointer',
};

const AuditoriaIntegracion = () => {
  const [horas, setHoras] = useState(24);
  const [direccion, setDireccion] = useState('');
  const [resultado, setResultado] = useState('');
  const [correlacion, setCorrelacion] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(false);

  const [metricas, setMetricas] = useState([]);
  const [eventos, setEventos] = useState([]);
  const [hayMas, setHayMas] = useState(false);
  const [abierto, setAbierto] = useState(null);

  const [cargando, setCargando] = useState(true);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [error, setError] = useState('');
  const [actualizado, setActualizado] = useState(null);

  const armarQuery = useCallback(
    (offset) => {
      const p = new URLSearchParams({ horas: String(horas), limit: String(PAGINA), offset: String(offset) });
      if (direccion) p.set('direccion', direccion);
      if (resultado) p.set('resultado', resultado);
      if (correlacion) p.set('correlacion_id', correlacion);
      return p.toString();
    },
    [horas, direccion, resultado, correlacion]
  );

  const cargar = useCallback(async () => {
    try {
      setError('');
      const [m, e] = await Promise.all([
        apiFetch(`/auditoria/integracion/metricas?horas=${horas}`),
        apiFetch(`/auditoria/integracion?${armarQuery(0)}`),
      ]);
      setMetricas(m?.operaciones || []);
      setEventos(e || []);
      setHayMas((e || []).length === PAGINA);
      setActualizado(new Date());
    } catch (err) {
      setError(err.message || 'No se pudo cargar la auditoría');
    } finally {
      setCargando(false);
    }
  }, [horas, armarQuery]);

  // La pantalla de "Cargando..." solo se muestra la primera vez; al cambiar filtros se actualiza en sitio
  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    if (!autoRefresh) return undefined;
    const id = setInterval(cargar, 30000);
    return () => clearInterval(id);
  }, [autoRefresh, cargar]);

  const cargarMas = async () => {
    try {
      setCargandoMas(true);
      const mas = await apiFetch(`/auditoria/integracion?${armarQuery(eventos.length)}`);
      setEventos((prev) => [...prev, ...(mas || [])]);
      setHayMas((mas || []).length === PAGINA);
    } catch (err) {
      setError(err.message || 'No se pudo cargar más eventos');
    } finally {
      setCargandoMas(false);
    }
  };

  // Indicadores generales calculados a partir de las métricas por operación
  const resumen = useMemo(() => {
    const total = metricas.reduce((s, m) => s + num(m.total), 0);
    const exitosos = metricas.reduce((s, m) => s + num(m.exitosos), 0);
    const sumaMs = metricas.reduce((s, m) => s + num(m.promedio_ms) * num(m.total), 0);
    const masLenta = metricas.reduce(
      (peor, m) => (num(m.p95_ms) > num(peor?.p95_ms) ? m : peor),
      null
    );
    return {
      total,
      problemas: total - exitosos,
      pctExito: total ? (exitosos / total) * 100 : null,
      promedio: total ? sumaMs / total : null,
      masLenta,
    };
  }, [metricas]);

  const periodoLabel = PERIODOS.find((p) => p.horas === horas)?.label?.toLowerCase() || `${horas} h`;

  const tarjetas = [
    {
      titulo: 'Llamadas',
      valor: resumen.total.toLocaleString('es-PE'),
      sub: periodoLabel,
      icono: <Activity size={18} color="#2563eb" />,
      fondo: '#dbeafe',
    },
    {
      titulo: 'Tasa de éxito',
      valor: resumen.pctExito === null ? '—' : `${resumen.pctExito.toFixed(1)}%`,
      sub: `${resumen.problemas} con problemas`,
      icono: <CheckCircle2 size={18} color="#16a34a" />,
      fondo: '#dcfce7',
    },
    {
      titulo: 'Tiempo promedio',
      valor: fmtMs(resumen.promedio),
      sub: 'ponderado por llamadas',
      icono: <Timer size={18} color="#d97706" />,
      fondo: '#fef3c7',
    },
    {
      titulo: 'Operación más lenta (p95)',
      valor: resumen.masLenta ? fmtMs(resumen.masLenta.p95_ms) : '—',
      sub: resumen.masLenta ? resumen.masLenta.operacion : 'sin datos',
      icono: <AlertTriangle size={18} color="#dc2626" />,
      fondo: '#fee2e2',
    },
  ];

  if (cargando) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', minHeight: '400px' }}>
        <h3 style={{ fontFamily: 'sans-serif', color: '#f97316' }}>Cargando auditoría de integración...</h3>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', boxSizing: 'border-box' }}>
      <div style={{ ...styles.pageHeader, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={styles.pageTitle}>Auditoría de Integración</h1>
          <p style={styles.pageSubtitle}>
            Cada intercambio de API con Lina: tiempos de respuesta, resultados y errores
            {actualizado && ` · actualizado ${actualizado.toLocaleTimeString('es-PE')}`}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#64748b', cursor: 'pointer' }}>
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
            Auto-actualizar (30 s)
          </label>
          <button
            type="button"
            onClick={cargar}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 14px',
              borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: '#fff',
              color: '#334155', fontSize: '13px', fontWeight: '600', cursor: 'pointer',
            }}
          >
            <RefreshCw size={14} /> Actualizar
          </button>
        </div>
      </div>

      {error && (
        <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '12px 16px', borderRadius: '8px', fontSize: '13px', marginBottom: '16px' }}>
          {error}
        </div>
      )}

      {/* Filtros */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '20px' }}>
        <select style={selectStyle} value={horas} onChange={(e) => setHoras(Number(e.target.value))}>
          {PERIODOS.map((p) => <option key={p.horas} value={p.horas}>{p.label}</option>)}
        </select>
        <select style={selectStyle} value={direccion} onChange={(e) => setDireccion(e.target.value)}>
          {DIRECCIONES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
        </select>
        <select style={selectStyle} value={resultado} onChange={(e) => setResultado(e.target.value)}>
          {RESULTADOS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        {correlacion && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: '#ffedd5', color: '#c2410c', padding: '6px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: '600' }}>
            Traza: {correlacion.slice(0, 8)}…
            <X size={13} style={{ cursor: 'pointer' }} onClick={() => setCorrelacion('')} />
          </span>
        )}
      </div>

      {/* Tarjetas de indicadores */}
      <div style={styles.metricsGrid}>
        {tarjetas.map((t) => (
          <div key={t.titulo} style={styles.metricCard}>
            <div style={styles.metricMeta}>
              <p style={styles.metricTitle}>{t.titulo}</p>
              <p style={styles.metricValue}>{t.valor}</p>
              <p style={{ ...styles.metricChange, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.sub}>{t.sub}</p>
            </div>
            <div style={styles.metricIconBox(t.fondo)}>{t.icono}</div>
          </div>
        ))}
      </div>

      {/* Rendimiento por operación */}
      <div style={styles.tableCard}>
        <div style={styles.tableHeaderWrapper}>
          <h3 style={{ ...styles.chartTitle, margin: 0 }}>Rendimiento por operación</h3>
          <span style={styles.tableBadge}>{metricas.length} operaciones</span>
        </div>
        <table style={styles.table}>
          <thead>
            <tr>
              {['Dirección', 'Operación', 'Llamadas', '% Éxito', 'Promedio', 'P50', 'P95', 'P99', 'Máximo', 'Último evento'].map((h) => (
                <th key={h} style={styles.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metricas.length === 0 && (
              <tr><td colSpan={10} style={{ ...styles.td, textAlign: 'center', color: '#94a3b8' }}>Sin eventos en este período</td></tr>
            )}
            {metricas.map((m) => (
              <tr key={`${m.direccion}-${m.sistema}-${m.operacion}`}>
                <td style={styles.td}><BadgeDireccion valor={m.direccion} /></td>
                <td style={{ ...styles.td, fontWeight: '600', color: '#0f172a' }}>{m.operacion}</td>
                <td style={styles.td}>{num(m.total).toLocaleString('es-PE')}</td>
                <td style={{ ...styles.td, fontWeight: '600', color: num(m.pct_exito) >= 99 ? '#15803d' : num(m.pct_exito) >= 90 ? '#b45309' : '#b91c1c' }}>
                  {num(m.pct_exito).toFixed(1)}%
                </td>
                <td style={{ ...styles.td, color: colorDuracion(m.promedio_ms), fontWeight: '600' }}>{fmtMs(m.promedio_ms)}</td>
                <td style={styles.td}>{fmtMs(m.p50_ms)}</td>
                <td style={styles.td}>{fmtMs(m.p95_ms)}</td>
                <td style={styles.td}>{fmtMs(m.p99_ms)}</td>
                <td style={styles.td}>{fmtMs(m.max_ms)}</td>
                <td style={{ ...styles.td, fontSize: '12px', color: '#64748b' }}>{fmtFecha(m.ultimo_evento)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Eventos recientes */}
      <div style={styles.tableCard}>
        <div style={styles.tableHeaderWrapper}>
          <h3 style={{ ...styles.chartTitle, margin: 0 }}>Eventos recientes</h3>
          <span style={styles.tableBadge}>{eventos.length}{hayMas ? '+' : ''} eventos</span>
        </div>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={{ ...styles.th, width: '28px' }} />
              {['Fecha', 'Dirección', 'Sistema', 'Operación', 'Estado', 'Resultado', 'Duración', 'Registros (rec / proc / omit)'].map((h) => (
                <th key={h} style={styles.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {eventos.length === 0 && (
              <tr><td colSpan={9} style={{ ...styles.td, textAlign: 'center', color: '#94a3b8' }}>Sin eventos con estos filtros</td></tr>
            )}
            {eventos.map((ev) => {
              const expandido = abierto === ev.id;
              const tieneRegistros = ev.registros_recibidos !== null && ev.registros_recibidos !== undefined;
              return (
                <React.Fragment key={ev.id}>
                  <tr style={{ cursor: 'pointer', backgroundColor: expandido ? '#f8fafc' : 'transparent' }} onClick={() => setAbierto(expandido ? null : ev.id)}>
                    <td style={styles.td}>{expandido ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                    <td style={{ ...styles.td, fontSize: '12px', whiteSpace: 'nowrap' }}>{fmtFecha(ev.fecha)}</td>
                    <td style={styles.td}><BadgeDireccion valor={ev.direccion} /></td>
                    <td style={styles.td}>{ev.sistema}</td>
                    <td style={{ ...styles.td, fontWeight: '600', color: '#0f172a' }}>{ev.operacion}</td>
                    <td style={styles.td}>{ev.status_code ?? '—'}</td>
                    <td style={styles.td}><BadgeResultado valor={ev.resultado} /></td>
                    <td style={{ ...styles.td, fontWeight: '600', color: colorDuracion(ev.duracion_ms), whiteSpace: 'nowrap' }}>{fmtMs(ev.duracion_ms)}</td>
                    <td style={styles.td}>
                      {tieneRegistros ? `${ev.registros_recibidos} / ${ev.registros_procesados ?? 0} / ${ev.registros_omitidos ?? 0}` : '—'}
                    </td>
                  </tr>
                  {expandido && (
                    <tr>
                      <td colSpan={9} style={{ padding: '0 8px 16px 36px', borderBottom: '1px solid #f1f5f9', backgroundColor: '#f8fafc' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px 24px', fontSize: '12px', color: '#475569', paddingTop: '12px' }}>
                          <div><strong>Endpoint:</strong> {ev.metodo} {ev.endpoint}</div>
                          <div><strong>Tamaño petición:</strong> {fmtBytes(ev.tam_request_bytes)}</div>
                          <div><strong>Tamaño respuesta:</strong> {fmtBytes(ev.tam_respuesta_bytes)}</div>
                          <div><strong>IP origen:</strong> {ev.ip_origen || '—'}</div>
                          <div><strong>Usuario (ID):</strong> {ev.usuario_id ?? '—'}</div>
                          <div style={{ wordBreak: 'break-all' }}><strong>Correlación:</strong> {ev.correlacion_id || '—'}</div>
                        </div>
                        {(ev.error_tipo || ev.error_mensaje) && (
                          <div style={{ marginTop: '12px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 12px', fontSize: '12px', color: '#b91c1c', wordBreak: 'break-word' }}>
                            <strong>{ev.error_tipo || 'Error'}:</strong> {ev.error_mensaje}
                          </div>
                        )}
                        {ev.correlacion_id && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setCorrelacion(ev.correlacion_id); }}
                            style={{ marginTop: '12px', padding: '7px 12px', borderRadius: '8px', border: '1px solid #fdba74', backgroundColor: '#fff7ed', color: '#c2410c', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                          >
                            Ver traza completa de esta operación
                          </button>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>

        {hayMas && (
          <div style={{ textAlign: 'center', marginTop: '16px' }}>
            <button
              type="button"
              onClick={cargarMas}
              disabled={cargandoMas}
              style={{ padding: '9px 18px', borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: '#fff', color: '#334155', fontSize: '13px', fontWeight: '600', cursor: cargandoMas ? 'wait' : 'pointer' }}
            >
              {cargandoMas ? 'Cargando...' : 'Cargar más'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuditoriaIntegracion;