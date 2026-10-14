import React, { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../utils/api';

const estados = { completado: 'Completado', parcial: 'Parcial', revertido: 'Revertido', no_iniciado: 'No iniciado', pendiente: 'Pendiente', no_aplica: 'No aplica', respuesta_recibida: 'Respuesta recibida de Lina', guardado: 'Guardado', omitido: 'Omitido', fallido: 'Fallido' };
const mostrar = v => v === null || v === undefined ? '—' : v;
const fecha = v => v ? new Date(v).toLocaleString('es-PE', { timeZone: 'America/Lima' }) : '—';

export function DetalleSincronizacion({ evento: e }) {
  const items = Array.isArray(e.detalle_registros) ? e.detalle_registros : [];
  return <>
    {e.accion_sugerida && <div className="audit-advice"><strong>Qué hacer</strong><p>{e.accion_sugerida}</p></div>}
    {e.direccion === 'interna' && <div className="audit-sync-detail">
      <dl><div><dt>Guardado local</dt><dd>{estados[e.estado_guardado] || 'Sin detalle histórico'}</dd></div><div><dt>Confirmación externa</dt><dd>{estados[e.estado_confirmacion] || 'Sin detalle histórico'}</dd></div><div><dt>Etapa final / detenida</dt><dd>{mostrar(e.etapa)}</dd></div><div><dt>Recibidos / guardados / omitidos / fallidos</dt><dd>{[e.registros_recibidos, e.registros_procesados, e.registros_omitidos, e.registros_fallidos].map(mostrar).join(' / ')}</dd></div></dl>
      {e.estado_confirmacion === 'pendiente' && <p className="audit-advice">Los registros guardados permanecen en tu base. Repetir la importación no reenvía automáticamente su confirmación.</p>}
      {items.length > 0 ? <><h4>Resultado por registro</h4><div className="audit-table-scroll"><table><thead><tr>{['Posición', 'ID en Lina', 'Código de producto', 'Resultado', 'Motivo'].map(x => <th key={x}>{x}</th>)}</tr></thead><tbody>{items.map((x, i) => <tr key={i}><td>{mostrar(x.posicion)}</td><td>{mostrar(x.id_externo)}</td><td>{mostrar(x.codigo)}</td><td>{estados[x.estado] || x.estado}</td><td>{x.motivo}</td></tr>)}</tbody></table></div><p className="audit-note">{items.length} detalles disponibles de {mostrar(e.detalle_total)} registros recibidos. Se conservan hasta 200 detalles por sincronización; los contadores abarcan el total.</p></> : <p className="audit-note">Este evento no contiene detalle por registro. Puede ser histórico o una consulta que falló antes de recibir datos.</p>}
    </div>}
  </>;
}

export default function AuditoriaTraza({ id, cerrar }) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [intento, setIntento] = useState(0);
  const titulo = useRef(null);
  useEffect(() => {
    let vigente = true;
    setDatos(null); setError(''); titulo.current?.focus();
    apiFetch(`/auditoria/integracion/traza/${encodeURIComponent(id)}`).then(d => { if (vigente) setDatos(d); }).catch(e => { if (vigente) setError(e.message); });
    return () => { vigente = false; };
  }, [id, intento]);
  const eventos = datos?.eventos || [];
  const resumen = [...eventos].reverse().find(e => e.direccion === 'interna');
  return <section className="audit-panel audit-trace" aria-labelledby="audit-trace-title">
    <div className="audit-panel-heading"><div><h2 id="audit-trace-title" tabIndex={-1} ref={titulo}>Traza de la operación</h2><p className="audit-trace-id">{id}</p><p>Incluye eventos de esta correlación, independientemente de los filtros de la tabla.</p></div><button className="audit-button" onClick={cerrar}>Cerrar traza</button></div>
    {error ? <div className="audit-error" role="alert">{error}<button className="audit-button" onClick={() => setIntento(x => x + 1)}>Reintentar</button></div> : !datos ? <p className="audit-trace-message" role="status">Cargando pasos relacionados…</p> : <>
      <p className="audit-trace-message">{eventos.length} eventos · Duración total del proceso: {resumen?.duracion_ms != null ? `${resumen.duracion_ms} ms` : 'No disponible (sin resumen interno)'}. Los tiempos de las llamadas están incluidos en el total; no se suman.</p>
      {datos.truncada && <p className="audit-error">La traza supera 500 eventos: se muestran los primeros 500.</p>}
      <ol className="audit-timeline">{eventos.map(e => <li key={e.id}><details open={e.direccion === 'interna'}><summary><span className={`audit-badge audit-result-${e.resultado}`}>{e.resultado === 'parcial' ? 'Parcial' : e.resultado === 'exito' ? 'Éxito' : 'Error'}</span><strong>{e.operacion}</strong><span>{mostrar(e.duracion_ms)} ms · HTTP {mostrar(e.status_code)}</span></summary><div className="audit-trace-body"><p>{fecha(e.fecha)} (Lima) · {e.direccion} · {e.metodo} {e.endpoint}</p><p>ID de petición: {e.request_id || 'No aplica / no disponible'}</p>{e.error_mensaje && <p className="audit-error">{e.error_mensaje}</p>}<DetalleSincronizacion evento={e} /></div></details></li>)}</ol>
    </>}
  </section>;
}
