import React, { useState, useEffect } from 'react';
import { Download } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { apiFetch, API_URL } from '../../utils/api';

const Reportes = () => {
  const [periodo, setPeriodo] = useState('Semanal');
  const [metrics, setMetrics] = useState({
    ingresos: 0,
    egresos: 0,
    productosMasVendidos: [],
    tendenciaSemanal: [],
    comparativa: { ingresosAnterior: 0, egresosAnterior: 0, pctIngresos: null, pctEgresos: null },
    rankingVendedores: [],
    comprasPorProveedor: []
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rentabilidad, setRentabilidad] = useState(null);
  const [errorRentabilidad, setErrorRentabilidad] = useState(null);

  useEffect(() => {
    const fetchRentabilidad = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_URL}/analitica/rentabilidad`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          setRentabilidad(await res.json());
        } else {
          console.error('Error cargando rentabilidad:', res.status);
          setErrorRentabilidad('No se pudo cargar el panel de rentabilidad.');
        }
      } catch (error) {
        console.error('Error cargando rentabilidad:', error);
        setErrorRentabilidad('No se pudo cargar el panel de rentabilidad.');
      }
    };
    fetchRentabilidad();
  }, []);

  useEffect(() => {
    const fetchReportData = async () => {
      try {
        setLoading(true);
        setError(null);
        const token = localStorage.getItem('token');

        const res = await fetch(`${API_URL}/reportes/?periodo=${periodo.toLowerCase()}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) {
          throw new Error(`El servidor respondió ${res.status}`);
        }

        const data = await res.json();
        setMetrics({
          ingresos: data.ingresos ?? 0,
          egresos: data.egresos ?? 0,
          productosMasVendidos: data.productosMasVendidos || [],
          tendenciaSemanal: data.tendenciaSemanal || [],
          comparativa: data.comparativa || { ingresosAnterior: 0, egresosAnterior: 0, pctIngresos: null, pctEgresos: null },
          rankingVendedores: data.rankingVendedores || [],
          comprasPorProveedor: data.comprasPorProveedor || []
        });
      } catch (err) {
        console.error("Error al cargar reportes:", err);
        setError('No se pudo cargar el reporte desde el servidor. Verifica que el backend esté corriendo.');
        setMetrics({ ingresos: 0, egresos: 0, productosMasVendidos: [], tendenciaSemanal: [], comparativa: { ingresosAnterior: 0, egresosAnterior: 0, pctIngresos: null, pctEgresos: null }, rankingVendedores: [], comprasPorProveedor: [] });
      } finally {
        setLoading(false);
      }
    };

    fetchReportData();
  }, [periodo]);

  const margenNeto = Number(metrics.ingresos) - Number(metrics.egresos);

  const handleExportar = () => {
    const filas = [
      ['Reporte', periodo],
      [],
      ['Métrica', 'Monto (S/)'],
      ['Ingresos totales', metrics.ingresos.toFixed(2)],
      ['Egresos totales', metrics.egresos.toFixed(2)],
      ['Margen neto', margenNeto.toFixed(2)],
      [],
      ['Producto más vendido', 'Cantidad'],
      ...metrics.productosMasVendidos.map((p) => [p.name, p.cantidad]),
    ];
    const csv = filas.map((fila) => fila.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `reporte_${periodo.toLowerCase()}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const colorRotacion = (pct) => (pct >= 60 ? '#22c55e' : pct >= 30 ? '#f97316' : '#dc2626');
  const estadoRotacion = (pct) => (pct >= 60 ? 'Alta' : pct >= 30 ? 'Media' : 'Baja');

  const badgeCrecimiento = (pct, invertirColor = false) => {
    if (pct === null || pct === undefined) return null;
    const esPositivo = invertirColor ? pct <= 0 : pct >= 0;
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '11px', fontWeight: '700',
        color: esPositivo ? '#16a34a' : '#dc2626',
        backgroundColor: esPositivo ? '#f0fdf4' : '#fef2f2',
        padding: '2px 8px', borderRadius: '999px', marginLeft: '8px'
      }}>
        {pct >= 0 ? '▲' : '▼'} {Math.abs(pct)}%
      </span>
    );
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <h3 style={{ fontFamily: 'sans-serif', color: '#f97316' }}>Cargando analíticas...</h3>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '24px', fontFamily: 'sans-serif' }}>
      
      {/* HEADER DE CONTROL */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '700', color: '#1e293b' }}>Reportes</h1>
          <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: '#64748b' }}>Análisis de rendimiento y movimientos</p>
          {error && (
            <p style={{ margin: '6px 0 0 0', fontSize: '13px', color: '#dc2626', fontWeight: '600' }}>{error}</p>
          )}
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <select 
            value={periodo} 
            onChange={(e) => setPeriodo(e.target.value)} 
            style={{ padding: '8px 16px', border: '1px solid #e2e8f0', borderRadius: '6px', backgroundColor: '#fff', fontSize: '14px', color: '#334155', fontWeight: '500', cursor: 'pointer' }}
          >
            <option>Semanal</option>
            <option>Mensual</option>
            <option>Anual</option>
          </select>
          <button
            onClick={handleExportar}
            style={{ backgroundColor: '#1e3a8a', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: '6px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px' }}
          >
            <Download size={16} /> Exportar
          </button>
        </div>
      </div>

      {/* METRICAS FINANCIERAS RESUMEN */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
        <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px' }}>
          <span style={{ fontSize: '11px', fontWeight: '700', color: '#94a3b8', letterSpacing: '0.5px' }}>INGRESOS TOTALES</span>
          <h2 style={{ margin: '8px 0 4px 0', fontSize: '24px', color: '#16a34a', fontWeight: '700', display: 'flex', alignItems: 'center' }}>
            S/ {metrics.ingresos.toFixed(2)} {badgeCrecimiento(metrics.comparativa.pctIngresos)}
          </h2>
          <span style={{ fontSize: '12px', color: '#64748b' }}>vs. S/ {metrics.comparativa.ingresosAnterior.toFixed(2)} del periodo anterior</span>
        </div>
        <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px' }}>
          <span style={{ fontSize: '11px', fontWeight: '700', color: '#94a3b8', letterSpacing: '0.5px' }}>EGRESOS TOTALES</span>
          <h2 style={{ margin: '8px 0 4px 0', fontSize: '24px', color: '#dc2626', fontWeight: '700', display: 'flex', alignItems: 'center' }}>
            S/ {metrics.egresos.toFixed(2)} {badgeCrecimiento(metrics.comparativa.pctEgresos, true)}
          </h2>
          <span style={{ fontSize: '12px', color: '#64748b' }}>vs. S/ {metrics.comparativa.egresosAnterior.toFixed(2)} del periodo anterior</span>
        </div>
        <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px' }}>
          <span style={{ fontSize: '11px', fontWeight: '700', color: '#94a3b8', letterSpacing: '0.5px' }}>MARGEN NETO</span>
          <h2 style={{ margin: '8px 0 4px 0', fontSize: '24px', color: margenNeto >= 0 ? '#1e3a8a' : '#b91c1c', fontWeight: '700' }}>S/ {margenNeto.toFixed(2)}</h2>
          <span style={{ fontSize: '12px', color: '#64748b' }}>Balance de caja</span>
        </div>
      </div>

      {/* BLOQUE GRÁFICOS SECUNDARIOS */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px' }}>
        {/* TENDENCIA LINE CHART */}
        <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px' }}>
          <h3 style={{ margin: '0 0 20px 0', fontSize: '15px', fontWeight: '700', color: '#1e293b' }}>Tendencia del periodo</h3>
          <div style={{ width: '100%', height: '220px' }}>
            {metrics.tendenciaSemanal.length <= 1 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '6px', color: '#94a3b8' }}>
                <span style={{ fontSize: '13px', fontWeight: '600' }}>Aún no hay suficientes ventas en este periodo</span>
                <span style={{ fontSize: '12px' }}>La tendencia aparece cuando hay ventas en al menos 2 fechas distintas</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={metrics.tendenciaSemanal}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(v) => [`S/ ${Number(v).toFixed(2)}`, 'Ventas']} />
                  <Line type="monotone" dataKey="monto" stroke="#1e3a8a" strokeWidth={2} dot={{ fill: '#1e3a8a', r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* PRODUCTOS MÁS VENDIDOS HORIZONTAL BAR */}
        <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px' }}>
          <h3 style={{ margin: '0 0 20px 0', fontSize: '15px', fontWeight: '700', color: '#1e293b' }}>Productos más vendidos</h3>
          <div style={{ width: '100%', height: '220px' }}>
            {metrics.productosMasVendidos.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8', fontSize: '13px', fontWeight: '600' }}>
                Todavía no hay ventas registradas en este periodo
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics.productosMasVendidos} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <XAxis type="number" stroke="#94a3b8" fontSize={11} tickLine={false} allowDecimals={false} domain={[0, (max) => Math.max(max + 1, 5)]} />
                  <YAxis dataKey="name" type="category" stroke="#64748b" fontSize={10} tickLine={false} width={130} />
                  <Tooltip formatter={(v) => [`${v} unid.`, 'Vendidos']} />
                  <Bar dataKey="cantidad" fill="#f97316" radius={[0, 4, 4, 0]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* PANEL DE RENTABILIDAD (margen real por categoría, calculado de ventas ya registradas) */}
      {errorRentabilidad && !rentabilidad && (
        <div style={{ backgroundColor: '#fff', border: '1px solid #fecaca', borderRadius: '12px', padding: '20px' }}>
          <h3 style={{ margin: '0 0 4px 0', fontSize: '15px', fontWeight: '700', color: '#1e293b' }}>Rentabilidad por categoría</h3>
          <p style={{ margin: 0, fontSize: '13px', color: '#dc2626', fontWeight: '600' }}>{errorRentabilidad}</p>
        </div>
      )}
      {rentabilidad && (
        <>
          <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px' }}>
            <h3 style={{ margin: '0 0 4px 0', fontSize: '15px', fontWeight: '700', color: '#1e293b' }}>Rentabilidad por categoría</h3>
            <p style={{ margin: '0 0 20px 0', fontSize: '12px', color: '#94a3b8' }}>
              Margen real = precio de venta − precio de compra, sobre las ventas ya registradas · rotación = % de lo que entró al almacén que ya se vendió
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(rentabilidad.por_categoria.length, 1)}, 1fr)`, gap: '16px' }}>
              {rentabilidad.por_categoria.length === 0 && (
                <span style={{ fontSize: '13px', color: '#94a3b8' }}>Aún no hay ventas registradas para calcular márgenes.</span>
              )}
              {rentabilidad.por_categoria.map((cat) => (
                <div key={cat.categoria} style={{ border: '1px solid #f1f5f9', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '6px', background: '#fafafa' }}>
                  <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>{cat.categoria}</span>
                  <span style={{ fontSize: '22px', fontWeight: '700', color: '#1e293b' }}>S/ {cat.margen.toFixed(2)}</span>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>{cat.margen_pct}% de margen · {cat.unidades} unid. vendidas</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px' }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: '700', color: '#1e293b' }}>Rentabilidad por marca</h3>
              {rentabilidad.por_marca.length === 0 ? (
                <span style={{ fontSize: '13px', color: '#94a3b8' }}>Aún no hay ventas registradas para calcular márgenes.</span>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {rentabilidad.por_marca.slice(0, 5).map((m, i) => (
                    <div key={m.marca} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < Math.min(rentabilidad.por_marca.length, 5) - 1 ? '1px solid #f1f5f9' : 'none' }}>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b' }}>{m.marca}</div>
                        <div style={{ fontSize: '11px', color: '#94a3b8' }}>{m.unidades} unid. vendidas</div>
                      </div>
                      <span style={{ fontSize: '13px', fontWeight: '700', color: '#16a34a' }}>S/ {m.margen.toFixed(2)} · {m.margen_pct}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px' }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: '700', color: '#1e293b' }}>Productos con menor rotación</h3>
              {rentabilidad.menor_rotacion.length === 0 ? (
                <span style={{ fontSize: '13px', color: '#94a3b8' }}>Sin datos suficientes todavía.</span>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {rentabilidad.menor_rotacion.map((p) => (
                    <div key={p.producto_id} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px' }}>
                        <span style={{ fontWeight: '600', color: '#1e293b' }}>{p.nombre}</span>
                        <span style={{ color: colorRotacion(p.rotacion_pct), fontWeight: '700' }}>{p.rotacion_pct}% · {estadoRotacion(p.rotacion_pct)}</span>
                      </div>
                      <div style={{ width: '100%', height: '6px', backgroundColor: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ width: `${p.rotacion_pct}%`, height: '100%', backgroundColor: colorRotacion(p.rotacion_pct) }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* RANKING DE VENDEDORES Y COMPRAS POR PROVEEDOR */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: '700', color: '#1e293b' }}>Ranking de vendedores</h3>
          {metrics.rankingVendedores.length === 0 ? (
            <span style={{ fontSize: '13px', color: '#94a3b8' }}>Sin ventas registradas en este periodo.</span>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {metrics.rankingVendedores.map((v, i) => (
                <div key={v.nombre} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < metrics.rankingVendedores.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ width: '22px', height: '22px', borderRadius: '50%', backgroundColor: i === 0 ? '#fef3c7' : '#f1f5f9', color: i === 0 ? '#b45309' : '#64748b', fontSize: '11px', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b' }}>{v.nombre}</div>
                      <div style={{ fontSize: '11px', color: '#94a3b8' }}>{v.cantidadVentas} venta{v.cantidadVentas === 1 ? '' : 's'}</div>
                    </div>
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: '700', color: '#1e3a8a' }}>S/ {v.totalVendido.toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: '700', color: '#1e293b' }}>Compras por proveedor</h3>
          {metrics.comprasPorProveedor.length === 0 ? (
            <span style={{ fontSize: '13px', color: '#94a3b8' }}>Sin compras registradas en este periodo.</span>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {metrics.comprasPorProveedor.map((p, i) => (
                <div key={p.nombre} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < metrics.comprasPorProveedor.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b' }}>{p.nombre}</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>{p.cantidadCompras} compra{p.cantidadCompras === 1 ? '' : 's'}</div>
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: '700', color: '#dc2626' }}>S/ {p.totalComprado.toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

    </div>
  );
};

export default Reportes;