import React, { useState, useEffect } from 'react';
import { Plus, XCircle, CheckCircle } from 'lucide-react';
import { apiFetch } from '../../utils/api';
import Modal, { inputStyle, labelStyle, primaryButtonStyle, secondaryButtonStyle } from '../../utils/Modal';

const FORM_VACIO = { nombre: '', email: '', password: '', rol: 'vendedor' };

const Usuarios = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [modalAbierto, setModalAbierto] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [formError, setFormError] = useState('');

  const cargarUsuarios = async () => {
    try {
      setLoading(true);
      const data = await apiFetch('/usuarios/');
      setUsers(data);
      setError('');
    } catch (err) {
      console.error('Error cargando usuarios:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarUsuarios();
  }, []);

  const totalUsuarios = users.length;
  const totalAdmins = users.filter((u) => u.rol === 'admin').length;
  const totalActivos = users.filter((u) => u.estado === 'activo').length;

  const abrirNuevo = () => {
    setForm(FORM_VACIO);
    setFormError('');
    setModalAbierto(true);
  };

  const handleGuardar = async (e) => {
    e.preventDefault();
    setGuardando(true);
    setFormError('');
    try {
      await apiFetch('/usuarios/', { method: 'POST', body: JSON.stringify(form) });
      setModalAbierto(false);
      cargarUsuarios();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const handleToggleEstado = async (user) => {
    const nuevoEstado = user.estado === 'activo' ? 'inactivo' : 'activo';
    const verbo = nuevoEstado === 'activo' ? 'activar' : 'desactivar';
    if (!window.confirm(`¿Seguro que quieres ${verbo} a "${user.nombre}"?`)) return;
    try {
      await apiFetch(`/usuarios/${user.id}/estado?estado=${nuevoEstado}`, { method: 'PATCH' });
      cargarUsuarios();
    } catch (err) {
      alert(`No se pudo actualizar el estado: ${err.message}`);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <h3 style={{ fontFamily: 'sans-serif', color: '#f97316' }}>Cargando usuarios...</h3>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '20px', fontFamily: 'sans-serif' }}>

      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '700', color: '#1e293b' }}>Gestión de Usuarios</h1>
          <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: '#64748b' }}>Acceso exclusivo para administradores</p>
        </div>
        <button onClick={abrirNuevo} style={{ backgroundColor: '#1e3a8a', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: '6px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px' }}>
          <Plus size={16} /> Nuevo usuario
        </button>
      </div>

      {error && (
        <div style={{ backgroundColor: '#fef2f2', color: '#b91c1c', padding: '10px 16px', borderRadius: '8px', fontSize: '13px' }}>
          {error}
        </div>
      )}

      {/* MINI CARDS DE ESTADOS */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
        <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ backgroundColor: '#eff6ff', padding: '10px', borderRadius: '8px', color: '#3b82f6', fontWeight: '700' }}>👤</div>
          <div>
            <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8', fontWeight: '600' }}>Total usuarios</p>
            <h3 style={{ margin: '2px 0 0 0', fontSize: '20px', color: '#1e293b', fontWeight: '700' }}>{totalUsuarios}</h3>
          </div>
        </div>
        <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ backgroundColor: '#f5f3ff', padding: '10px', borderRadius: '8px', color: '#7c3aed', fontWeight: '700' }}>🔑</div>
          <div>
            <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8', fontWeight: '600' }}>Administradores</p>
            <h3 style={{ margin: '2px 0 0 0', fontSize: '20px', color: '#1e293b', fontWeight: '700' }}>{totalAdmins}</h3>
          </div>
        </div>
        <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ backgroundColor: '#f0fdf4', padding: '10px', borderRadius: '8px', color: '#16a34a', fontWeight: '700' }}>✅</div>
          <div>
            <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8', fontWeight: '600' }}>Activos</p>
            <h3 style={{ margin: '2px 0 0 0', fontSize: '20px', color: '#1e293b', fontWeight: '700' }}>{totalActivos}</h3>
          </div>
        </div>
      </div>

      {/* TABLA DE USUARIOS */}
      <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: '#fafafa' }}>
              <th style={{ padding: '14px 20px', fontSize: '11px', fontWeight: '600', color: '#94a3b8' }}>USUARIO</th>
              <th style={{ padding: '14px 20px', fontSize: '11px', fontWeight: '600', color: '#94a3b8' }}>EMAIL</th>
              <th style={{ padding: '14px 20px', fontSize: '11px', fontWeight: '600', color: '#94a3b8' }}>ROL</th>
              <th style={{ padding: '14px 20px', fontSize: '11px', fontWeight: '600', color: '#94a3b8' }}>ESTADO</th>
              <th style={{ padding: '14px 20px', fontSize: '11px', fontWeight: '600', color: '#94a3b8' }}>ÚLTIMO ACCESO</th>
              <th style={{ padding: '14px 20px', fontSize: '11px', fontWeight: '600', color: '#94a3b8' }}></th>
            </tr>
          </thead>
          <tbody>
            {users.map((user, idx) => {
              const isAdmin = user.rol === 'admin';
              const isActive = user.estado === 'activo';
              const iniciales = user.nombre ? user.nombre.split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase() : 'U';

              return (
                <tr key={user.id ?? idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: isAdmin ? '#1e3a8a' : '#64748b', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '700' }}>
                      {iniciales}
                    </div>
                    <span style={{ fontSize: '13px', fontWeight: '700', color: '#1e293b' }}>{user.nombre}</span>
                  </td>
                  <td style={{ padding: '14px 20px', fontSize: '13px', color: '#64748b' }}>{user.email}</td>
                  <td style={{ padding: '14px 20px' }}>
                    <span style={{ backgroundColor: isAdmin ? '#eff6ff' : '#f1f5f9', color: isAdmin ? '#2563eb' : '#475569', padding: '4px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', textTransform: 'capitalize' }}>
                      {user.rol}
                    </span>
                  </td>
                  <td style={{ padding: '14px 20px' }}>
                    <span style={{ backgroundColor: isActive ? '#e6f4ea' : '#fce8e6', color: isActive ? '#137333' : '#c5221f', padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '600', textTransform: 'capitalize' }}>
                      {user.estado}
                    </span>
                  </td>
                  <td style={{ padding: '14px 20px', fontSize: '13px', color: '#64748b' }}>{user.ultimo_login ? new Date(user.ultimo_login).toLocaleString('es-PE') : 'No registrado'}</td>
                  <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', opacity: 0.85 }}>
                      {isActive ? (
                        <XCircle size={16} color="#f97316" style={{ cursor: 'pointer' }} onClick={() => handleToggleEstado(user)} title="Desactivar usuario" />
                      ) : (
                        <CheckCircle size={16} color="#16a34a" style={{ cursor: 'pointer' }} onClick={() => handleToggleEstado(user)} title="Activar usuario" />
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modalAbierto && (
        <Modal title="Nuevo usuario" onClose={() => setModalAbierto(false)}>
          <form onSubmit={handleGuardar}>
            {formError && (
              <div style={{ backgroundColor: '#fef2f2', color: '#b91c1c', padding: '8px 12px', borderRadius: '6px', fontSize: '13px', marginBottom: '8px' }}>
                {formError}
              </div>
            )}
            <label style={labelStyle}>Nombre completo</label>
            <input required style={inputStyle} value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />

            <label style={labelStyle}>Email</label>
            <input required type="email" style={inputStyle} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />

            <label style={labelStyle}>Contraseña</label>
            <input required type="password" minLength={6} style={inputStyle} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />

            <label style={labelStyle}>Rol</label>
            <select style={inputStyle} value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value })}>
  <option value="vendedor">Vendedor</option>
  <option value="almacen">Almacén</option>
  <option value="admin">Administrador</option>
</select>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '22px' }}>
              <button type="button" style={secondaryButtonStyle} onClick={() => setModalAbierto(false)}>Cancelar</button>
              <button type="submit" disabled={guardando} style={{ ...primaryButtonStyle, opacity: guardando ? 0.7 : 1 }}>
                {guardando ? 'Guardando...' : 'Crear usuario'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

export default Usuarios;