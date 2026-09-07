import React, { useState } from 'react';
import { User, ShieldAlert, Boxes, ArrowRight } from 'lucide-react';
import { styles } from './Login.styles';
import { useNavigate } from 'react-router-dom';

const Login = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // Paso 1: Roles, Paso 2: Formulario
  const [selectedRole, setSelectedRole] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorLogin, setErrorLogin] = useState('');

  const handleSelectRole = (role) => {
    setSelectedRole(role);
    setStep(2);
  };

  const [enviando, setEnviando] = useState(false);

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setEnviando(true);
    setErrorLogin('');

    try {
      const response = await fetch('http://localhost:8000/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMsg = data.detail ? (typeof data.detail === 'object' ? JSON.stringify(data.detail) : data.detail) : 'Error de autenticación';
        throw new Error(errorMsg);
      }

      const rolBackend = data.usuario.rol;
      const rolEsperado = selectedRole === 'Admin' ? 'admin' : selectedRole === 'Vendedor' ? 'vendedor' : 'almacen';

      if (rolBackend !== rolEsperado) {
        setErrorLogin(`Esta cuenta no tiene el rol de "${selectedRole}". Selecciona el rol correcto para ingresar.`);
        setEnviando(false);
        return;
      }

      localStorage.setItem('token', data.access_token);
      localStorage.setItem('role', rolBackend);
      localStorage.setItem('nombre', data.usuario.nombre);
      navigate('/dashboard');

    } catch (error) {
      setErrorLogin(error.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div style={styles.container}>

      {/* ================= SECCIÓN IZQUIERDA ================= */}
      <div style={{ ...styles.leftPanel, display: 'flex', flexDirection: 'column' }}>
  <div>
    <div style={styles.brandContainer}>
      <div style={styles.logoMini}>J&S</div>
      <span style={styles.brandName}>Acabados J&S</span>
    </div>

    <div style={styles.mainHeroText}>
      <h1 style={styles.heroTitle}>
        Gestión de inventario
        <span style={styles.heroHighlight}>inteligente</span>
      </h1>
      <p style={styles.heroDescription}>
        Control completo de tus mayólicas, azulejos, fraguas y pegamentos — desde una sola pantalla.
      </p>
    </div>
  </div>

  {/* Ilustración de marca, centrada en el espacio restante */}
  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start' }}>
    <style>{`
      @keyframes flotar {
        0%, 100% { transform: translateY(0px); }
        50% { transform: translateY(-6px); }
      }
      .caja-acento { animation: flotar 3s ease-in-out infinite; transform-origin: center; }
    `}</style>
    <svg viewBox="0 0 400 240" width="100%" style={{ maxWidth: 340, display: 'block' }}>
      <defs>
        <radialGradient id="glowNaranja" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#F97316" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#F97316" stopOpacity="0" />
        </radialGradient>
      </defs>

      <ellipse cx="200" cy="222" rx="150" ry="14" fill="rgba(0,0,0,0.25)" />
      <circle cx="310" cy="188" r="55" fill="url(#glowNaranja)" />

      {/* Caja apilada - inferior */}
      <polygon points="45,163 90,176 90,210 45,197" fill="#C9C2B0" />
      <polygon points="90,176 135,163 135,197 90,210" fill="#A89F89" />
      <polygon points="90,150 135,163 90,176 45,163" fill="#EDE8DD" />

      {/* Caja apilada - superior */}
      <polygon points="45,103 90,116 90,150 45,137" fill="#C9C2B0" />
      <polygon points="90,116 135,103 135,137 90,150" fill="#A89F89" />
      <polygon points="90,90 135,103 90,116 45,103" fill="#EDE8DD" />

      {/* Caja del medio */}
      <polygon points="165,163 210,176 210,210 165,197" fill="#C9C2B0" />
      <polygon points="210,176 255,163 255,197 210,210" fill="#A89F89" />
      <polygon points="210,150 255,163 210,176 165,163" fill="#EDE8DD" />

      {/* Caja acento naranja - con animación */}
      <g className="caja-acento">
        <polygon points="275,175 310,185 310,211 275,201" fill="#EA8F3C" />
        <polygon points="310,185 345,175 345,201 310,211" fill="#D9770F" />
        <polygon points="310,165 345,175 310,185 275,175" fill="#FDBA74" />
      </g>
    </svg>

    <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 16, maxWidth: 300 }}>
      Cada caja que entra o sale queda registrada — sin hojas de cálculo, sin sorpresas de stock.
    </p>
  </div>
</div>

      {/* ================= SECCIÓN DERECHA ================= */}
      <div style={styles.rightPanel}>
        <div style={styles.centralBox}>

          <div style={styles.logoBig}>J&S</div>
          <h2 style={styles.welcomeTitle}>Bienvenido</h2>
          <p style={styles.welcomeSubtitle}>Sistema de gestión — Acabados J&S</p>

          {/* PASO 1: Selección de Rol */}
          {step === 1 && (
            <div>
              <p style={styles.questionText}>¿Con qué rol ingresas hoy?</p>

              <button style={styles.roleButton} onClick={() => handleSelectRole('Admin')}>
                <div style={styles.roleIconWrapper}>
                  <User size={20} color="#112e51" />
                </div>
                <div style={styles.roleTextWrapper}>
                  <p style={styles.roleName}>Administrador</p>
                  <p style={styles.roleDesc}>Acceso completo a todos los módulos</p>
                </div>
                <ArrowRight size={16} color="#cbd5e1" />
              </button>

              <button style={styles.roleButton} onClick={() => handleSelectRole('Vendedor')}>
                <div style={styles.roleIconWrapper}>
                  <ShieldAlert size={20} color="#112e51" />
                </div>
                <div style={styles.roleTextWrapper}>
                  <p style={styles.roleName}>Vendedor</p>
                  <p style={styles.roleDesc}>POS, productos y ventas</p>
                </div>
                <ArrowRight size={16} color="#cbd5e1" />
              </button>

              <button style={styles.roleButton} onClick={() => handleSelectRole('Almacen')}>
                <div style={styles.roleIconWrapper}>
                  <Boxes size={20} color="#112e51" />
                </div>
                <div style={styles.roleTextWrapper}>
                  <p style={styles.roleName}>Almacén</p>
                  <p style={styles.roleDesc}>Inventario, productos y compras</p>
                </div>
                <ArrowRight size={16} color="#cbd5e1" />
              </button>
            </div>
          )}

          {/* PASO 2: Inputs de Login */}
          {step === 2 && (
            <form onSubmit={handleLoginSubmit}>
              <button type="button" style={styles.backButton} onClick={() => { setStep(1); setErrorLogin(''); }}>
                ← Cambiar rol
              </button>

              <div style={styles.roleIndicator}>
                Ingresando Como: <strong>{selectedRole}</strong>
              </div>

              {errorLogin && (
                <div style={styles.errorBanner}>
                  {errorLogin}
                </div>
              )}

              <div style={styles.inputGroup}>
                <label style={styles.label}>Correo electrónico</label>
                <input
                  type="email"
                  placeholder="usuario@acabadosjs.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={styles.input}
                  required
                />
              </div>

              <div style={styles.inputGroup}>
                <label style={styles.label}>Contraseña</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={styles.input}
                  required
                />
              </div>
              <button type="submit" disabled={enviando} style={{ ...styles.submitButton, opacity: enviando ? 0.7 : 1 }}>
                {enviando ? 'Ingresando...' : 'Ingresar al sistema'}
              </button>
            </form>
          )}

          <p style={{ textAlign: 'center', marginTop: '18px', fontSize: '13px', color: '#94a3b8' }}>
            ¿Eres cliente?{' '}
            <span
              style={{ color: '#f97316', fontWeight: 600, cursor: 'pointer' }}
              onClick={() => navigate('/tienda')}
            >
              Visita nuestra tienda online
            </span>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;