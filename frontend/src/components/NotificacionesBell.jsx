import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, AlertTriangle, PackageX } from 'lucide-react';
import { apiFetch } from '../utils/api';

const NotificacionesBell = () => {
  const navigate = useNavigate();
  const [abierto, setAbierto] = useState(false);
  const [alertas, setAlertas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const contenedorRef = useRef(null);

  const cargarAlertas = async () => {
    try {
      setCargando(true);
      const productos = await apiFetch('/productos/');
      const criticos = productos
        .filter((p) => p.stock <= (p.stock_minimo || 10))
        .sort((a, b) => a.stock - b.stock);
      setAlertas(criticos);
    } catch (err) {
      console.error('Error cargando alertas:', err);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarAlertas();
    // Refresca cada 2 minutos para que la campanita no se quede desactualizada
    // mientras el usuario tiene el dashboard abierto.
    const intervalo = setInterval(cargarAlertas, 120000);
    return () => clearInterval(intervalo);
  }, []);

  // Cierra el dropdown si el usuario hace clic afuera.
  useEffect(() => {
    const handleClickFuera = (e) => {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target)) {
        setAbierto(false);
      }
    };
    document.addEventListener('mousedown', handleClickFuera);
    return () => document.removeEventListener('mousedown', handleClickFuera);
  }, []);

  const irAProducto = () => {
    setAbierto(false);
    navigate('/productos');
  };

  return (
    <div ref={contenedorRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setAbierto((prev) => !prev)}
        style={{
          position: 'relative',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '4px',
          display: 'flex',
          alignItems: 'center',
        }}
        title="Alertas de stock"
      >
        <Bell size={20} color="#64748b" />
        {alertas.length > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '-2px',
              right: '-2px',
              backgroundColor: '#dc2626',
              color: '#fff',
              fontSize: '10px',
              fontWeight: 700,
              minWidth: '16px',
              height: '16px',
              borderRadius: '999px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 3px',
            }}
          >
            {alertas.length > 99 ? '99+' : alertas.length}
          </span>
        )}
      </button>

      {abierto && (
        <div
          style={{
            position: 'absolute',
            top: '32px',
            right: 0,
            width: '320px',
            maxHeight: '380px',
            backgroundColor: '#fff',
            borderRadius: '12px',
            boxShadow: '0 12px 32px rgba(15, 23, 42, 0.18)',
            border: '1px solid #e2e8f0',
            overflow: 'hidden',
            zIndex: 1300,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ padding: '12px 14px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: '13.5px', color: '#1e293b' }}>Alertas de stock</strong>
            <span style={{ fontSize: '11.5px', color: '#94a3b8' }}>{alertas.length} producto(s)</span>
          </div>

          <div style={{ overflowY: 'auto' }}>
            {cargando ? (
              <div style={{ padding: '20px', textAlign: 'center', fontSize: '12.5px', color: '#94a3b8' }}>Cargando...</div>
            ) : alertas.length === 0 ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: '#94a3b8' }}>
                <PackageX size={22} style={{ marginBottom: '6px' }} />
                <div style={{ fontSize: '12.5px' }}>Todo tu stock está en niveles saludables.</div>
              </div>
            ) : (
              alertas.map((p) => {
                const agotado = p.stock === 0;
                return (
                  <div
                    key={p.id}
                    onClick={irAProducto}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '10px 14px',
                      borderBottom: '1px solid #f8fafc',
                      cursor: 'pointer',
                    }}
                  >
                    <AlertTriangle size={16} color={agotado ? '#dc2626' : '#d97706'} style={{ flexShrink: 0 }} />
                    <div style={{ minWidth: 0, flexGrow: 1 }}>
                      <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {p.nombre}
                      </div>
                      <div style={{ fontSize: '11px', color: agotado ? '#dc2626' : '#d97706' }}>
                        {agotado ? 'Sin stock' : `Quedan ${p.stock} ${p.unidad}(s)`} · mín. {p.stock_minimo}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificacionesBell;