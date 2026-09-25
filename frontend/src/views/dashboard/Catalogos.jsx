import React, { useState, useEffect, useMemo } from 'react';
import { Tag, Users, Wallet, Truck, Plus, Search, Banknote, CreditCard, Smartphone, Landmark, Mail, Phone, FileText, X, Copy, Check, MapPin, MessageCircle, Hash, User, UserPlus, ChevronRight, RefreshCw } from 'lucide-react';
import { apiFetch } from '../../utils/api';

const FORM_MARCA_VACIO = { nombre: '' };
const FORM_CLIENTE_VACIO = { nombre: '', telefono: '', documento: '', email: '', direccion: '' };
const FORM_PROVEEDOR_VACIO = { nombre: '', contacto: '', telefono: '', email: '' };

// Configuración visual por sección: color de acento, ícono y textos.
const SECCIONES = {
  marcas: { label: 'Marcas', singular: 'marca', Icono: Tag, color: '#1e3a8a' },
  clientes: { label: 'Clientes', singular: 'cliente', Icono: Users, color: '#16a34a' },
  proveedores: { label: 'Proveedores', singular: 'proveedor', Icono: Truck, color: '#d97706' },
  'metodos-pago': { label: 'Métodos de pago', singular: 'método de pago', Icono: Wallet, color: '#7c3aed' },
};

// Colores estables por inicial, para que cada marca/cliente tenga su propio "avatar" de color.
const PALETA_AVATAR = ['#1e3a8a', '#f97316', '#16a34a', '#7c3aed', '#0891b2', '#be123c', '#a16207'];
const colorPorTexto = (texto = '') => {
  const codigo = texto.charCodeAt(0) || 0;
  return PALETA_AVATAR[codigo % PALETA_AVATAR.length];
};

// Ícono según el nombre del método de pago (best-effort, cae en Wallet si no matchea nada).
const iconoMetodoPago = (nombre = '') => {
  const n = nombre.toLowerCase();
  if (n.includes('efectivo')) return Banknote;
  if (n.includes('tarjeta') || n.includes('visa') || n.includes('master')) return CreditCard;
  if (n.includes('yape') || n.includes('plin') || n.includes('transfer')) return Smartphone;
  if (n.includes('deposito') || n.includes('banco')) return Landmark;
  return Wallet;
};

// Origen de los clientes: 'acabados_js' (creados aquí) o 'equipo_kanari' (recibidos del sistema de Lina).
const ORIGENES = {
  acabados_js: { label: 'Propio', title: 'Cliente creado en Acabados J&S', bg: '#f1f5f9', color: '#475569', border: '#e2e8f0' },
  equipo_kanari: { label: 'Kanari', title: 'Recibido del sistema de Lina (equipo Kanari)', bg: '#fff7ed', color: '#c2410c', border: '#fed7aa' },
};

const BadgeOrigen = ({ origen }) => {
  const cfg = ORIGENES[origen] ?? {
    label: origen || 'Sin origen',
    title: origen ? `Origen no reconocido: ${origen}` : 'El backend no devolvió el campo origen',
    bg: '#fef2f2',
    color: '#b91c1c',
    border: '#fecaca',
  };
  return (
    <span
      title={cfg.title}
      style={{
        flexShrink: 0,
        fontSize: '10px',
        fontWeight: '600',
        padding: '2px 7px',
        borderRadius: '999px',
        backgroundColor: cfg.bg,
        color: cfg.color,
        border: `1px solid ${cfg.border}`,
      }}
    >
      {cfg.label}
    </span>
  );
};

// --- Utilidades de detalle (compartidas por los popups) ---

const tipoDocumento = (doc) => {
  const digitos = (doc || '').replace(/\D/g, '');
  if (digitos.length === 8) return 'DNI';
  if (digitos.length === 11) return 'RUC';
  return 'Documento';
};

// Grupo para separar visualmente la lista de clientes: 'DNI', 'RUC', 'otro' (tiene documento
// pero no calza con 8 u 11 dígitos) o 'sin' (no registró documento). No confundir con
// tipoDocumento: esa devuelve la ETIQUETA a mostrar; esta devuelve la CLAVE para agrupar.
const GRUPOS_DOCUMENTO = {
  DNI: { label: 'DNI', color: '#0891b2' },
  RUC: { label: 'RUC', color: '#7c3aed' },
  otro: { label: 'Otro documento', color: '#b45309' },
  sin: { label: 'Sin documento', color: '#94a3b8' },
};
const claveGrupoDocumento = (doc) => {
  const digitos = (doc || '').replace(/\D/g, '');
  if (!digitos) return 'sin';
  if (digitos.length === 8) return 'DNI';
  if (digitos.length === 11) return 'RUC';
  return 'otro';
};

// Solo genera enlace de WhatsApp si el número tiene formato de celular peruano.
const enlaceWhatsApp = (tel) => {
  const d = (tel || '').replace(/\D/g, '');
  if (d.length === 9 && d.startsWith('9')) return `https://wa.me/51${d}`;
  if (d.length === 11 && d.startsWith('519')) return `https://wa.me/${d}`;
  return null;
};
const enlaceLlamada = (tel) => `tel:${(tel || '').replace(/[^\d+]/g, '')}`;

const descripcionOrigen = (origen) =>
  ORIGENES[origen]?.title ?? (origen ? `Origen no reconocido: ${origen}` : 'El backend no devolvió el campo origen');

// Hover, foco por teclado y animación de entrada. La animación respeta "reducir movimiento".
const ESTILOS_CATALOGOS = `
  .stat-card { cursor: pointer; transition: transform .15s, box-shadow .15s, border-color .15s, background-color .15s; font-family: inherit; }
  .stat-card:hover:not(.stat-activa) { transform: translateY(-2px); border-color: #cbd5e1 !important; box-shadow: 0 6px 16px rgba(15, 23, 42, 0.08) !important; }
  .stat-card:focus-visible { outline: 2px solid #1e3a8a; outline-offset: 2px; }
  .tab-pill { transition: background-color .15s, color .15s, border-color .15s, box-shadow .15s; font-family: inherit; }
  .card-catalogo { cursor: pointer; transition: transform .15s, box-shadow .15s, border-color .15s, background-color .15s; }
  .card-catalogo:hover { transform: translateY(-2px); background-color: #fff !important; border-color: var(--acento, #cbd5e1) !important; box-shadow: 0 6px 16px rgba(15, 23, 42, 0.08); }
  .card-catalogo:hover .flecha-card { opacity: 1; transform: translateX(0); }
  .card-catalogo:focus-visible { outline: 2px solid var(--acento, #1e3a8a); outline-offset: 2px; }
  .flecha-card { opacity: 0; transform: translateX(-4px); transition: opacity .15s, transform .15s; }
  .buscador-caja { transition: border-color .15s, box-shadow .15s; }
  .buscador-caja:focus-within { border-color: #1e3a8a !important; box-shadow: 0 0 0 3px rgba(30, 58, 138, 0.10); }
  .buscador-caja input::placeholder { color: #94a3b8; }
  .dato-accion:hover { background-color: #f1f5f9 !important; }
  .campo-caja { transition: border-color .15s, box-shadow .15s; }
  .campo-caja:focus-within { border-color: #1e3a8a !important; box-shadow: 0 0 0 3px rgba(30, 58, 138, 0.12); }
  .campo-caja input::placeholder { color: #cbd5e1; }
  .btn-primario:hover:not(:disabled) { background-color: #1e40af !important; }
  .btn-secundario:hover:not(:disabled) { background-color: #f1f5f9 !important; border-color: #cbd5e1 !important; }
  .btn-nuevo { transition: background-color .15s, box-shadow .15s, transform .12s; box-shadow: 0 1px 3px rgba(30, 58, 138, 0.35); font-family: inherit; }
  .btn-nuevo:hover:not(:disabled) { background-color: #1e40af !important; box-shadow: 0 4px 12px rgba(30, 58, 138, 0.4); transform: translateY(-1px); }
  .btn-nuevo:active:not(:disabled) { transform: translateY(0); }
  .btn-nuevo:focus-visible { outline: 2px solid #1e3a8a; outline-offset: 2px; }
  .btn-actualizar { font-family: inherit; }
  .btn-actualizar:active:not(:disabled) .icono-refresco { transform: rotate(180deg); }
  .icono-refresco { transition: transform .3s; }
  @keyframes girar { to { transform: rotate(360deg); } }
  .spinner { animation: girar .9s linear infinite; }
  .dato-accion:focus-visible { outline: 2px solid #1e3a8a; outline-offset: 1px; }
  .grupo-pill { transition: background-color .15s, color .15s, border-color .15s; font-family: inherit; }
  @keyframes modalAnimIn { from { opacity: 0; transform: translateY(8px) scale(0.98); } to { opacity: 1; transform: none; } }
  .modal-anim { animation: modalAnimIn .18s ease-out; }
  @media (prefers-reduced-motion: reduce) {
    .modal-anim, .spinner, .icono-refresco { animation: none; }
    .stat-card, .card-catalogo, .flecha-card, .btn-nuevo, .tab-pill, .grupo-pill { transition: none; }
  }
`;

const accionStyle = {
  width: '30px',
  height: '30px',
  borderRadius: '8px',
  border: '1px solid #e2e8f0',
  backgroundColor: '#fff',
  color: '#64748b',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  textDecoration: 'none',
  flexShrink: 0,
  padding: 0,
};

const FilaDato = ({ Icono, etiqueta, valor, vacio = 'No registrado', acciones }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 0', borderBottom: '1px solid #f1f5f9' }}>
    <div style={{ width: '34px', height: '34px', borderRadius: '9px', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Icono size={16} color="#475569" />
    </div>
    <div style={{ minWidth: 0, flex: 1 }}>
      <div style={{ fontSize: '11px', color: '#94a3b8' }}>{etiqueta}</div>
      {valor ? (
        <div style={{ fontSize: '14px', color: '#0f172a', fontWeight: '500', wordBreak: 'break-word' }}>{valor}</div>
      ) : (
        <div style={{ fontSize: '13px', color: '#cbd5e1', fontStyle: 'italic' }}>{vacio}</div>
      )}
    </div>
    {valor && acciones && <div style={{ display: 'flex', gap: '6px' }}>{acciones}</div>}
  </div>
);

const useCopiar = () => {
  const [copiado, setCopiado] = useState(null); // { clave, ok }
  const copiarTexto = async (clave, texto) => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado({ clave, ok: true });
    } catch (err) {
      console.error('No se pudo copiar:', err);
      setCopiado({ clave, ok: false });
    }
    setTimeout(() => setCopiado((actual) => (actual?.clave === clave ? null : actual)), 1800);
  };
  return { copiado, copiarTexto };
};

const useCerrarConEscape = (onClose, activo = true) => {
  useEffect(() => {
    if (!activo) return undefined;
    const alPresionar = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  }, [onClose, activo]);
};

const BotonCopiar = ({ clave, texto, copiado, onCopiar }) => {
  const estado = copiado?.clave === clave ? copiado.ok : null;
  const titulo = estado === true ? 'Copiado' : estado === false ? 'No se pudo copiar' : 'Copiar';
  return (
    <button
      type="button"
      className="dato-accion"
      title={titulo}
      aria-label={titulo}
      onClick={() => onCopiar(clave, texto)}
      style={{ ...accionStyle, color: estado === true ? '#16a34a' : estado === false ? '#b91c1c' : '#64748b' }}
    >
      {estado === true ? <Check size={14} /> : estado === false ? <X size={14} /> : <Copy size={14} />}
    </button>
  );
};

// --- Estilos y piezas comunes de los popups ---

const OVERLAY_STYLE = { position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', zIndex: 2000 };

const CAJA_MODAL_STYLE = { width: '100%', maxWidth: '440px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', backgroundColor: '#fff', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 20px 50px rgba(15, 23, 42, 0.3)', fontFamily: 'sans-serif' };

const CABECERA_OSCURA_STYLE = { position: 'relative', backgroundColor: '#0f172a', padding: '22px 24px', display: 'flex', alignItems: 'flex-start', gap: '14px' };

const AVATAR_GRANDE = { width: '52px', height: '52px', borderRadius: '14px', color: '#fff', fontWeight: '700', fontSize: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };

const TITULO_MODAL_STYLE = { margin: 0, fontSize: '19px', fontWeight: '700', color: '#fff', lineHeight: 1.25, wordBreak: 'break-word' };

const SUBTITULO_MODAL_STYLE = { fontSize: '12px', color: '#94a3b8', marginTop: '4px' };

const NOTA_MODAL_STYLE = { display: 'flex', gap: '10px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px', fontSize: '12px', color: '#64748b', margin: '10px 0 6px', lineHeight: 1.4 };

const BotonCerrarOscuro = ({ onClose }) => (
  <button
    type="button"
    onClick={onClose}
    aria-label="Cerrar"
    style={{ position: 'absolute', top: '14px', right: '14px', width: '30px', height: '30px', borderRadius: '8px', border: 'none', backgroundColor: 'rgba(255,255,255,0.12)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}
  >
    <X size={16} />
  </button>
);

const PieDetalle = ({ onClose }) => (
  <div style={{ padding: '14px 24px 18px', display: 'flex', justifyContent: 'flex-end' }}>
    <button type="button" onClick={onClose} style={{ padding: '9px 18px', borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: '#fff', color: '#334155', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
      Cerrar
    </button>
  </div>
);

// --- Detalle de cliente (popup) ---

const DetalleCliente = ({ cliente, onClose }) => {
  const { copiado, copiarTexto } = useCopiar();
  useCerrarConEscape(onClose);

  const botonCopiar = (clave, texto) => (
    <BotonCopiar clave={clave} texto={texto} copiado={copiado} onCopiar={copiarTexto} />
  );

  const whatsapp = enlaceWhatsApp(cliente.telefono);

  return (
    <div onClick={onClose} style={OVERLAY_STYLE}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cliente-detalle-titulo"
        className="modal-anim"
        onClick={(e) => e.stopPropagation()}
        style={CAJA_MODAL_STYLE}
      >
        <div style={CABECERA_OSCURA_STYLE}>
          <div style={{ ...AVATAR_GRANDE, backgroundColor: colorPorTexto(cliente.nombre) }}>
            {cliente.nombre.charAt(0).toUpperCase()}
          </div>
          <div style={{ minWidth: 0, flex: 1, paddingRight: '30px' }}>
            <h2 id="cliente-detalle-titulo" style={TITULO_MODAL_STYLE}>{cliente.nombre}</h2>
            <div style={{ marginTop: '8px' }}>
              <BadgeOrigen origen={cliente.origen} />
            </div>
          </div>
          <BotonCerrarOscuro onClose={onClose} />
        </div>

        <div style={{ padding: '6px 24px 4px', overflowY: 'auto' }}>
          <FilaDato
            Icono={FileText}
            etiqueta={tipoDocumento(cliente.documento)}
            valor={cliente.documento}
            acciones={botonCopiar('documento', cliente.documento)}
          />
          <FilaDato
            Icono={Phone}
            etiqueta="Teléfono"
            valor={cliente.telefono}
            acciones={
              <>
                {botonCopiar('telefono', cliente.telefono)}
                {whatsapp && (
                  <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="dato-accion" title="Abrir en WhatsApp" aria-label="Abrir en WhatsApp" style={{ ...accionStyle, color: '#16a34a' }}>
                    <MessageCircle size={14} />
                  </a>
                )}
                <a href={enlaceLlamada(cliente.telefono)} className="dato-accion" title="Llamar" aria-label="Llamar" style={accionStyle}>
                  <Phone size={14} />
                </a>
              </>
            }
          />
          <FilaDato
            Icono={Mail}
            etiqueta="Correo"
            valor={cliente.email}
            acciones={
              <>
                {botonCopiar('email', cliente.email)}
                <a href={`mailto:${cliente.email}`} className="dato-accion" title="Enviar correo" aria-label="Enviar correo" style={accionStyle}>
                  <Mail size={14} />
                </a>
              </>
            }
          />
          <FilaDato
            Icono={MapPin}
            etiqueta="Dirección"
            valor={cliente.direccion}
            acciones={botonCopiar('direccion', cliente.direccion)}
          />
          <FilaDato Icono={Hash} etiqueta="ID de cliente" valor={`#${cliente.id}`} />
          <FilaDato Icono={Tag} etiqueta="Origen" valor={descripcionOrigen(cliente.origen)} />
        </div>

        <PieDetalle onClose={onClose} />
      </div>
    </div>
  );
};

// --- Detalle de marca (popup) ---

const DetalleMarca = ({ marca, onClose }) => {
  const { copiado, copiarTexto } = useCopiar();
  useCerrarConEscape(onClose);

  return (
    <div onClick={onClose} style={OVERLAY_STYLE}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="marca-detalle-titulo"
        className="modal-anim"
        onClick={(e) => e.stopPropagation()}
        style={CAJA_MODAL_STYLE}
      >
        <div style={CABECERA_OSCURA_STYLE}>
          <div style={{ ...AVATAR_GRANDE, backgroundColor: colorPorTexto(marca.nombre) }}>
            {marca.nombre.charAt(0).toUpperCase()}
          </div>
          <div style={{ minWidth: 0, flex: 1, paddingRight: '30px' }}>
            <h2 id="marca-detalle-titulo" style={TITULO_MODAL_STYLE}>{marca.nombre}</h2>
            <div style={SUBTITULO_MODAL_STYLE}>Marca de productos</div>
          </div>
          <BotonCerrarOscuro onClose={onClose} />
        </div>

        <div style={{ padding: '6px 24px 4px', overflowY: 'auto' }}>
          <FilaDato
            Icono={Tag}
            etiqueta="Nombre de la marca"
            valor={marca.nombre}
            acciones={<BotonCopiar clave="nombre" texto={marca.nombre} copiado={copiado} onCopiar={copiarTexto} />}
          />
          <FilaDato Icono={Hash} etiqueta="ID de marca" valor={`#${marca.id}`} />
          <FilaDato Icono={Users} etiqueta="Uso" valor="Se asigna a los productos del catálogo" />
        </div>

        <PieDetalle onClose={onClose} />
      </div>
    </div>
  );
};

// --- Detalle de proveedor (popup) ---

const DetalleProveedor = ({ proveedor, onClose }) => {
  const { copiado, copiarTexto } = useCopiar();
  useCerrarConEscape(onClose);

  const whatsapp = enlaceWhatsApp(proveedor.telefono);

  return (
    <div onClick={onClose} style={OVERLAY_STYLE}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="proveedor-detalle-titulo"
        className="modal-anim"
        onClick={(e) => e.stopPropagation()}
        style={CAJA_MODAL_STYLE}
      >
        <div style={CABECERA_OSCURA_STYLE}>
          <div style={{ ...AVATAR_GRANDE, backgroundColor: colorPorTexto(proveedor.nombre) }}>
            {proveedor.nombre.charAt(0).toUpperCase()}
          </div>
          <div style={{ minWidth: 0, flex: 1, paddingRight: '30px' }}>
            <h2 id="proveedor-detalle-titulo" style={TITULO_MODAL_STYLE}>{proveedor.nombre}</h2>
            <div style={SUBTITULO_MODAL_STYLE}>Proveedor</div>
          </div>
          <BotonCerrarOscuro onClose={onClose} />
        </div>

        <div style={{ padding: '6px 24px 4px', overflowY: 'auto' }}>
          <FilaDato
            Icono={User}
            etiqueta="Contacto"
            valor={proveedor.contacto}
            acciones={<BotonCopiar clave="contacto" texto={proveedor.contacto} copiado={copiado} onCopiar={copiarTexto} />}
          />
          <FilaDato
            Icono={Phone}
            etiqueta="Teléfono"
            valor={proveedor.telefono}
            acciones={
              <>
                <BotonCopiar clave="telefono" texto={proveedor.telefono} copiado={copiado} onCopiar={copiarTexto} />
                {whatsapp && (
                  <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="dato-accion" title="Abrir en WhatsApp" aria-label="Abrir en WhatsApp" style={{ ...accionStyle, color: '#16a34a' }}>
                    <MessageCircle size={14} />
                  </a>
                )}
                <a href={enlaceLlamada(proveedor.telefono)} className="dato-accion" title="Llamar" aria-label="Llamar" style={accionStyle}>
                  <Phone size={14} />
                </a>
              </>
            }
          />
          <FilaDato
            Icono={Mail}
            etiqueta="Correo"
            valor={proveedor.email}
            acciones={
              <>
                <BotonCopiar clave="email" texto={proveedor.email} copiado={copiado} onCopiar={copiarTexto} />
                <a href={`mailto:${proveedor.email}`} className="dato-accion" title="Enviar correo" aria-label="Enviar correo" style={accionStyle}>
                  <Mail size={14} />
                </a>
              </>
            }
          />
          <FilaDato Icono={Hash} etiqueta="ID de proveedor" valor={`#${proveedor.id}`} />
          <FilaDato Icono={Truck} etiqueta="Uso" valor="Se selecciona al registrar compras" />
        </div>

        <PieDetalle onClose={onClose} />
      </div>
    </div>
  );
};

// --- Detalle de método de pago (popup, solo lectura) ---

const DetalleMetodoPago = ({ metodo, onClose }) => {
  useCerrarConEscape(onClose);

  const Icono = iconoMetodoPago(metodo.nombre);
  const nombreBonito = metodo.nombre.charAt(0).toUpperCase() + metodo.nombre.slice(1);

  return (
    <div onClick={onClose} style={OVERLAY_STYLE}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="metodo-detalle-titulo"
        className="modal-anim"
        onClick={(e) => e.stopPropagation()}
        style={CAJA_MODAL_STYLE}
      >
        <div style={CABECERA_OSCURA_STYLE}>
          <div style={{ ...AVATAR_GRANDE, backgroundColor: '#334155' }}>
            <Icono size={22} />
          </div>
          <div style={{ minWidth: 0, flex: 1, paddingRight: '30px' }}>
            <h2 id="metodo-detalle-titulo" style={TITULO_MODAL_STYLE}>{nombreBonito}</h2>
            <div style={SUBTITULO_MODAL_STYLE}>Método de pago</div>
          </div>
          <BotonCerrarOscuro onClose={onClose} />
        </div>

        <div style={{ padding: '6px 24px 4px', overflowY: 'auto' }}>
          <FilaDato Icono={Icono} etiqueta="Nombre" valor={nombreBonito} />
          <FilaDato Icono={Hash} etiqueta="ID" valor={`#${metodo.id}`} />
          <div style={NOTA_MODAL_STYLE}>
            <Wallet size={15} color="#94a3b8" style={{ flexShrink: 0, marginTop: '1px' }} />
            <span>Este catálogo es fijo del sistema: no se pueden crear, editar ni eliminar métodos de pago desde aquí.</span>
          </div>
        </div>

        <PieDetalle onClose={onClose} />
      </div>
    </div>
  );
};

// --- Formularios de creación (popups) ---

const ayudaDocumento = (valor) => {
  const limpio = (valor || '').trim();
  if (!limpio) return { texto: 'DNI de 8 dígitos o RUC de 11 dígitos', tono: 'normal' };
  const tipo = tipoDocumento(limpio);
  if (tipo === 'Documento') {
    return { texto: 'No parece un DNI (8 dígitos) ni un RUC (11): revisa los números', tono: 'aviso' };
  }
  return { texto: `Detectado como ${tipo}`, tono: 'normal' };
};

const cajaCampoStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  backgroundColor: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: '10px',
  padding: '0 12px',
  height: '42px',
};

const inputCampoStyle = {
  border: 'none',
  outline: 'none',
  background: 'none',
  fontSize: '14px',
  width: '100%',
  height: '100%',
  color: '#0f172a',
  minWidth: 0,
};

const CampoTexto = ({ id, etiqueta, requerido = false, Icono, ayuda, tonoAyuda = 'normal', ...inputProps }) => (
  <div style={{ marginBottom: '16px', minWidth: 0 }}>
    <label
      htmlFor={id}
      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: '12px', fontWeight: '600', color: '#334155', marginBottom: '6px' }}
    >
      <span>
        {etiqueta}
        {requerido && <span style={{ color: '#b91c1c' }}> *</span>}
      </span>
      {!requerido && <span style={{ fontWeight: '400', color: '#94a3b8' }}>Opcional</span>}
    </label>
    <div className="campo-caja" style={cajaCampoStyle}>
      <Icono size={15} color="#94a3b8" style={{ flexShrink: 0 }} />
      <input id={id} required={requerido} style={inputCampoStyle} {...inputProps} />
    </div>
    {ayuda && (
      <div style={{ fontSize: '11px', marginTop: '5px', color: tonoAyuda === 'aviso' ? '#b45309' : '#94a3b8' }}>{ayuda}</div>
    )}
  </div>
);

const GrupoCampos = ({ children }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', columnGap: '12px' }}>
    {children}
  </div>
);

const ModalFormulario = ({ titulo, subtitulo, Icono, onClose, onSubmit, guardando, textoGuardar, error, children }) => {
  useCerrarConEscape(onClose, !guardando);

  return (
    <div style={OVERLAY_STYLE}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="form-modal-titulo"
        className="modal-anim"
        onSubmit={onSubmit}
        style={{ ...CAJA_MODAL_STYLE, maxWidth: '480px', maxHeight: '92vh' }}
      >
        <div style={{ position: 'relative', backgroundColor: '#0f172a', padding: '20px 24px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '11px', backgroundColor: 'rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icono size={20} color="#fff" />
          </div>
          <div style={{ minWidth: 0, flex: 1, paddingRight: '30px' }}>
            <h2 id="form-modal-titulo" style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: '#fff' }}>{titulo}</h2>
            {subtitulo && <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>{subtitulo}</div>}
          </div>
          <BotonCerrarOscuro onClose={onClose} />
        </div>

        <div style={{ padding: '20px 24px 4px', overflowY: 'auto' }}>
          {error && (
            <div role="alert" style={{ backgroundColor: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', padding: '10px 12px', borderRadius: '8px', fontSize: '13px', marginBottom: '16px' }}>
              {error}
            </div>
          )}
          {children}
        </div>

        <div style={{ padding: '14px 24px 18px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button
            type="button"
            className="btn-secundario"
            onClick={onClose}
            disabled={guardando}
            style={{ padding: '9px 18px', borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: '#fff', color: '#334155', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="btn-primario"
            disabled={guardando}
            style={{ padding: '9px 20px', borderRadius: '8px', border: 'none', backgroundColor: '#1e3a8a', color: '#fff', fontSize: '13px', fontWeight: '600', cursor: guardando ? 'default' : 'pointer', opacity: guardando ? 0.7 : 1 }}
          >
            {guardando ? 'Guardando...' : textoGuardar}
          </button>
        </div>
      </form>
    </div>
  );
};

const BotonNuevo = ({ onClick, children }) => (
  <button
    type="button"
    className="btn-nuevo"
    onClick={onClick}
    style={{ background: '#1e3a8a', border: 'none', color: '#fff', padding: '10px 18px', borderRadius: '10px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '7px', flexShrink: 0 }}
  >
    <Plus size={15} strokeWidth={2.5} />
    {children}
  </button>
);

// Estado vacío con ícono, título y acción opcional (crear o limpiar búsqueda).
const EstadoVacio = ({ Icono, titulo, subtitulo, textoBoton, onBoton }) => (
  <div style={{ padding: '48px 16px', textAlign: 'center' }}>
    <div style={{ width: '56px', height: '56px', borderRadius: '16px', backgroundColor: '#f1f5f9', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
      <Icono size={24} color="#94a3b8" />
    </div>
    <div style={{ fontSize: '14px', fontWeight: '600', color: '#475569' }}>{titulo}</div>
    {subtitulo && <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '4px' }}>{subtitulo}</div>}
    {textoBoton && onBoton && (
      <button
        type="button"
        onClick={onBoton}
        style={{ marginTop: '16px', padding: '9px 18px', borderRadius: '9px', border: '1px dashed #94a3b8', backgroundColor: '#fff', color: '#334155', fontSize: '13px', fontWeight: '600', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '7px' }}
      >
        <Plus size={14} /> {textoBoton}
      </button>
    )}
  </div>
);

// Cabecera de sección para agrupar la lista de clientes por tipo de documento.
const CabeceraGrupo = ({ label, color, cantidad }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '4px 0 10px' }}>
    <span style={{ width: '8px', height: '8px', borderRadius: '999px', backgroundColor: color, flexShrink: 0 }} />
    <span style={{ fontSize: '12px', fontWeight: '700', color: '#334155', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{label}</span>
    <span style={{ fontSize: '11px', fontWeight: '600', color: '#94a3b8' }}>({cantidad})</span>
    <div style={{ flex: 1, height: '1px', backgroundColor: '#f1f5f9' }} />
  </div>
);

const Catalogos = () => {
  const [tab, setTab] = useState('marcas');
  const [busqueda, setBusqueda] = useState('');
  const [filtroOrigen, setFiltroOrigen] = useState('todos');
  const [filtroDocumento, setFiltroDocumento] = useState('todos'); // 'todos' | 'DNI' | 'RUC'

  const [clienteSeleccionadoId, setClienteSeleccionadoId] = useState(null);
  const [marcaSeleccionadaId, setMarcaSeleccionadaId] = useState(null);
  const [proveedorSeleccionadoId, setProveedorSeleccionadoId] = useState(null);
  const [metodoPagoSeleccionadoId, setMetodoPagoSeleccionadoId] = useState(null);

  const [marcas, setMarcas] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [metodosPago, setMetodosPago] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [modalMarca, setModalMarca] = useState(false);
  const [formMarca, setFormMarca] = useState(FORM_MARCA_VACIO);
  const [guardandoMarca, setGuardandoMarca] = useState(false);
  const [errorMarca, setErrorMarca] = useState('');

  const [modalCliente, setModalCliente] = useState(false);
  const [formCliente, setFormCliente] = useState(FORM_CLIENTE_VACIO);
  const [guardandoCliente, setGuardandoCliente] = useState(false);
  const [errorCliente, setErrorCliente] = useState('');

  const [modalProveedor, setModalProveedor] = useState(false);
  const [formProveedor, setFormProveedor] = useState(FORM_PROVEEDOR_VACIO);
  const [guardandoProveedor, setGuardandoProveedor] = useState(false);
  const [errorProveedor, setErrorProveedor] = useState('');

  const cargarTodo = async () => {
    try {
      setLoading(true);
      const [marcasData, clientesData, proveedoresData, metodosData] = await Promise.all([
        apiFetch('/marcas'),
        apiFetch('/clientes'),
        apiFetch('/proveedores'),
        apiFetch('/metodos-pago'),
      ]);
      setMarcas(marcasData);
      setClientes(clientesData);
      setProveedores(proveedoresData);
      setMetodosPago(metodosData);
      setError('');
    } catch (err) {
      console.error('Error cargando catálogos:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarTodo();
  }, []);

  useEffect(() => {
    setBusqueda('');
    setFiltroOrigen('todos');
    setFiltroDocumento('todos');
    setClienteSeleccionadoId(null);
    setMarcaSeleccionadaId(null);
    setProveedorSeleccionadoId(null);
    setMetodoPagoSeleccionadoId(null);
  }, [tab]);

  // --- Marcas ---
  const abrirNuevaMarca = () => {
    setFormMarca(FORM_MARCA_VACIO);
    setErrorMarca('');
    setModalMarca(true);
  };

  const handleGuardarMarca = async (e) => {
    e.preventDefault();
    setGuardandoMarca(true);
    setErrorMarca('');
    try {
      await apiFetch('/marcas', { method: 'POST', body: JSON.stringify({ nombre: formMarca.nombre }) });
      setModalMarca(false);
      cargarTodo();
    } catch (err) {
      setErrorMarca(err.message);
    } finally {
      setGuardandoMarca(false);
    }
  };

  // --- Clientes ---
  const abrirNuevoCliente = () => {
    setFormCliente(FORM_CLIENTE_VACIO);
    setErrorCliente('');
    setModalCliente(true);
  };

  const handleGuardarCliente = async (e) => {
    e.preventDefault();
    setGuardandoCliente(true);
    setErrorCliente('');
    try {
      const payload = {
        nombre: formCliente.nombre.trim(),
        telefono: formCliente.telefono.trim() || null,
        documento: formCliente.documento.trim() || null,
        email: formCliente.email.trim() || null,
        direccion: formCliente.direccion.trim() || null,
      };
      await apiFetch('/clientes', { method: 'POST', body: JSON.stringify(payload) });
      setModalCliente(false);
      cargarTodo();
    } catch (err) {
      setErrorCliente(err.message);
    } finally {
      setGuardandoCliente(false);
    }
  };

  // --- Proveedores ---
  const abrirNuevoProveedor = () => {
    setFormProveedor(FORM_PROVEEDOR_VACIO);
    setErrorProveedor('');
    setModalProveedor(true);
  };

  const handleGuardarProveedor = async (e) => {
    e.preventDefault();
    setGuardandoProveedor(true);
    setErrorProveedor('');
    try {
      const payload = {
        nombre: formProveedor.nombre,
        contacto: formProveedor.contacto || null,
        telefono: formProveedor.telefono || null,
        email: formProveedor.email || null,
      };
      await apiFetch('/proveedores', { method: 'POST', body: JSON.stringify(payload) });
      setModalProveedor(false);
      cargarTodo();
    } catch (err) {
      setErrorProveedor(err.message);
    } finally {
      setGuardandoProveedor(false);
    }
  };

  const limpiarFiltros = () => {
    setBusqueda('');
    setFiltroOrigen('todos');
    setFiltroDocumento('todos');
  };

  // --- Filtros de búsqueda por pestaña ---
  const marcasFiltradas = useMemo(
    () => marcas.filter((m) => m.nombre.toLowerCase().includes(busqueda.toLowerCase())),
    [marcas, busqueda]
  );
  const clientesFiltrados = useMemo(
    () => clientes.filter((c) => {
      const q = busqueda.toLowerCase();
      const coincideTexto =
        c.nombre.toLowerCase().includes(q) ||
        (c.documento || '').toLowerCase().includes(q);
      const coincideOrigen = filtroOrigen === 'todos' || c.origen === filtroOrigen;
      const coincideDocumento = filtroDocumento === 'todos' || claveGrupoDocumento(c.documento) === filtroDocumento;
      return coincideTexto && coincideOrigen && coincideDocumento;
    }),
    [clientes, busqueda, filtroOrigen, filtroDocumento]
  );
  const conteoOrigen = useMemo(() => ({
    todos: clientes.length,
    acabados_js: clientes.filter((c) => c.origen === 'acabados_js').length,
    equipo_kanari: clientes.filter((c) => c.origen === 'equipo_kanari').length,
  }), [clientes]);
  const conteoDocumento = useMemo(() => {
    const base = { todos: clientes.length, DNI: 0, RUC: 0, otro: 0, sin: 0 };
    clientes.forEach((c) => { base[claveGrupoDocumento(c.documento)] += 1; });
    return base;
  }, [clientes]);
  // Clientes ya filtrados (búsqueda + origen + documento), agrupados por tipo de documento
  // y en este orden fijo, para que la lista no se vea "mezclada".
  const clientesAgrupados = useMemo(() => {
    const grupos = { DNI: [], RUC: [], otro: [], sin: [] };
    clientesFiltrados.forEach((c) => { grupos[claveGrupoDocumento(c.documento)].push(c); });
    return ['DNI', 'RUC', 'otro', 'sin']
      .map((clave) => ({ clave, ...GRUPOS_DOCUMENTO[clave], items: grupos[clave] }))
      .filter((g) => g.items.length > 0);
  }, [clientesFiltrados]);
  const clienteSeleccionado = useMemo(
    () => clientes.find((c) => c.id === clienteSeleccionadoId) ?? null,
    [clientes, clienteSeleccionadoId]
  );
  const marcaSeleccionada = useMemo(
    () => marcas.find((m) => m.id === marcaSeleccionadaId) ?? null,
    [marcas, marcaSeleccionadaId]
  );
  const proveedorSeleccionado = useMemo(
    () => proveedores.find((p) => p.id === proveedorSeleccionadoId) ?? null,
    [proveedores, proveedorSeleccionadoId]
  );
  const metodoPagoSeleccionado = useMemo(
    () => metodosPago.find((mp) => mp.id === metodoPagoSeleccionadoId) ?? null,
    [metodosPago, metodoPagoSeleccionadoId]
  );
  const proveedoresFiltrados = useMemo(
    () => proveedores.filter((p) => p.nombre.toLowerCase().includes(busqueda.toLowerCase())),
    [proveedores, busqueda]
  );

  const totales = { marcas: marcas.length, clientes: clientes.length, proveedores: proveedores.length, 'metodos-pago': metodosPago.length };
  const seccion = SECCIONES[tab];

  // Totales de la pestaña activa, para el contador "Mostrando X de Y".
  const listaActiva =
    tab === 'marcas' ? marcasFiltradas
    : tab === 'clientes' ? clientesFiltrados
    : tab === 'proveedores' ? proveedoresFiltrados
    : metodosPago;

  const tarjetaClicable = (alAbrir, color) => ({
    className: 'card-catalogo',
    role: 'button',
    tabIndex: 0,
    onClick: alAbrir,
    style: { ...itemCard, ['--acento']: color },
    onKeyDown: (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        alAbrir();
      }
    },
  });

  // Tarjeta individual de cliente (se reutiliza dentro de cada grupo DNI/RUC/otro/sin).
  const TarjetaCliente = ({ c }) => (
    <div key={c.id} {...tarjetaClicable(() => setClienteSeleccionadoId(c.id), '#16a34a')}>
      <div style={avatarSuave(colorPorTexto(c.nombre))}>{c.nombre.charAt(0).toUpperCase()}</div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div title={c.nombre} style={{ ...nombreCardStyle, flexShrink: 1 }}>{c.nombre}</div>
          <BadgeOrigen origen={c.origen} />
        </div>
        <div style={{ ...subtituloCardStyle, display: 'flex', gap: '10px', marginTop: '3px' }}>
          {c.telefono && <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><Phone size={10} /> {c.telefono}</span>}
          {c.documento && <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><FileText size={10} /> {c.documento}</span>}
          {!c.telefono && !c.documento && <span>Sin datos de contacto</span>}
        </div>
      </div>
      <ChevronRight size={16} color="#94a3b8" className="flecha-card" style={{ flexShrink: 0 }} />
    </div>
  );

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '14px', backgroundColor: '#f8fafc', fontFamily: 'sans-serif' }}>
        <RefreshCw size={28} color="#1e3a8a" className="spinner" />
        <div style={{ color: '#64748b', fontSize: '14px', fontWeight: '500' }}>Cargando catálogos...</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', padding: '24px 28px', fontFamily: 'sans-serif' }}>
      <style>{ESTILOS_CATALOGOS}</style>

      {/* CABECERA DE PÁGINA */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', marginBottom: '22px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#0f172a', margin: 0 }}>Catálogos</h1>
          <p style={{ color: '#64748b', fontSize: '14px', margin: '4px 0 0 0' }}>
            Marcas, clientes, proveedores y métodos de pago usados en productos, ventas y compras.
          </p>
        </div>
        <button
          type="button"
          className="btn-secundario btn-actualizar"
          onClick={cargarTodo}
          title="Volver a cargar los catálogos"
          style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '9px 16px', borderRadius: '10px', border: '1px solid #e2e8f0', backgroundColor: '#fff', color: '#334155', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
        >
          <RefreshCw size={14} className="icono-refresco" /> Actualizar
        </button>
      </div>

      {error && (
        <div style={{ backgroundColor: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', padding: '12px 16px', borderRadius: '10px', marginBottom: '16px', fontSize: '13px' }}>
          ⚠️ {error}
        </div>
      )}

      {/* RESUMEN CLICABLE (sincronizado con las pestañas) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '18px' }}>
        {Object.entries(SECCIONES).map(([id, { label, Icono, color }]) => {
          const activa = tab === id;
          return (
            <button
              key={id}
              type="button"
              className={`stat-card${activa ? ' stat-activa' : ''}`}
              onClick={() => setTab(id)}
              aria-pressed={activa}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '13px',
                textAlign: 'left',
                padding: '16px 18px',
                borderRadius: '14px',
                border: `1px solid ${activa ? color : '#e2e8f0'}`,
                backgroundColor: activa ? `${color}0d` : '#fff',
                boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
              }}
            >
              <div style={{ width: '42px', height: '42px', borderRadius: '12px', backgroundColor: `${color}1a`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icono size={19} color={color} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '22px', fontWeight: '700', color: '#0f172a', lineHeight: 1 }}>{totales[id]}</div>
                <div style={{ fontSize: '12px', color: activa ? color : '#64748b', marginTop: '3px', fontWeight: activa ? '600' : '400' }}>{label}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* PESTAÑAS (segmented control con contador) */}
      <div style={{ display: 'inline-flex', gap: '4px', backgroundColor: '#e8edf4', borderRadius: '12px', padding: '4px', marginBottom: '18px', flexWrap: 'wrap' }}>
        {Object.entries(SECCIONES).map(([id, { label, Icono, color }]) => {
          const activa = tab === id;
          return (
            <button
              key={id}
              type="button"
              className="tab-pill"
              onClick={() => setTab(id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '7px',
                padding: '8px 14px',
                borderRadius: '9px',
                border: `1px solid ${activa ? '#dbe3ec' : 'transparent'}`,
                backgroundColor: activa ? '#fff' : 'transparent',
                color: activa ? color : '#64748b',
                fontWeight: activa ? '600' : '500',
                fontSize: '13px',
                cursor: 'pointer',
                boxShadow: activa ? '0 1px 3px rgba(15, 23, 42, 0.08)' : 'none',
              }}
            >
              <Icono size={15} />
              {label}
              <span style={{
                fontSize: '11px',
                fontWeight: '700',
                padding: '1px 7px',
                borderRadius: '999px',
                backgroundColor: activa ? `${color}1a` : 'rgba(15, 23, 42, 0.07)',
                color: activa ? color : '#64748b',
              }}>
                {totales[id]}
              </span>
            </button>
          );
        })}
      </div>

      {/* CONTENIDO DE LA PESTAÑA */}
      <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '22px 24px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '18px', flexWrap: 'wrap' }}>
          <div className="buscador-caja" style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '9px 14px', minWidth: '220px', flex: 1, maxWidth: '360px' }}>
            <Search size={15} color="#94a3b8" />
            <input
              placeholder={`Buscar ${tab === 'marcas' ? 'marca' : tab === 'clientes' ? 'cliente (nombre o documento)' : tab === 'proveedores' ? 'proveedor' : 'método de pago'}...`}
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              style={{ border: 'none', outline: 'none', background: 'none', fontSize: '13px', width: '100%', color: '#334155' }}
            />
            {busqueda && (
              <button
                type="button"
                onClick={() => setBusqueda('')}
                aria-label="Limpiar búsqueda"
                title="Limpiar búsqueda"
                style={{ border: 'none', background: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex', padding: 0 }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {tab === 'marcas' && <BotonNuevo onClick={abrirNuevaMarca}>Nueva marca</BotonNuevo>}
          {tab === 'clientes' && <BotonNuevo onClick={abrirNuevoCliente}>Nuevo cliente</BotonNuevo>}
          {tab === 'proveedores' && <BotonNuevo onClick={abrirNuevoProveedor}>Nuevo proveedor</BotonNuevo>}
        </div>

        {/* Filtros (solo clientes): origen y tipo de documento */}
        {tab === 'clientes' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '11px', fontWeight: '600', color: '#94a3b8', marginRight: '2px' }}>Origen:</span>
              {[
                { id: 'todos', label: 'Todos' },
                { id: 'acabados_js', label: 'Propios' },
                { id: 'equipo_kanari', label: 'Kanari' },
              ].map(({ id, label }) => {
                const activo = filtroOrigen === id;
                return (
                  <button
                    key={id}
                    type="button"
                    className="grupo-pill"
                    onClick={() => setFiltroOrigen(id)}
                    style={{
                      padding: '5px 12px',
                      borderRadius: '999px',
                      border: '1px solid',
                      borderColor: activo ? '#16a34a' : '#e2e8f0',
                      backgroundColor: activo ? '#16a34a' : '#fff',
                      color: activo ? '#fff' : '#64748b',
                      fontSize: '12px',
                      fontWeight: '600',
                      cursor: 'pointer',
                    }}
                  >
                    {label} ({conteoOrigen[id]})
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '11px', fontWeight: '600', color: '#94a3b8', marginRight: '2px' }}>Documento:</span>
              {[
                { id: 'todos', label: 'Todos', color: '#334155' },
                { id: 'DNI', label: 'DNI', color: GRUPOS_DOCUMENTO.DNI.color },
                { id: 'RUC', label: 'RUC', color: GRUPOS_DOCUMENTO.RUC.color },
              ].map(({ id, label, color }) => {
                const activo = filtroDocumento === id;
                return (
                  <button
                    key={id}
                    type="button"
                    className="grupo-pill"
                    onClick={() => setFiltroDocumento(id)}
                    style={{
                      padding: '5px 12px',
                      borderRadius: '999px',
                      border: '1px solid',
                      borderColor: activo ? color : '#e2e8f0',
                      backgroundColor: activo ? color : '#fff',
                      color: activo ? '#fff' : '#64748b',
                      fontSize: '12px',
                      fontWeight: '600',
                      cursor: 'pointer',
                    }}
                  >
                    {label} ({conteoDocumento[id]})
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* MARCAS */}
        {tab === 'marcas' && (
          marcasFiltradas.length === 0 ? (
            marcas.length === 0 ? (
              <EstadoVacio
                Icono={Tag}
                titulo="Aún no hay marcas registradas"
                subtitulo="Crea la primera marca para poder asignarla a tus productos."
                textoBoton="Crear marca"
                onBoton={abrirNuevaMarca}
              />
            ) : (
              <EstadoVacio
                Icono={Search}
                titulo="Ninguna marca coincide con tu búsqueda"
                subtitulo={`No encontramos marcas con "${busqueda}".`}
                textoBoton="Limpiar búsqueda"
                onBoton={limpiarFiltros}
              />
            )
          ) : (
            <>
              <div style={gridCards}>
                {marcasFiltradas.map((m) => {
                  const color = colorPorTexto(m.nombre);
                  return (
                    <div key={m.id} {...tarjetaClicable(() => setMarcaSeleccionadaId(m.id), color)}>
                      <div style={avatarSuave(color)}>{m.nombre.charAt(0).toUpperCase()}</div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div title={m.nombre} style={nombreCardStyle}>{m.nombre}</div>
                        <div style={subtituloCardStyle}>ID #{m.id}</div>
                      </div>
                      <ChevronRight size={16} color="#94a3b8" className="flecha-card" style={{ flexShrink: 0 }} />
                    </div>
                  );
                })}
              </div>
              <ContadorResultados visibles={marcasFiltradas.length} total={marcas.length} />
            </>
          )
        )}

        {/* CLIENTES — agrupados por DNI / RUC / otro documento / sin documento */}
        {tab === 'clientes' && (
          clientesFiltrados.length === 0 ? (
            clientes.length === 0 ? (
              <EstadoVacio
                Icono={Users}
                titulo="Aún no hay clientes registrados"
                subtitulo="Crea el primer cliente para usarlo en ventas y cotizaciones."
                textoBoton="Crear cliente"
                onBoton={abrirNuevoCliente}
              />
            ) : (
              <EstadoVacio
                Icono={Search}
                titulo="Ningún cliente coincide con tu búsqueda"
                subtitulo="Prueba con otro nombre, documento o cambia los filtros."
                textoBoton="Limpiar filtros"
                onBoton={limpiarFiltros}
              />
            )
          ) : (
            <>
              {clientesAgrupados.map(({ clave, label, color, items }, indice) => (
                <div key={clave} style={{ marginTop: indice === 0 ? 0 : '22px' }}>
                  <CabeceraGrupo label={label} color={color} cantidad={items.length} />
                  <div style={gridCards}>
                    {items.map((c) => <TarjetaCliente key={c.id} c={c} />)}
                  </div>
                </div>
              ))}
              <ContadorResultados visibles={clientesFiltrados.length} total={clientes.length} />
            </>
          )
        )}

        {/* PROVEEDORES */}
        {tab === 'proveedores' && (
          proveedoresFiltrados.length === 0 ? (
            proveedores.length === 0 ? (
              <EstadoVacio
                Icono={Truck}
                titulo="Aún no hay proveedores registrados"
                subtitulo="Crea el primer proveedor para usarlo al registrar compras."
                textoBoton="Crear proveedor"
                onBoton={abrirNuevoProveedor}
              />
            ) : (
              <EstadoVacio
                Icono={Search}
                titulo="Ningún proveedor coincide con tu búsqueda"
                subtitulo={`No encontramos proveedores con "${busqueda}".`}
                textoBoton="Limpiar búsqueda"
                onBoton={limpiarFiltros}
              />
            )
          ) : (
            <>
              <div style={gridCards}>
                {proveedoresFiltrados.map((p) => (
                  <div key={p.id} {...tarjetaClicable(() => setProveedorSeleccionadoId(p.id), '#d97706')}>
                    <div style={avatarSuave(colorPorTexto(p.nombre))}>{p.nombre.charAt(0).toUpperCase()}</div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div title={p.nombre} style={nombreCardStyle}>{p.nombre}</div>
                      <div style={{ ...subtituloCardStyle, display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '3px' }}>
                        {p.contacto && <span>{p.contacto}</span>}
                        <span style={{ display: 'flex', gap: '10px' }}>
                          {p.telefono && <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><Phone size={10} /> {p.telefono}</span>}
                          {p.email && <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><Mail size={10} /> {p.email}</span>}
                        </span>
                        {!p.contacto && !p.telefono && !p.email && <span>Sin datos de contacto</span>}
                      </div>
                    </div>
                    <ChevronRight size={16} color="#94a3b8" className="flecha-card" style={{ flexShrink: 0 }} />
                  </div>
                ))}
              </div>
              <ContadorResultados visibles={proveedoresFiltrados.length} total={proveedores.length} />
            </>
          )
        )}

        {/* MÉTODOS DE PAGO */}
        {tab === 'metodos-pago' && (
          metodosPago.length === 0 ? (
            <EstadoVacio
              Icono={Wallet}
              titulo="No hay métodos de pago configurados"
              subtitulo="Este catálogo lo fija el sistema; contacta al administrador del backend."
            />
          ) : (
            <>
              <div style={gridCards}>
                {metodosPago.map((mp) => {
                  const Icono = iconoMetodoPago(mp.nombre);
                  return (
                    <div key={mp.id} {...tarjetaClicable(() => setMetodoPagoSeleccionadoId(mp.id), '#7c3aed')}>
                      <div style={avatarSuave('#334155')}>
                        <Icono size={17} />
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ ...nombreCardStyle, textTransform: 'capitalize' }}>{mp.nombre}</div>
                        <div style={subtituloCardStyle}>Catálogo del sistema · ID #{mp.id}</div>
                      </div>
                      <ChevronRight size={16} color="#94a3b8" className="flecha-card" style={{ flexShrink: 0 }} />
                    </div>
                  );
                })}
              </div>
              <ContadorResultados visibles={metodosPago.length} total={metodosPago.length} />
            </>
          )
        )}
      </div>

      {/* POPUPS DE DETALLE */}
      {clienteSeleccionado && (
        <DetalleCliente cliente={clienteSeleccionado} onClose={() => setClienteSeleccionadoId(null)} />
      )}
      {marcaSeleccionada && (
        <DetalleMarca marca={marcaSeleccionada} onClose={() => setMarcaSeleccionadaId(null)} />
      )}
      {proveedorSeleccionado && (
        <DetalleProveedor proveedor={proveedorSeleccionado} onClose={() => setProveedorSeleccionadoId(null)} />
      )}
      {metodoPagoSeleccionado && (
        <DetalleMetodoPago metodo={metodoPagoSeleccionado} onClose={() => setMetodoPagoSeleccionadoId(null)} />
      )}

      {/* POPUPS DE CREACIÓN */}
      {modalMarca && (
        <ModalFormulario
          titulo="Nueva marca"
          subtitulo="Se usará al registrar productos"
          Icono={Tag}
          onClose={() => setModalMarca(false)}
          onSubmit={handleGuardarMarca}
          guardando={guardandoMarca}
          textoGuardar="Crear marca"
          error={errorMarca}
        >
          <CampoTexto
            id="marca-nombre"
            etiqueta="Nombre"
            requerido
            Icono={Tag}
            autoFocus
            autoComplete="off"
            placeholder="Nombre de la marca"
            value={formMarca.nombre}
            onChange={(e) => setFormMarca({ ...formMarca, nombre: e.target.value })}
          />
        </ModalFormulario>
      )}

      {modalCliente && (
        <ModalFormulario
          titulo="Nuevo cliente"
          subtitulo="Se guardará como cliente propio de Acabados J&S"
          Icono={UserPlus}
          onClose={() => setModalCliente(false)}
          onSubmit={handleGuardarCliente}
          guardando={guardandoCliente}
          textoGuardar="Crear cliente"
          error={errorCliente}
        >
          <CampoTexto
            id="cliente-nombre"
            etiqueta="Nombre"
            requerido
            Icono={User}
            autoFocus
            autoComplete="off"
            placeholder="Nombre o razón social"
            value={formCliente.nombre}
            onChange={(e) => setFormCliente({ ...formCliente, nombre: e.target.value })}
          />
          <GrupoCampos>
            <CampoTexto
              id="cliente-documento"
              etiqueta="Documento"
              Icono={FileText}
              inputMode="numeric"
              autoComplete="off"
              placeholder="DNI o RUC"
              ayuda={ayudaDocumento(formCliente.documento).texto}
              tonoAyuda={ayudaDocumento(formCliente.documento).tono}
              value={formCliente.documento}
              onChange={(e) => setFormCliente({ ...formCliente, documento: e.target.value })}
            />
            <CampoTexto
              id="cliente-telefono"
              etiqueta="Teléfono"
              Icono={Phone}
              type="tel"
              autoComplete="off"
              placeholder="9XX XXX XXX"
              value={formCliente.telefono}
              onChange={(e) => setFormCliente({ ...formCliente, telefono: e.target.value })}
            />
          </GrupoCampos>
          <CampoTexto
            id="cliente-email"
            etiqueta="Correo"
            Icono={Mail}
            type="email"
            autoComplete="off"
            placeholder="correo@ejemplo.com"
            value={formCliente.email}
            onChange={(e) => setFormCliente({ ...formCliente, email: e.target.value })}
          />
          <CampoTexto
            id="cliente-direccion"
            etiqueta="Dirección"
            Icono={MapPin}
            autoComplete="off"
            placeholder="Calle, número, distrito"
            value={formCliente.direccion}
            onChange={(e) => setFormCliente({ ...formCliente, direccion: e.target.value })}
          />
        </ModalFormulario>
      )}

      {modalProveedor && (
        <ModalFormulario
          titulo="Nuevo proveedor"
          subtitulo="Se usará al registrar compras"
          Icono={Truck}
          onClose={() => setModalProveedor(false)}
          onSubmit={handleGuardarProveedor}
          guardando={guardandoProveedor}
          textoGuardar="Crear proveedor"
          error={errorProveedor}
        >
          <CampoTexto
            id="proveedor-nombre"
            etiqueta="Nombre / Razón social"
            requerido
            Icono={Truck}
            autoFocus
            autoComplete="off"
            placeholder="Nombre o razón social"
            value={formProveedor.nombre}
            onChange={(e) => setFormProveedor({ ...formProveedor, nombre: e.target.value })}
          />
          <GrupoCampos>
            <CampoTexto
              id="proveedor-contacto"
              etiqueta="Contacto"
              Icono={User}
              autoComplete="off"
              placeholder="Persona de contacto"
              value={formProveedor.contacto}
              onChange={(e) => setFormProveedor({ ...formProveedor, contacto: e.target.value })}
            />
            <CampoTexto
              id="proveedor-telefono"
              etiqueta="Teléfono"
              Icono={Phone}
              type="tel"
              autoComplete="off"
              placeholder="9XX XXX XXX"
              value={formProveedor.telefono}
              onChange={(e) => setFormProveedor({ ...formProveedor, telefono: e.target.value })}
            />
          </GrupoCampos>
          <CampoTexto
            id="proveedor-email"
            etiqueta="Correo"
            Icono={Mail}
            type="email"
            autoComplete="off"
            placeholder="correo@ejemplo.com"
            value={formProveedor.email}
            onChange={(e) => setFormProveedor({ ...formProveedor, email: e.target.value })}
          />
        </ModalFormulario>
      )}
    </div>
  );
};

// --- Estilos de tarjetas definidos después del componente principal ---
// (constantes de módulo: se evalúan antes del primer render, el orden es válido porque
// tarjetaClicable las usa dentro de funciones, no al definir el objeto).

const gridCards = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
  gap: '14px',
};

const itemCard = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  border: '1px solid #e2e8f0',
  backgroundColor: '#f8fafc',
  borderRadius: '12px',
  padding: '14px',
};

const nombreCardStyle = {
  fontSize: '14px',
  fontWeight: '600',
  color: '#1e293b',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  minWidth: 0,
};

const subtituloCardStyle = {
  fontSize: '11px',
  color: '#94a3b8',
};

// Avatar en versión "suave": fondo tintado con la letra en el color de acento.
const avatarSuave = (color) => ({
  width: '40px',
  height: '40px',
  borderRadius: '11px',
  backgroundColor: `${color}1c`,
  color,
  fontWeight: '700',
  fontSize: '15px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
});

const ContadorResultados = ({ visibles, total }) => (
  <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #f1f5f9', fontSize: '12px', color: '#94a3b8', textAlign: 'center' }}>
    Mostrando <span style={{ fontWeight: '600', color: '#475569' }}>{visibles}</span> de {total} {total === 1 ? 'elemento' : 'elementos'}
  </div>
);

export default Catalogos;