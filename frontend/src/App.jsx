import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './views/auth/Login';
import DashboardLayout from './components/DashboardLayout';
import InventoryDashboard from './views/dashboard/InventoryDashboard';
import Productos from './views/dashboard/Productos';
import Inventario from './views/dashboard/Inventario';
import Compras from './views/dashboard/Compras';
import Ventas from './views/dashboard/Ventas';
import Reportes from './views/dashboard/Reportes';
import Usuarios from './views/dashboard/Usuarios';
import Catalogos from './views/dashboard/Catalogos';
import { CarritoProvider } from './context/CarritoContext';
import TiendaLayout from './views/tienda/TiendaLayout';
import Catalogo from './views/tienda/Catalogo';
import ProductoDetalle from './views/tienda/ProductoDetalle';
import Checkout from './views/tienda/Checkout';
import CompetenciaView from './views/dashboard/CompetenciaView';

// 1️⃣ NUEVA IMPORTACIÓN DE GUÍAS DE REMISIÓN
import GuiasRemision from './views/dashboard/GuiasRemision'; 

// Protege rutas privadas mediante Token
const PrivateRoute = ({ children }) => {
  const token = localStorage.getItem('token');
  return token ? children : <Navigate replace to="/login" />;
};

// Protege rutas exclusivas de un rol (ej. Reportes y Usuarios solo para admin)
const RequireRole = ({ role, children }) => {
  const userRole = localStorage.getItem('role');
  return userRole === role ? children : <Navigate replace to="/dashboard" />;
};

const ExcludeRole = ({ roles, children }) => {
  const userRole = localStorage.getItem('role');
  return roles.includes(userRole) ? <Navigate replace to="/dashboard" /> : children;
};

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />

        {/* Tienda pública: sin login, para clientes finales */}
        <Route
          path="/tienda"
          element={
            <CarritoProvider>
              <TiendaLayout />
            </CarritoProvider>
          }
        >
          <Route index element={<Catalogo />} />
          <Route path="producto/:id" element={<ProductoDetalle />} />
          <Route path="checkout" element={<Checkout />} />
        </Route>

        <Route path="/" element={<PrivateRoute><DashboardLayout /></PrivateRoute>}>
          <Route index element={<Navigate replace to="/dashboard" />} />

          <Route path="dashboard" element={<InventoryDashboard />} />
          <Route path="productos" element={<Productos />} />
          <Route path="inventario" element={<Inventario />} />
          <Route path="compras" element={<Compras />} />
          <Route path="ventas" element={<ExcludeRole roles={['almacen']}><Ventas /></ExcludeRole>} />
          
          {/* 2️⃣ NUEVA RUTA PROTEGIDA PARA LAS GUÍAS */}
          <Route path="guias" element={<GuiasRemision />} /> 
          
          <Route path="catalogos" element={<Catalogos />} />
          <Route path="competencia" element={<CompetenciaView />} />
          <Route path="reportes" element={<RequireRole role="admin"><Reportes /></RequireRole>} />
          <Route path="usuarios" element={<RequireRole role="admin"><Usuarios /></RequireRole>} />
        </Route>

        <Route path="*" element={<Navigate replace to="/login" />} />
      </Routes>
    </Router>
  );
}

export default App;