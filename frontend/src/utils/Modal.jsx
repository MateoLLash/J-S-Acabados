import React from 'react';
import { X } from 'lucide-react';

// Modal genérico reutilizado por Productos, Inventario, Compras, Ventas y Usuarios.
const Modal = ({ title, onClose, children, width = '480px' }) => {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        fontFamily: 'sans-serif',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: '#fff',
          borderRadius: '12px',
          width,
          maxWidth: '92vw',
          maxHeight: '88vh',
          overflowY: 'auto',
          boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '18px 22px',
            borderBottom: '1px solid #e2e8f0',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#1e293b' }}>{title}</h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 4 }}
          >
            <X size={20} />
          </button>
        </div>
        <div style={{ padding: '22px' }}>{children}</div>
      </div>
    </div>
  );
};

export const inputStyle = {
  width: '100%',
  padding: '9px 12px',
  border: '1px solid #cbd5e1',
  borderRadius: '6px',
  fontSize: '14px',
  boxSizing: 'border-box',
  marginTop: '4px',
};

export const labelStyle = {
  fontSize: '12px',
  fontWeight: 600,
  color: '#475569',
  display: 'block',
  marginTop: '12px',
};

export const primaryButtonStyle = {
  backgroundColor: '#1e3a8a',
  color: '#fff',
  border: 'none',
  padding: '10px 18px',
  borderRadius: '6px',
  fontWeight: '600',
  cursor: 'pointer',
  fontSize: '14px',
};

export const secondaryButtonStyle = {
  backgroundColor: '#f1f5f9',
  color: '#334155',
  border: 'none',
  padding: '10px 18px',
  borderRadius: '6px',
  fontWeight: '600',
  cursor: 'pointer',
  fontSize: '14px',
};

export default Modal;