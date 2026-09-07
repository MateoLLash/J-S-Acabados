import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { styles } from './InventoryDashboard.styles';
import { Package, CircleDollarSign, AlertTriangle, ShoppingCart } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

// Diccionario estático basado en tu volcado SQL de la tabla `categorias`
const CATEGORIAS_MAP = {
  1: 'Mayólicas',
  2: 'Azulejos',
  3: 'Fraguas',
  4: 'Pegamentos'
};

const InventoryDashboard = () => {
  const navigate = useNavigate();

  // ================= ESTADOS DEL PANEL =================
  const [metrics, setMetrics] = useState({
    totalProductos: 0,
    ventasHoy: 0,
    alertasStock: 0,
    comprasPendientes: 0
  });
  const [alertasStockTable, setAlertasStockTable] = useState([]);
  const [barData, setBarData] = useState([]);
  const [pieData, setPieData] = useState([]);
  const [loading, setLoading] = useState(true);

  // Paleta de colores para las porciones de la dona
  const COLORS = ['#1e3a8a', '#f97316', '#22c55e', '#a855f7', '#06b6d4'];

  useEffect(() => {
    const fetchRealData = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) {
          navigate('/login');
          return;
        }

        const headers = {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        };

        const resProductos = await fetch('http://localhost:8000/productos/', { headers });
        const resVentas = await fetch('http://localhost:8000/ventas/', { headers });
        const resCompras = await fetch('http://localhost:8000/compras/', { headers });

        if (!resProductos.ok || !resVentas.ok || !resCompras.ok) {
          if (resProductos.status === 401 || resVentas.status === 401 || resCompras.status === 401) {
            localStorage.clear();
            navigate('/login');
            return;
          }
          throw new Error('Error al conectar con las APIs');
        }

        const productos = await resProductos.json();
        const ventas = await resVentas.json();
        const compras = await resCompras.json();

        // === 1. PROCESAMIENTO DE PRODUCTOS Y ALERTAS ===
        const productosCriticos = productos.filter(p => p.stock <= (p.stock_minimo || 10));
        
        // === 2. PROCESAMIENTO DE LA DONA UTILIZANDO LOS IDs DE TU SQL ===
        const conteoCategorias = {};
        productos.forEach(p => {
          const catNombre = CATEGORIAS_MAP[p.categoria_id] || 'Otros';
          conteoCategorias[catNombre] = (conteoCategorias[catNombre] || 0) + 1;
        });

        const totalProds = productos.length || 1;
        const graficoPieData = Object.keys(conteoCategorias).map((key, index) => {
          const porcentaje = Math.round((conteoCategorias[key] / totalProds) * 100);
          return {
            name: `${key} (${porcentaje}%)`,
            value: conteoCategorias[key],
            color: COLORS[index % COLORS.length]
          };
        });

        // === 3. PROCESAMIENTO DE VENTAS DEL DÍA ===
        // OJO: antes se comparaba con new Date().toISOString(), que SIEMPRE da la fecha en UTC.
        // Como Perú es UTC-5, pasadas ciertas horas de la tarde la fecha en UTC ya es "mañana",
        // y el startsWith() nunca coincidía con las ventas guardadas en hora local -> siempre daba S/ 0.
        // Ahora comparamos año/mes/día en hora LOCAL del navegador, que es lo correcto.
        const ahora = new Date();
        const esMismoDiaLocal = (fechaStr) => {
          const d = new Date(fechaStr);
          return (
            d.getFullYear() === ahora.getFullYear() &&
            d.getMonth() === ahora.getMonth() &&
            d.getDate() === ahora.getDate()
          );
        };
        const totalVendidoHoy = ventas
          .filter(v => v.fecha && esMismoDiaLocal(v.fecha))
          .reduce((sum, v) => sum + (parseFloat(v.total) || 0), 0);

        // === COMPRAS PENDIENTES (antes hardcodeado en 0, ahora viene de /compras/) ===
        const comprasPendientesCount = compras.filter(
          c => (c.estado || '').toLowerCase() === 'pendiente'
        ).length;

        // === 4. CONFIGURACIÓN DE GRÁFICO SEMANAL ===
        // OJO: antes esto sumaba TODAS las ventas del historial agrupadas por nombre de día
        // (ej. la barra "Lun" era la suma de TODOS los lunes desde que existe el sistema),
        // sin filtrar por semana. Ahora sí se limita a la semana actual (lunes a domingo).
        const getInicioSemana = (fecha) => {
          const d = new Date(fecha);
          const dia = d.getDay(); // 0 = domingo, 1 = lunes, ...
          const diffHastaLunes = dia === 0 ? -6 : 1 - dia;
          d.setDate(d.getDate() + diffHastaLunes);
          d.setHours(0, 0, 0, 0);
          return d;
        };
        const inicioSemana = getInicioSemana(ahora);
        const finSemana = new Date(inicioSemana);
        finSemana.setDate(finSemana.getDate() + 7);

        const diasSemana = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
        const ventasPorDia = { Lun: 0, Mar: 0, Mié: 0, Jue: 0, Vie: 0, Sáb: 0, Dom: 0 };

        ventas.forEach(v => {
          if (v.fecha) {
            const fechaVenta = new Date(v.fecha);
            if (fechaVenta >= inicioSemana && fechaVenta < finSemana) {
              const diaNombre = diasSemana[fechaVenta.getDay()];
              if (ventasPorDia[diaNombre] !== undefined) {
                ventasPorDia[diaNombre] += (parseFloat(v.total) || 0);
              }
            }
          }
        });

        const graficoBarData = Object.keys(ventasPorDia).map(key => ({
          name: key,
          ventas: ventasPorDia[key]
        }));

        setMetrics({
          totalProductos: productos.length,
          ventasHoy: totalVendidoHoy,
          alertasStock: productosCriticos.length,
          comprasPendientes: comprasPendientesCount
        });

        setAlertasStockTable(productosCriticos.slice(0, 4));
        setBarData(graficoBarData);
        setPieData(graficoPieData);
        setLoading(false);

      } catch (error) {
        console.error("Error cargando dashboard:", error);
        setLoading(false);
      }
    };

    fetchRealData();
  }, [navigate]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', minHeight: '400px' }}>
        <h3 style={{ fontFamily: 'sans-serif', color: '#f97316' }}>Cargando datos del almacén...</h3>
      </div>
    );
  }

  return (
    // Quitamos la envoltura flex con el sidebar viejo y dejamos solo el área de scroll/contenido
    <div style={{ width: '100%', height: '100%', boxSizing: 'border-box' }}>
      <div style={styles.pageHeader}>
        <h1 style={styles.pageTitle}>Dashboard</h1>
        <p style={styles.pageSubtitle}>Datos directos del sistema</p>
      </div>

      {/* METRICS GRID */}
      <div style={styles.metricsGrid}>
        <div style={styles.metricCard}>
          <div style={styles.metricMeta}>
            <p style={styles.metricTitle}>Total Productos</p>
            <p style={styles.metricValue}>{metrics.totalProductos}</p>
            <p style={styles.metricChange}>En base de datos</p>
          </div>
          <div style={styles.metricIconBox('#eff6ff')}><Package size={20} color="#3b82f6" /></div>
        </div>

        <div style={styles.metricCard}>
          <div style={styles.metricMeta}>
            <p style={styles.metricTitle}>Ventas Hoy</p>
            <p style={styles.metricValue}>S/ {metrics.ventasHoy.toFixed(2)}</p>
            <p style={{ ...styles.metricChange, color: '#16a34a' }}>Caja diaria activa</p>
          </div>
          <div style={styles.metricIconBox('#f0fdf4')}><CircleDollarSign size={20} color="#22c55e" /></div>
        </div>

        <div style={styles.metricCard}>
          <div style={styles.metricMeta}>
            <p style={styles.metricTitle}>Alertas de Stock</p>
            <p style={styles.metricValue}>{metrics.alertasStock}</p>
            <p style={{ ...styles.metricChange, color: metrics.alertasStock > 0 ? '#dc2626' : '#64748b' }}>Por debajo del mínimo</p>
          </div>
          <div style={styles.metricIconBox('#fff7ed')}><AlertTriangle size={20} color="#f97316" /></div>
        </div>

        <div style={styles.metricCard}>
          <div style={styles.metricMeta}>
            <p style={styles.metricTitle}>Compras Pendientes</p>
            <p style={styles.metricValue}>{metrics.comprasPendientes}</p>
            <p style={styles.metricChange}>Órdenes de compra</p>
          </div>
          <div style={styles.metricIconBox('#faf5ff')}><ShoppingCart size={20} color="#a855f7" /></div>
        </div>
      </div>

      {/* CHARTS SECTION */}
      <div style={styles.chartsSection}>
        <div style={styles.chartCard}>
          <h3 style={styles.chartTitle}>Flujo de Ventas Semanal</h3>
          <div style={{ width: '100%', height: '220px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: '#f8fafc' }} />
                <Bar dataKey="ventas" fill="#f97316" borderRadius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={styles.chartCard}>
          <h3 style={styles.chartTitle}>Por categoría</h3>
          <div style={{ width: '100%', height: '160px', position: 'relative' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData.length > 0 ? pieData : [{ name: 'Sin Datos', value: 1, color: '#cbd5e1' }]} cx="50%" cy="50%" innerRadius={45} outerRadius={65} paddingAngle={3} dataKey="value">
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '10px', fontSize: '11px', color: '#475569' }}>
            {pieData.map((x, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: x.color }} />
                {x.name}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CRITICAL STOCK TABLE */}
      <div style={styles.tableCard}>
        <div style={styles.tableHeaderWrapper}>
          <h3 style={{ ...styles.chartTitle, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={18} color="#ea580c" /> Productos Críticos en Almacén
          </h3>
          <span style={styles.tableBadge}>{alertasStockTable.length} ítems</span>
        </div>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Producto</th>
              <th style={styles.th}>Categoría</th>
              <th style={styles.th}>Stock Actual</th>
              <th style={styles.th}>Mínimo Requerido</th>
            </tr>
          </thead>
          <tbody>
            {alertasStockTable.length === 0 ? (
              <tr>
                <td colSpan="4" style={{ ...styles.td, textAlign: 'center', color: '#64748b' }}>Excelente: Todos tus azulejos y mayólicas están abastecidos.</td>
              </tr>
            ) : (
              alertasStockTable.map((prod, index) => (
                <tr key={index}>
                  <td style={styles.td}><strong>{prod.nombre}</strong></td>
                  <td style={styles.td}>{CATEGORIAS_MAP[prod.categoria_id] || 'Otros'}</td>
                  <td style={{ ...styles.td, color: '#dc2626', fontWeight: '600' }}>{prod.stock} cajas</td>
                  <td style={styles.td}>{prod.stock_minimo}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default InventoryDashboard;