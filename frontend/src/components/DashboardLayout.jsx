import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { styles } from '../views/dashboard/InventoryDashboard.styles'; 
import { 
  LayoutDashboard, Package, Boxes, ShoppingCart, 
  CircleDollarSign, BarChart3, Users, LogOut, 
  AlertTriangle, Clock, DollarSign, BookMarked
} from 'lucide-react';
import { apiFetch } from '../utils/api';
import NotificacionesBell from './NotificacionesBell';

const DashboardLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [alertasCount, setAlertasCount] = useState(0);
  const [horaActual, setHoraActual] = useState(new Date());

  // Estado del Inventario (Activo / En Auditoría / Operativo)
  const [inventarioActivo] = useState(true);

  const userRole = (localStorage.getItem('role') || 'admin').toLowerCase();
  const userNombre = localStorage.getItem('nombre') || 'Usuario';
  const userInicial = userNombre.charAt(0).toUpperCase();

  // 1. Reloj en tiempo real
  useEffect(() => {
    const timer = setInterval(() => {
      setHoraActual(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 2. Alertas de stock rápidas
  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const productos = await apiFetch('/productos/');
        const criticos = productos.filter(p => p.stock <= (p.stock_minimo || 10));
        setAlertasCount(criticos.length);
      } catch (e) { console.error(e); }
    };
    fetchAlerts();
  }, []);

  const handleLogout = () => {
    localStorage.clear();
    navigate('/login');
  };

  const isActive = (path) => location.pathname === path;

  // Formato para la hora (HH:MM:SS AM/PM)
  const horaFormateada = horaActual.toLocaleTimeString('es-PE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });

  return (
    <div style={styles.container}>
      {/* SIDEBAR FIJO */}
      <div style={styles.sidebar}>
        <div>
          <div style={styles.brandSection}>
            <h3 style={styles.brandTitle}>Acabados J&S</h3>
            <p style={styles.brandSubtitle}>Gestión de inventario</p>
          </div>
          <nav style={styles.menuList}>
            <div style={styles.menuItem(isActive('/dashboard'))} onClick={() => navigate('/dashboard')}>
              <LayoutDashboard size={18} /> Dashboard
            </div>
            <div style={styles.menuItem(isActive('/productos'))} onClick={() => navigate('/productos')}>
              <Package size={18} /> Productos
            </div>
            <div style={styles.menuItem(isActive('/inventario'))} onClick={() => navigate('/inventario')}>
              <Boxes size={18} /> Inventario
            </div>
            <div style={styles.menuItem(isActive('/compras'))} onClick={() => navigate('/compras')}>
              <ShoppingCart size={18} /> Compras
            </div>
            {userRole !== 'almacen' && (
              <div style={styles.menuItem(isActive('/ventas'))} onClick={() => navigate('/ventas')}>
                <CircleDollarSign size={18} /> Ventas / POS
              </div>
            )}
            <div style={styles.menuItem(isActive('/catalogos'))} onClick={() => navigate('/catalogos')}>
              <BookMarked size={18} /> Catálogos
            </div>
            <div style={styles.menuItem(isActive('/competencia'))} onClick={() => navigate('/competencia')}>
              <CircleDollarSign size={18} /> Competencia
            </div>

            {userRole === 'admin' && (
              <>
                <div style={styles.menuItem(isActive('/reportes'))} onClick={() => navigate('/reportes')}>
                  <BarChart3 size={18} /> Reportes
                </div>
                <div style={styles.menuItem(isActive('/usuarios'))} onClick={() => navigate('/usuarios')}>
                  <Users size={18} /> Usuarios
                </div>
              </>
            )}
          </nav>
        </div>
        <div style={styles.logoutItem} onClick={handleLogout}>
          <LogOut size={18} />
          <span>Cerrar sesión</span>
        </div>
      </div>

      {/* CONTENIDO DERECHO */}
      <div style={styles.mainContent}>
        {/* TOPBAR */}
        <div style={{ ...styles.topbar, justifyContent: 'space-between' }}>
          
          {/* LADO IZQUIERDO: Reloj, Estado del Inventario y TC */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            
            {/* Reloj Digital */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: '#f8fafc',
              border: '1px solid #e2e8f0',
              padding: '6px 12px',
              borderRadius: '8px',
              color: '#334155',
              fontWeight: 600,
              fontSize: '0.85rem',
              letterSpacing: '0.5px'
            }}>
              <Clock size={15} color="#3b82f6" />
              <span>{horaFormateada}</span>
            </div>

            {/* Separador Elegante */}
            <div style={{ width: '1px', height: '20px', backgroundColor: '#cbd5e1' }} />

            {/* Estado del Inventario */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: inventarioActivo ? '#f0fdf4' : '#fff7ed',
              border: `1px solid ${inventarioActivo ? '#bbf7d0' : '#fed7aa'}`,
              padding: '6px 12px',
              borderRadius: '8px',
              fontSize: '0.80rem',
              fontWeight: 600,
              color: inventarioActivo ? '#166534' : '#c2410c'
            }}>
              <Boxes size={15} color={inventarioActivo ? '#16a34a' : '#ea580c'} />
              <span>Inventario: {inventarioActivo ? 'Operativo' : 'En Arqueo'}</span>
              <span style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: inventarioActivo ? '#22c55e' : '#f97316',
                display: 'inline-block'
              }} />
            </div>

            {/* Separador Elegante */}
            <div style={{ width: '1px', height: '20px', backgroundColor: '#cbd5e1' }} />

            {/* Tipo de Cambio */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: '#fefce8',
              border: '1px solid #fef08a',
              padding: '6px 12px',
              borderRadius: '8px',
              fontSize: '0.80rem',
              fontWeight: 600,
              color: '#854d0e'
            }}>
              <DollarSign size={15} color="#ca8a04" />
              <span>TC: <b>S/ 3.75</b></span>
            </div>

          </div>

          {/* LADO DERECHO: Alertas, Notificaciones y Perfil */}
          <div style={styles.topbarRight}>
            {alertasCount > 0 && (
              <div style={styles.alertBadge}>
                <AlertTriangle size={14} color="#ea580c" />
                <span>{alertasCount} alertas de stock</span>
              </div>
            )}
            <NotificacionesBell />
            <div style={styles.userProfile}>
              <div style={styles.avatar}>{userInicial}</div>
              <div style={styles.userData}>
                <span style={styles.userName}>{userNombre}</span>
                <span style={styles.userRole}>{userRole}</span>
              </div>
            </div>
          </div>

        </div>

        {/* CONTENIDO INTERNO */}
        <div style={styles.scrollArea}>
          <Outlet />
        </div>
      </div>

    </div>
  );
};

export default DashboardLayout;