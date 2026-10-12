import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Activity, CheckCircle2, Timer, AlertTriangle, RefreshCw, ChevronDown, ChevronRight, ArrowDownLeft, ArrowUpRight, Repeat, Search, Download, SlidersHorizontal } from 'lucide-react';
import { apiFetch } from '../../utils/api';
import './AuditoriaIntegracion.css';

const PAGE = 50;
const INITIAL = { horas: '24', direccion: '', sistema: '', operacion: '', resultado: '', correlacion_id: '', metodo: '', status_code: '', duracion_min_ms: '', q: '' };
const periods = [['1', 'Última hora'], ['24', 'Últimas 24 horas'], ['168', 'Últimos 7 días'], ['720', 'Últimos 30 días']];
const directions = [['', 'Todas las direcciones'], ['entrante', 'HTTP entrante'], ['saliente', 'HTTP saliente'], ['interna', 'Procesos internos']];
const results = [['', 'Todos los resultados'], ['exito', 'Éxito'], ['error', 'Error'], ['timeout', 'Timeout'], ['no_autorizado', 'No autorizado'], ['error_cliente', 'Error de cliente (4xx)'], ['error_servidor', 'Error de servidor (5xx)']];
const present = v => v !== null && v !== undefined && v !== '';
const numeric = v => present(v) && Number.isFinite(Number(v));
const number = v => numeric(v) ? Number(v).toLocaleString('es-PE') : '—';
const ms = v => numeric(v) ? Number(v) >= 1000 ? `${(Number(v) / 1000).toFixed(2)} s` : `${Number(v).toFixed(1)} ms` : '—';
const percent = v => numeric(v) ? `${Number(v).toFixed(1)} %` : '—';
const bytes = v => numeric(v) ? Number(v) >= 1024 ? `${(Number(v) / 1024).toFixed(1)} KB` : `${v} B` : '—';
const date = v => v && !Number.isNaN(new Date(v).getTime()) ? new Date(v).toLocaleString('es-PE', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
function Direction({ value }) {
  const Icon = value === 'entrante' ? ArrowDownLeft : value === 'saliente' ? ArrowUpRight : Repeat;
  return <span className={`audit-badge audit-${value}`}><Icon size={12} aria-hidden="true" />{directions.find(d => d[0] === value)?.[1] || value || '—'}</span>;
}
function Result({ value }) { return <span className={`audit-badge audit-result-${value}`}>{results.find(r => r[0] === value)?.[1] || value || '—'}</span>; }
function Field({ label, children }) { return <label className="audit-field"><span>{label}</span>{children}</label>; }
function Detail({ event: e, trace }) {
  const details = [
    ['Inicio', date(e.fecha)], ['Fin', date(e.fecha_fin)], ['Duración registrada', ms(e.duracion_ms)],
    ['Alcance de la medición', ({servidor_hasta_ultimo_byte: 'Servidor: hasta enviar el último fragmento (no incluye la red del cliente)', cliente_http_y_decodificacion: 'Cliente HTTP: conexión, respuesta y decodificación JSON', sincronizacion_completa: 'Proceso completo de sincronización'})[e.alcance_duracion] || e.alcance_duracion], ['Tiempo hasta cabeceras', ms(e.tiempo_cabeceras_ms)], ['Timeout configurado', ms(e.timeout_config_ms)],
    ['Método', e.metodo], ['Endpoint', e.endpoint], ['Plantilla de ruta', e.endpoint_plantilla],
    ['Parámetros de consulta (sanitizados)', e.query_params], ['ID de solicitud', e.request_id], ['ID de correlación', e.correlacion_id],
    ['Petición', bytes(e.tam_request_bytes)], ['Respuesta', bytes(e.tam_respuesta_bytes)], ['Tipo de contenido · petición', e.content_type_request], ['Tipo de contenido · respuesta', e.content_type_respuesta],
    ['IP de origen', e.ip_origen], ['Cliente HTTP (User-Agent)', e.user_agent], ['ID de usuario', e.usuario_id], ['Registros recibidos', number(e.registros_recibidos)], ['Registros procesados', number(e.registros_procesados)], ['Registros omitidos', number(e.registros_omitidos)],
  ];
  return <div className="audit-detail" id={`audit-detail-${e.id}`}>
    <div className="audit-detail-heading"><h4>Detalle del intercambio <span>#{e.id}</span></h4>{e.correlacion_id && <button className="audit-button" onClick={() => trace(e.correlacion_id)}>Filtrar por esta traza</button>}</div>
    <dl>{details.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{present(value) ? typeof value === 'object' ? JSON.stringify(value) : value : '—'}</dd></div>)}</dl>
    {(e.error_tipo || e.error_mensaje) && <div className="audit-error"><strong>{e.error_tipo || 'Error registrado'}</strong><p>{e.error_mensaje || 'Sin mensaje adicional.'}</p></div>}
    <p className="audit-note">— indica un dato no disponible. Los tiempos corresponden al alcance registrado; no representan etapas que no fueron medidas.</p>
  </div>;
}

export default function AuditoriaIntegracion() {
  const [draft, setDraft] = useState(INITIAL);
  const [filters, setFilters] = useState(INITIAL);
  const [advanced, setAdvanced] = useState(false);
  const [auto, setAuto] = useState(false);
  const [data, setData] = useState({ eventos: [], operaciones: [], resumen: null });
  const [busy, setBusy] = useState(true);
  const [moreBusy, setMoreBusy] = useState(false);
  const [more, setMore] = useState(false);
  const [error, setError] = useState('');
  const [updated, setUpdated] = useState(null);
  const [open, setOpen] = useState(null);
  const generation = useRef(0);
  const active = useRef(false);
  const paging = useRef(false);
  const query = new URLSearchParams(Object.entries(filters).filter(([, v]) => v !== '')).toString();
  const load = useCallback(async () => {
    const version = ++generation.current;
    active.current = true;
    paging.current = false;
    setBusy(true); setMoreBusy(false); setError('');
    try {
      const [metrics, events] = await Promise.all([apiFetch(`/auditoria/integracion/metricas?${query}`), apiFetch(`/auditoria/integracion?${query}&limit=${PAGE}&offset=0`)]);
      if (version !== generation.current) return;
      setData({ eventos: Array.isArray(events) ? events : [], operaciones: metrics?.operaciones || [], resumen: metrics?.resumen || null });
      setMore(Array.isArray(events) && events.length === PAGE); setUpdated(new Date());
    } catch (err) { if (version === generation.current) setError(err.message || 'No se pudo cargar la auditoría. Intenta actualizar de nuevo.'); }
    finally { if (version === generation.current) { active.current = false; setBusy(false); } }
  }, [query]);
  useEffect(() => { setData({ eventos: [], operaciones: [], resumen: null }); setUpdated(null); setOpen(null); setMore(false); load(); return () => { generation.current += 1; }; }, [load]);
  useEffect(() => { if (!auto) return undefined; const timer = setInterval(() => { if (!active.current && !paging.current) load(); }, 30000); return () => clearInterval(timer); }, [auto, load]);
  const loadMore = async () => {
    if (active.current || paging.current) return;
    const version = generation.current;
    paging.current = true; setMoreBusy(true); setError('');
    try {
      const events = await apiFetch(`/auditoria/integracion?${query}&limit=${PAGE}&offset=${data.eventos.length}`);
      if (version !== generation.current) return;
      const rows = Array.isArray(events) ? events : [];
      setData(previous => ({ ...previous, eventos: [...previous.eventos, ...rows.filter(row => !previous.eventos.some(old => old.id === row.id))] })); setMore(rows.length === PAGE);
    } catch (err) { if (version === generation.current) setError(err.message || 'No se pudieron cargar más eventos.'); }
    finally { if (version === generation.current) { paging.current = false; setMoreBusy(false); } }
  };
  const change = (key, value) => setDraft(prev => ({ ...prev, [key]: value }));
  const apply = next => { const nextQuery = new URLSearchParams(Object.entries(next).filter(([, v]) => v !== '')).toString(); setDraft(next); setOpen(null); if (nextQuery === query) { load(); return; } generation.current += 1; setFilters({ ...next }); };
  const exportCsv = () => {
    const keys = ['id', 'fecha', 'fecha_fin', 'direccion', 'sistema', 'operacion', 'metodo', 'endpoint', 'status_code', 'resultado', 'duracion_ms', 'alcance_duracion', 'tiempo_cabeceras_ms', 'timeout_config_ms', 'correlacion_id', 'request_id', 'registros_recibidos', 'registros_procesados', 'registros_omitidos', 'error_tipo', 'error_mensaje', 'endpoint_plantilla', 'query_params', 'tam_request_bytes', 'tam_respuesta_bytes', 'content_type_request', 'content_type_respuesta', 'ip_origen', 'usuario_id', 'user_agent'];
    const cell = value => { let s = String(value ?? ''); if (/^[\s]*[=+@-]/.test(s)) s = `'${s}`; return `"${s.replace(/"/g, '""')}"`; };
    const blob = new Blob(['\uFEFF', [keys.join(','), ...data.eventos.map(row => keys.map(key => cell(row[key])).join(','))].join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `auditoria-integracion-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const summary = data.resumen || {};
  const cards = [
    ['Eventos registrados', number(summary.total), 'Incluye HTTP y procesos internos filtrados', Activity, 'blue'],
    ['Tasa de éxito', percent(summary.pct_exito), `${number(summary.exitosos)} eventos exitosos`, CheckCircle2, 'green'],
    ['Duración promedio', ms(summary.promedio_ms), `Mediana (P50): ${ms(summary.p50_ms)}`, Timer, 'orange'],
    ['Percentil 95', ms(summary.p95_ms), `P99: ${ms(summary.p99_ms)} · Máximo: ${ms(summary.max_ms)}`, Activity, 'purple'],
    ['Errores / timeouts', `${number(summary.errores)} / ${number(summary.timeouts)}`, 'Los errores incluyen los timeouts', AlertTriangle, 'red'],
  ];
  return <section className="audit-page" aria-labelledby="audit-title">
    <header className="audit-header"><div><span className="audit-eyebrow">ACABADOS J&S · OBSERVABILIDAD</span><h1 id="audit-title">Auditoría de integración</h1><p>Explora cada intercambio, identifica errores y sigue el rendimiento de tus integraciones.</p></div><div className="audit-header-actions"><label className="audit-auto"><input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)} />Actualizar cada 30 s</label><button className="audit-button" disabled={busy || moreBusy} onClick={load}><RefreshCw size={15} className={busy ? 'audit-spin' : ''} aria-hidden="true" />{busy ? 'Actualizando…' : 'Actualizar'}</button></div></header>
    <form className="audit-filters" onSubmit={e => { e.preventDefault(); if (query === new URLSearchParams(Object.entries(draft).filter(([, v]) => v !== '')).toString()) load(); else apply(draft); }}>
      <div className="audit-filter-grid"><Field label="Buscar"><div className="audit-search"><Search size={16} aria-hidden="true" /><input value={draft.q} onChange={e => change('q', e.target.value)} placeholder="Endpoint, operación o correlación" /></div></Field><Field label="Período"><select value={draft.horas} onChange={e => change('horas', e.target.value)}>{periods.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field><Field label="Dirección"><select value={draft.direccion} onChange={e => change('direccion', e.target.value)}>{directions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field><Field label="Resultado"><select value={draft.resultado} onChange={e => change('resultado', e.target.value)}>{results.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field></div>
      {advanced && <div className="audit-advanced" id="audit-advanced">{[['sistema', 'Sistema'], ['operacion', 'Operación'], ['correlacion_id', 'ID de correlación'], ['status_code', 'Código HTTP'], ['duracion_min_ms', 'Duración mínima (ms)']].map(([key, label]) => <Field label={label} key={key}><input type={['status_code', 'duracion_min_ms'].includes(key) ? 'number' : 'text'} min={key === 'status_code' ? 100 : 0} max={key === 'status_code' ? 599 : undefined} step={key === 'duracion_min_ms' ? 'any' : undefined} value={draft[key]} onChange={e => change(key, e.target.value)} placeholder="Cualquiera" /></Field>)}<Field label="Método HTTP"><select value={draft.metodo} onChange={e => change('metodo', e.target.value)}>{['', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].map(v => <option key={v} value={v}>{v || 'Todos'}</option>)}</select></Field></div>}
      <div className="audit-filter-footer"><button className="audit-text-button" type="button" aria-expanded={advanced} aria-controls="audit-advanced" onClick={() => setAdvanced(!advanced)}><SlidersHorizontal size={14} />Filtros avanzados<ChevronDown size={14} /></button><div className="audit-filter-actions"><button type="button" className="audit-text-button" onClick={() => { if (query === 'horas=24') { setDraft(INITIAL); load(); } else apply(INITIAL); }}>Restablecer</button><button className="audit-button audit-primary" type="submit" disabled={busy}>Aplicar filtros</button></div></div>
      {Object.entries(filters).some(([k, v]) => k !== 'horas' && v) && <div className="audit-active-filters" aria-label="Filtros aplicados">{Object.entries(filters).filter(([k, v]) => k !== 'horas' && v).map(([k, v]) => <span key={k}>{({ q: 'Búsqueda', direccion: 'Dirección', sistema: 'Sistema', operacion: 'Operación', resultado: 'Resultado', correlacion_id: 'Correlación', metodo: 'Método', status_code: 'HTTP', duracion_min_ms: 'Mín. ms' })[k]}: {v}</span>)}</div>}
    </form>
    {error && <div className="audit-error" role="alert"><AlertTriangle size={17} /><div><strong>No se pudo completar la actualización</strong><p>{error}</p>{updated && <p>Se conservan los datos de la última actualización correcta.</p>}</div><button className="audit-button" onClick={load} disabled={busy}>Reintentar</button></div>}
    <div className="audit-status" role="status">{busy ? 'Consultando eventos y métricas…' : updated ? `Actualizado: ${date(updated)} · Métricas de todo el período filtrado` : 'Sin datos cargados'}</div>
    <div className="audit-metrics" aria-busy={busy}>{cards.map(([label, value, hint, Icon, color]) => <article className="audit-metric" key={label}><div className="audit-metric-top"><span>{label}</span><span className={`audit-icon audit-icon-${color}`}><Icon size={17} aria-hidden="true" /></span></div><strong>{value}</strong><p>{hint}</p></article>)}</div>
    <section className="audit-panel"><div className="audit-panel-heading"><div><h2>Rendimiento por operación</h2><p>HTTP y procesos internos se muestran por separado. P95: el 95 % de las duraciones no supera este valor.</p></div><span className="audit-count">{data.operaciones.length} grupos</span></div>
      {[['Intercambios HTTP', data.operaciones.filter(m => m.direccion !== 'interna')], ['Procesos internos', data.operaciones.filter(m => m.direccion === 'interna')]].map(([title, rows]) => <div key={title} className="audit-performance"><h3>{title}<span>{rows.length}</span></h3><div className="audit-table-scroll" tabIndex={0} role="region" aria-label={title}><table><thead><tr>{['Dirección / sistema', 'Operación', 'Eventos', 'Éxito', 'Promedio', 'P50', 'P95', 'P99', 'Máximo', 'Último evento'].map(h => <th scope="col" key={h}>{h}</th>)}</tr></thead><tbody>{rows.map(m => <tr key={`${m.direccion}-${m.sistema}-${m.operacion}`}><td><Direction value={m.direccion} /><small>{m.sistema || '—'}</small></td><td className="audit-operation">{m.operacion || '—'}</td><td>{number(m.total)}</td><td>{percent(m.pct_exito)}</td><td className="audit-duration">{ms(m.promedio_ms)}</td><td>{ms(m.p50_ms)}</td><td>{ms(m.p95_ms)}</td><td>{ms(m.p99_ms)}</td><td>{ms(m.max_ms)}</td><td className="audit-date">{date(m.ultimo_evento)}</td></tr>)}{!rows.length && <tr><td colSpan={10} className="audit-empty">{busy ? 'Cargando métricas…' : 'No hay operaciones en este grupo para los filtros aplicados.'}</td></tr>}</tbody></table></div></div>)}
    </section>
    <section className="audit-panel" aria-busy={busy || moreBusy}><div className="audit-panel-heading"><div><h2>Registro de eventos <span className="audit-count">{data.eventos.length} cargados</span></h2><p>Abre un evento para consultar sus tiempos, metadatos y trazabilidad.</p></div><button className="audit-button" onClick={exportCsv} disabled={!data.eventos.length || busy}><Download size={15} aria-hidden="true" />Exportar CSV</button></div><div className="audit-table-scroll" tabIndex={0} role="region" aria-label="Registro de eventos"><table className="audit-events"><thead><tr>{['Detalle', 'Fecha y hora (Lima)', 'Dirección / sistema', 'Operación / endpoint', 'HTTP', 'Resultado', 'Duración', 'Recibidos / procesados / omitidos'].map(h => <th scope="col" key={h}>{h}</th>)}</tr></thead><tbody>{data.eventos.map(e => <React.Fragment key={e.id}><tr className={open === e.id ? 'audit-row-open' : ''}><td><button className="audit-expand" aria-expanded={open === e.id} aria-controls={open === e.id ? `audit-detail-${e.id}` : undefined} aria-label={`${open === e.id ? 'Cerrar' : 'Ver'} detalle del evento ${e.id}`} onClick={() => setOpen(open === e.id ? null : e.id)}>{open === e.id ? <ChevronDown size={17} /> : <ChevronRight size={17} />}</button></td><td className="audit-date">{date(e.fecha)}<small>#{e.id}</small></td><td><Direction value={e.direccion} /><small>{e.sistema || '—'}</small></td><td className="audit-operation">{e.operacion || '—'}<small className="audit-endpoint" title={`${e.metodo || ''} ${e.endpoint || ''}`}>{e.metodo && <b>{e.metodo} </b>}{e.endpoint || 'Sin endpoint HTTP'}</small></td><td><code>{e.status_code ?? '—'}</code></td><td><Result value={e.resultado} /></td><td className="audit-duration">{ms(e.duracion_ms)}</td><td>{number(e.registros_recibidos)} / {number(e.registros_procesados)} / {number(e.registros_omitidos)}</td></tr>{open === e.id && <tr><td colSpan={8} className="audit-detail-cell"><Detail event={e} trace={id => apply({ ...filters, correlacion_id: id })} /></td></tr>}</React.Fragment>)}{!data.eventos.length && <tr><td colSpan={8} className="audit-empty"><Activity size={25} aria-hidden="true" /><strong>{busy ? 'Cargando eventos…' : error ? 'No hay eventos disponibles' : 'No se encontraron eventos'}</strong><span>{busy ? 'Estamos consultando la auditoría.' : 'Prueba con otro período o restablece los filtros.'}</span></td></tr>}</tbody></table></div><footer className="audit-table-footer"><span>{data.eventos.length} de {number(summary.total)} eventos · CSV de registros cargados</span>{more && <button className="audit-button" disabled={busy || moreBusy} onClick={loadMore}>{moreBusy ? 'Cargando…' : 'Cargar 50 más'}</button>}</footer></section>
  </section>;
}
