import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Calculator, AlertTriangle, CheckCircle2, Star, ArrowLeftRight, FileDown, Home, Layers } from 'lucide-react';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable'; // Importación correcta para que el plugin se registre automáticamente en jsPDF
import { apiFetch } from '../utils/api';

// Margen de desperdicio estándar en obra (cortes, roturas, futuras reposiciones).
const FACTOR_DESPERDICIO = 1.1;

// Categorías que se sugieren como complemento (instalación) cuando el usuario
// pide un material de piso/pared, ej: si pide mayólica, también le sugerimos
// fragua y pegamento para instalarla.
const PALABRAS_CLAVE_COMPLEMENTO = ['fragua', 'pegamento'];

// --------------------------------------------------------------------------
// PROYECTO COMPLETO: cada ambiente necesita varios "roles" de material.
// Cada rol se resuelve contra las categorías reales que existan en tu
// catálogo (por eso son palabras clave, no IDs fijos): si el negocio no
// tiene esa categoría creada, el bot simplemente la omite del combo.
// --------------------------------------------------------------------------
const COMBOS_AMBIENTE = {
  'Baño': [
    { rol: 'Piso', keywords: ['mayólica', 'mayolica', 'porcelanato', 'piso'] },
    { rol: 'Pared', keywords: ['azulejo', 'cerámica', 'ceramica', 'pared'] },
    { rol: 'Fragua', keywords: ['fragua'] },
    { rol: 'Pegamento', keywords: ['pegamento'] },
  ],
  'Cocina': [
    { rol: 'Piso', keywords: ['porcelanato', 'mayólica', 'mayolica', 'piso'] },
    { rol: 'Pared / Salpicadero', keywords: ['azulejo', 'cerámica', 'ceramica', 'pared'] },
    { rol: 'Fragua', keywords: ['fragua'] },
    { rol: 'Pegamento', keywords: ['pegamento'] },
  ],
  'Sala': [
    { rol: 'Piso', keywords: ['porcelanato', 'mayólica', 'mayolica', 'piso', 'laminado'] },
    { rol: 'Zócalo', keywords: ['zócalo', 'zocalo', 'rodapié', 'rodapie'] },
    { rol: 'Pegamento', keywords: ['pegamento'] },
    { rol: 'Fragua', keywords: ['fragua'] },
  ],
  'Fachada': [
    { rol: 'Revestimiento', keywords: ['azulejo', 'porcelanato', 'cerámica', 'ceramica', 'fachada', 'pared'] },
    { rol: 'Pegamento', keywords: ['pegamento'] },
    { rol: 'Fragua', keywords: ['fragua'] },
  ],
};

const ICONO_AMBIENTE = {
  'Baño': '🛁',
  'Cocina': '🍳',
  'Sala': '🛋️',
  'Fachada': '🏠',
};

const PASOS = {
  SALUDO: 'saludo',                     // elegir modo: simple o proyecto completo
  ESPERANDO_CATEGORIA: 'esperando_categoria', // modo simple: elegir categoría
  ESPERANDO_AMBIENTE: 'esperando_ambiente',   // modo proyecto: elegir ambiente
  ESPERANDO_AREA: 'esperando_area',
  MOSTRANDO_RESULTADO: 'mostrando_resultado',
};

const burbujaBase = {
  maxWidth: '86%',
  padding: '10px 14px',
  borderRadius: '14px',
  fontSize: '13.5px',
  lineHeight: 1.45,
  whiteSpace: 'pre-wrap',
};

const AsistenteCompraBot = () => {
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState([]);
  const [paso, setPaso] = useState(PASOS.SALUDO);
  const [modo, setModo] = useState(null); // 'simple' | 'proyecto'
  const [categorias, setCategorias] = useState([]);
  const [categoriaElegida, setCategoriaElegida] = useState(null);
  const [ambienteElegido, setAmbienteElegido] = useState(null);
  const [areaInput, setAreaInput] = useState('');
  const [cargando, setCargando] = useState(false);
  const [datosCotizacion, setDatosCotizacion] = useState(null);
  const [nombreCliente, setNombreCliente] = useState('');
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [mensajes, abierto]);

  const agregarMensaje = (from, content) => {
    setMensajes((prev) => [...prev, { from, content, id: `${Date.now()}-${Math.random()}` }]);
  };

  const iniciarConversacion = async () => {
    setMensajes([]);
    setModo(null);
    setCategoriaElegida(null);
    setAmbienteElegido(null);
    setAreaInput('');
    setDatosCotizacion(null);
    setNombreCliente('');
    setPaso(PASOS.SALUDO);
    agregarMensaje('bot', 'Hola 👋 Soy tu asistente de compra. ¿Qué necesitas hoy?');

    try {
      setCargando(true);
      const data = await apiFetch('/categorias');
      setCategorias(data);
    } catch (err) {
      agregarMensaje('bot', 'No pude cargar las categorías del catálogo. Intenta de nuevo en un momento.');
    } finally {
      setCargando(false);
    }
  };

  const abrirWidget = () => {
    setAbierto(true);
    if (mensajes.length === 0) iniciarConversacion();
  };

  const calcularSugerencias = (productos, areaConDesperdicio) => {
    return productos.map((p) => {
      const rendimiento = Number(p.rendimiento_m2);
      const cajasNecesarias = Math.ceil(areaConDesperdicio / rendimiento);
      const stockDisponible = p.stock;
      const faltante = Math.max(0, cajasNecesarias - stockDisponible);
      const alcanzaConStock = faltante === 0;
      const costoAComprar = faltante * Number(p.precio_venta);

      return { producto: p, rendimiento, cajasNecesarias, stockDisponible, faltante, alcanzaConStock, costoAComprar };
    });
  };

  const volverAlSaludo = () => {
    setModo(null);
    setCategoriaElegida(null);
    setAmbienteElegido(null);
    setDatosCotizacion(null);
    setNombreCliente('');
    setPaso(PASOS.SALUDO);
    agregarMensaje('bot', '¿Qué necesitas ahora?');
  };

  // -------------------- MODO SIMPLE (un solo material) --------------------
  const elegirModoSimple = () => {
    setModo('simple');
    agregarMensaje('user', 'Un material específico');
    agregarMensaje('bot', '¿Qué tipo de material estás buscando?');
    setPaso(PASOS.ESPERANDO_CATEGORIA);
  };

  const elegirCategoria = (categoria) => {
    setCategoriaElegida(categoria);
    agregarMensaje('user', categoria.nombre);
    agregarMensaje('bot', `Perfecto, ${categoria.nombre}. ¿Cuántos m² necesitas cubrir?`);
    setPaso(PASOS.ESPERANDO_AREA);
  };

  // -------------------- MODO PROYECTO COMPLETO (por ambiente) --------------------
  const elegirModoProyecto = () => {
    setModo('proyecto');
    agregarMensaje('user', 'Un proyecto completo');
    agregarMensaje('bot', '¿Qué vas a hacer? Elige el ambiente y te armo el combo completo (piso, pared, fragua, pegamento...).');
    setPaso(PASOS.ESPERANDO_AMBIENTE);
  };

  const elegirAmbiente = (ambiente) => {
    setAmbienteElegido(ambiente);
    agregarMensaje('user', `${ICONO_AMBIENTE[ambiente] || ''} ${ambiente}`.trim());
    agregarMensaje('bot', `Genial, un ${ambiente.toLowerCase()}. ¿Cuántos m² tiene el ambiente?`);
    setPaso(PASOS.ESPERANDO_AREA);
  };

  const resolverCategoriaPorKeywords = (keywords) => {
    // 1) Coincidencia de PALABRA COMPLETA primero (ej: "pared" no debe matchear
    // dentro de "emparedado" ni una keyword corta colarse en un nombre largo).
    // Se prueba keyword por keyword, en el orden en que vienen definidas —
    // así el resultado no depende del orden en que /categorias devuelva la lista.
    for (const kw of keywords) {
      const regex = new RegExp(`\\b${kw}\\b`, 'i');
      const coincidencias = categorias.filter((c) => regex.test(c.nombre));
      if (coincidencias.length === 1) return coincidencias[0];
      if (coincidencias.length > 1) {
        // Si varias categorías matchean la misma keyword (ej: "Azulejos" y
        // "Azulejos Importados"), nos quedamos con el nombre más corto/genérico.
        return [...coincidencias].sort((a, b) => a.nombre.length - b.nombre.length)[0];
      }
    }

    // 2) Fallback: substring simple, por si el nombre tiene alguna variante
    // que no calzó como palabra completa (plurales, guiones, etc.)
    for (const kw of keywords) {
      const match = categorias.find((c) => c.nombre.toLowerCase().includes(kw));
      if (match) return match;
    }

    return undefined;
  };

  const calcularProyectoCompleto = async (area) => {
    const roles = COMBOS_AMBIENTE[ambienteElegido] || [];
    const areaConDesperdicio = area * FACTOR_DESPERDICIO;
    const itemsPorRol = [];
    const categoriasNoEncontradas = [];

    for (const { rol, keywords } of roles) {
      const categoria = resolverCategoriaPorKeywords(keywords);
      if (!categoria) {
        categoriasNoEncontradas.push(rol);
        continue;
      }
      try {
        const productos = await apiFetch(`/productos/?categoria_id=${categoria.id}&con_rendimiento=true`);
        if (productos.length === 0) {
          categoriasNoEncontradas.push(rol);
          continue;
        }
        const sugerencias = calcularSugerencias(productos, areaConDesperdicio);
        const mejor = sugerencias.reduce((min, s) =>
          Number(s.producto.precio_venta) < Number(min.producto.precio_venta) ? s : min
        );
        itemsPorRol.push({ rol, categoria: categoria.nombre, sugerencia: mejor });
      } catch (e) {
        categoriasNoEncontradas.push(rol);
      }
    }

    if (itemsPorRol.length === 0) {
      agregarMensaje(
        'bot',
        `Todavía no tengo productos con rendimiento (m² por caja) cargados para armar el combo de ${ambienteElegido}. Pídele a un administrador que complete el catálogo.`
      );
      setPaso(PASOS.MOSTRANDO_RESULTADO);
      return;
    }

    agregarMensaje(
      'bot',
      `Combo completo para tu ${ambienteElegido.toLowerCase()} de ${area} m² (+10% de desperdicio = ${areaConDesperdicio.toFixed(2)} m²):`
    );
    agregarMensaje('bot', { tipo: 'proyecto', items: itemsPorRol });

    if (categoriasNoEncontradas.length > 0) {
      agregarMensaje(
        'bot',
        `Nota: no encontré productos para "${categoriasNoEncontradas.join('", "')}" en tu catálogo, así que no los incluí en el combo.`
      );
    }

    setDatosCotizacion({
      areaOriginal: area,
      areaConDesperdicio,
      categoriaNombre: `Proyecto completo · ${ambienteElegido}`,
      items: itemsPorRol.map(({ rol, sugerencia }) => ({
        codigo: sugerencia.producto.codigo,
        nombre: `${sugerencia.producto.nombre} (${rol})`,
        medida: sugerencia.producto.medida,
        unidad: sugerencia.producto.unidad,
        cantidad: sugerencia.cajasNecesarias,
        precioUnitario: Number(sugerencia.producto.precio_venta),
        subtotal: sugerencia.cajasNecesarias * Number(sugerencia.producto.precio_venta),
      })),
    });

    setPaso(PASOS.MOSTRANDO_RESULTADO);
  };

  // -------------------- ENVÍO DEL ÁREA (compartido por ambos modos) --------------------
  const calcularNecesidad = async (e) => {
    e.preventDefault();
    const area = Number(areaInput);
    if (!area || area <= 0) return;

    agregarMensaje('user', `${area} m²`);
    setCargando(true);

    try {
      if (modo === 'proyecto') {
        await calcularProyectoCompleto(area);
        return;
      }

      // ---- modo simple (lógica original) ----
      const productos = await apiFetch(
        `/productos/?categoria_id=${categoriaElegida.id}&con_rendimiento=true`
      );

      if (productos.length === 0) {
        agregarMensaje(
          'bot',
          `Todavía no tengo el rendimiento (m² por caja) cargado para ningún producto de "${categoriaElegida.nombre}". Pídele a un administrador que lo complete en el catálogo de Productos, en la sección "Rendimiento".`
        );
        setPaso(PASOS.MOSTRANDO_RESULTADO);
        return;
      }

      const areaConDesperdicio = area * FACTOR_DESPERDICIO;
      const sugerencias = calcularSugerencias(productos, areaConDesperdicio);

      agregarMensaje(
        'bot',
        `Con ${area} m² + 10% de desperdicio (${areaConDesperdicio.toFixed(2)} m² en total), esto es lo que necesitas:`
      );
      agregarMensaje('bot', { tipo: 'resultado', sugerencias });

      const itemsCotizacion = [];
      const principalMasBarato = sugerencias.reduce((min, s) =>
        Number(s.producto.precio_venta) < Number(min.producto.precio_venta) ? s : min
      );
      itemsCotizacion.push(principalMasBarato);

      const esCategoriaBase = !PALABRAS_CLAVE_COMPLEMENTO.some((kw) =>
        categoriaElegida.nombre.toLowerCase().includes(kw)
      );

      if (esCategoriaBase) {
        const categoriasComplemento = categorias.filter(
          (c) =>
            c.id !== categoriaElegida.id &&
            PALABRAS_CLAVE_COMPLEMENTO.some((kw) => c.nombre.toLowerCase().includes(kw))
        );

        const complementos = [];
        for (const cat of categoriasComplemento) {
          try {
            const prodsComplemento = await apiFetch(`/productos/?categoria_id=${cat.id}&con_rendimiento=true`);
            if (prodsComplemento.length === 0) continue;
            const sugs = calcularSugerencias(prodsComplemento, areaConDesperdicio);
            const mejor = sugs.reduce((min, s) => (Number(s.producto.precio_venta) < Number(min.producto.precio_venta) ? s : min));
            complementos.push(mejor);
          } catch (e) {}
        }

        if (complementos.length > 0) {
          agregarMensaje('bot', 'Para instalarlo, también vas a necesitar:');
          agregarMensaje('bot', { tipo: 'complementos', sugerencias: complementos });
          itemsCotizacion.push(...complementos);
        }
      }

      setDatosCotizacion({
        areaOriginal: area,
        areaConDesperdicio,
        categoriaNombre: categoriaElegida.nombre,
        items: itemsCotizacion.map((s) => ({
          codigo: s.producto.codigo,
          nombre: s.producto.nombre,
          medida: s.producto.medida,
          unidad: s.producto.unidad,
          cantidad: s.cajasNecesarias,
          precioUnitario: Number(s.producto.precio_venta),
          subtotal: s.cajasNecesarias * Number(s.producto.precio_venta),
        })),
      });

      setPaso(PASOS.MOSTRANDO_RESULTADO);
    } catch (err) {
      agregarMensaje('bot', 'Hubo un error consultando el catálogo. Intenta de nuevo.');
    } finally {
      setCargando(false);
      setAreaInput('');
    }
  };

  const generarCotizacionPDF = () => {
    if (!datosCotizacion) return;
    const { areaOriginal, areaConDesperdicio, categoriaNombre, items } = datosCotizacion;

    const doc = new jsPDF();
    const fecha = new Date().toLocaleDateString('es-PE');
    const folio = `COT-${Date.now().toString().slice(-6)}`;
    const total = items.reduce((sum, it) => sum + it.subtotal, 0);

    // --- ENCABEZADO ---
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.text('COTIZACIÓN', 135, 20);

    doc.rect(135, 25, 60, 15);
    doc.setFontSize(8);
    doc.text('FECHA', 145, 30);
    doc.text('NÚMERO', 175, 30);
    doc.line(135, 32, 195, 32);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(fecha, 142, 37);
    doc.text(folio, 180, 37);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('Acabados J&S', 14, 20);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('Especialistas en revestimientos', 14, 25);
    doc.text('Lima, Perú', 14, 30);

    // --- CLIENTE Y PROYECTO ---
    doc.setFont('helvetica', 'bold');
    doc.text('Preparado para:', 14, 50);
    doc.line(14, 52, 195, 52);
    doc.setFont('helvetica', 'normal');
    doc.text('Cliente: ' + (nombreCliente.trim() || 'Cliente General'), 14, 58);
    doc.text('Proyecto: ' + categoriaNombre, 14, 63);

    // --- DESCRIPCIÓN ---
    doc.rect(14, 70, 181, 15);
    doc.text('Descripción del cálculo:', 14, 68);
    doc.text(`Cálculo de materiales para ${areaOriginal} m² + 10% desperdicio.`, 16, 78);

    // --- TABLA ---
    const filas = items.map((it) => [
      it.cantidad + ' ' + it.unidad,
      it.nombre + ' (' + it.codigo + ')',
      'S/ ' + it.precioUnitario.toFixed(2),
      'S/ ' + it.subtotal.toFixed(2),
    ]);

    doc.autoTable({
      startY: 90,
      head: [['CANT.', 'DESCRIPCIÓN', 'PRECIO U.', 'TOTAL']],
      body: filas,
      headStyles: { fillColor: [240, 240, 240], textColor: 0, fontStyle: 'bold' },
      styles: { fontSize: 10, cellPadding: 5 },
      columnStyles: { 
        0: { cellWidth: 25 }, 
        1: { cellWidth: 85 }, 
        2: { cellWidth: 35, halign: 'right' }, // Alineado a la derecha
        3: { cellWidth: 36, halign: 'right' }  // Alineado a la derecha
      }
    });

    // --- TOTALES ---
    const finalY = doc.lastAutoTable.finalY;
    doc.setFont('helvetica', 'bold');
    doc.rect(135, finalY + 5, 60, 15);
    doc.text('TOTAL', 140, finalY + 14);
    doc.text('S/ ' + total.toFixed(2), 190, finalY + 14, { align: 'right' });

    // --- PIE ---
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('Esta cotización es válida por los próximos 7 días.', 14, finalY + 25);
    doc.line(14, finalY + 35, 80, finalY + 35);
    doc.text('Recibido:', 14, finalY + 40);

    doc.save(`${folio}.pdf`);
  };

  const renderContenidoMensaje = (msg) => {
    if (typeof msg.content === 'string') return msg.content;

    if (msg.content.tipo === 'resultado' || msg.content.tipo === 'complementos') {
      const { sugerencias } = msg.content;
      const esComplemento = msg.content.tipo === 'complementos';
      const precioMasBajo = sugerencias.length > 1 ? Math.min(...sugerencias.map((s) => Number(s.producto.precio_venta))) : null;
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
          {sugerencias.map((s) => {
            const esMasBarato = precioMasBajo !== null && Number(s.producto.precio_venta) === precioMasBajo;
            return (
              <div key={s.producto.id} style={{ border: esMasBarato ? '1.5px solid #16a34a' : '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 12px', backgroundColor: esComplemento ? '#fff7ed' : '#fff', position: 'relative' }}>
                {esMasBarato && (
                  <div style={{ position: 'absolute', top: '-9px', right: '10px', backgroundColor: '#16a34a', color: '#fff', fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                    <Star size={10} fill="#fff" /> Mejor precio
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <strong style={{ fontSize: '13px', color: '#1e293b' }}>{s.producto.nombre}</strong>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>{s.producto.codigo}</span>
                </div>
                {s.producto.medida && <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>Medida: {s.producto.medida}</div>}
                <div style={{ fontSize: '12.5px', color: '#334155', marginTop: '6px' }}>Necesitas <strong>{s.cajasNecesarias}</strong> {s.producto.unidad}(s) &middot; rinde {s.rendimiento} m² c/u</div>
                <div style={{ fontSize: '12.5px', color: '#334155' }}>Stock actual: {s.stockDisponible} &middot; S/ {Number(s.producto.precio_venta).toFixed(2)} c/u</div>
                {s.alcanzaConStock ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', color: '#16a34a', fontSize: '12.5px', fontWeight: 600 }}>
                    <CheckCircle2 size={14} /> Ya tienes stock suficiente
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', color: '#d97706', fontSize: '12.5px', fontWeight: 600 }}>
                    <AlertTriangle size={14} /> Comprar {s.faltante} {s.producto.unidad}(s) más (≈ S/ {s.costoAComprar.toFixed(2)})
                  </div>
                )}
              </div>
            );
          })}
        </div>
      );
    }

    if (msg.content.tipo === 'proyecto') {
      const { items } = msg.content;
      const totalProyecto = items.reduce((sum, it) => sum + it.sugerencia.cajasNecesarias * Number(it.sugerencia.producto.precio_venta), 0);
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
          {items.map(({ rol, categoria, sugerencia: s }) => (
            <div key={rol} style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 12px', backgroundColor: '#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#f97316', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{rol}</span>
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>{categoria}</span>
              </div>
              <strong style={{ fontSize: '13px', color: '#1e293b' }}>{s.producto.nombre}</strong>
              <div style={{ fontSize: '12.5px', color: '#334155', marginTop: '4px' }}>{s.cajasNecesarias} {s.producto.unidad}(s) &middot; S/ {Number(s.producto.precio_venta).toFixed(2)} c/u</div>
              {s.alcanzaConStock ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', color: '#16a34a', fontSize: '12px', fontWeight: 600 }}>
                  <CheckCircle2 size={13} /> Stock suficiente
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', color: '#d97706', fontSize: '12px', fontWeight: 600 }}>
                  <AlertTriangle size={13} /> Faltan {s.faltante} {s.producto.unidad}(s)
                </div>
              )}
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', backgroundColor: '#0f172a', borderRadius: '10px', color: '#fff' }}>
            <span style={{ fontSize: '12.5px', fontWeight: 700 }}>TOTAL DEL PROYECTO</span>
            <span style={{ fontSize: '13px', fontWeight: 700 }}>S/ {totalProyecto.toFixed(2)}</span>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <>
      <button onClick={() => (abierto ? setAbierto(false) : abrirWidget())} style={{ position: 'fixed', bottom: '24px', right: '24px', width: '56px', height: '56px', borderRadius: '50%', backgroundColor: '#f97316', color: '#fff', border: 'none', boxShadow: '0 8px 20px rgba(249, 115, 22, 0.4)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200 }} title="Asistente de compra">
        {abierto ? <X size={24} /> : <MessageCircle size={24} />}
      </button>

      {abierto && (
        <div style={{ position: 'fixed', bottom: '92px', right: '24px', width: '340px', maxWidth: '90vw', height: '480px', maxHeight: '75vh', backgroundColor: '#f8fafc', borderRadius: '16px', boxShadow: '0 20px 45px rgba(15, 23, 42, 0.25)', display: 'flex', flexDirection: 'column', overflow: 'hidden', zIndex: 1200, fontFamily: 'sans-serif' }}>
          <div style={{ backgroundColor: '#0f172a', color: '#fff', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Calculator size={18} color="#f97316" />
            <div>
              <div style={{ fontSize: '13.5px', fontWeight: 700 }}>Asistente de Compra</div>
              <div style={{ fontSize: '11px', color: '#94a3b8' }}>Calcula cuánto material necesitas</div>
            </div>
          </div>
          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {mensajes.map((msg) => (
              <div key={msg.id} style={{ ...burbujaBase, alignSelf: msg.from === 'user' ? 'flex-end' : 'flex-start', backgroundColor: msg.from === 'user' ? '#1e3a8a' : '#e2e8f0', color: msg.from === 'user' ? '#fff' : '#1e293b', width: typeof msg.content === 'object' ? '100%' : 'auto', maxWidth: typeof msg.content === 'object' ? '100%' : '86%' }}>
                {renderContenidoMensaje(msg)}
              </div>
            ))}

            {/* Paso 1: elegir modo */}
            {paso === PASOS.SALUDO && !modo && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                <button onClick={elegirModoSimple} style={{ border: '1px solid #e2e8f0', backgroundColor: '#fff', borderRadius: '10px', padding: '10px 12px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', color: '#1e293b', textAlign: 'left' }}>
                  <Layers size={15} color="#f97316" /> Un material específico
                </button>
                <button onClick={elegirModoProyecto} style={{ border: '1px solid #e2e8f0', backgroundColor: '#fff', borderRadius: '10px', padding: '10px 12px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', color: '#1e293b', textAlign: 'left' }}>
                  <Home size={15} color="#f97316" /> Un proyecto completo (baño, cocina...)
                </button>
              </div>
            )}

            {/* Paso 2a: elegir categoría (modo simple) */}
            {paso === PASOS.ESPERANDO_CATEGORIA && categorias.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
                {categorias.map((cat) => (
                  <button key={cat.id} onClick={() => elegirCategoria(cat)} style={{ border: '1px solid #f97316', color: '#f97316', backgroundColor: '#fff', borderRadius: '999px', padding: '6px 12px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' }}>{cat.nombre}</button>
                ))}
              </div>
            )}

            {/* Paso 2b: elegir ambiente (modo proyecto) */}
            {paso === PASOS.ESPERANDO_AMBIENTE && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
                {Object.keys(COMBOS_AMBIENTE).map((amb) => (
                  <button key={amb} onClick={() => elegirAmbiente(amb)} style={{ border: '1px solid #f97316', color: '#f97316', backgroundColor: '#fff', borderRadius: '999px', padding: '6px 12px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' }}>
                    {ICONO_AMBIENTE[amb]} {amb}
                  </button>
                ))}
              </div>
            )}

            {cargando && <div style={{ fontSize: '12px', color: '#94a3b8' }}>Calculando...</div>}

            {paso === PASOS.MOSTRANDO_RESULTADO && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                {datosCotizacion && (
                  <input
                    type="text"
                    value={nombreCliente}
                    onChange={(e) => setNombreCliente(e.target.value)}
                    placeholder="Nombre del cliente (opcional)"
                    style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '12.5px', boxSizing: 'border-box', width: '100%' }}
                  />
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
                  {datosCotizacion && <button onClick={generarCotizacionPDF} style={{ border: 'none', backgroundColor: '#0f172a', color: '#fff', borderRadius: '8px', padding: '7px 14px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}><FileDown size={13} /> Descargar cotización PDF</button>}
                  <button onClick={volverAlSaludo} style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', borderRadius: '8px', padding: '7px 14px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}><ArrowLeftRight size={13} /> Empezar otra cotización</button>
                </div>
              </div>
            )}
          </div>
          {paso === PASOS.ESPERANDO_AREA && (
            <form onSubmit={calcularNecesidad} style={{ display: 'flex', gap: '8px', padding: '12px', borderTop: '1px solid #e2e8f0', backgroundColor: '#fff' }}>
              <input autoFocus type="number" step="0.01" min="0" placeholder="Área en m² (ej: 25)" value={areaInput} onChange={(e) => setAreaInput(e.target.value)} style={{ flex: 1, padding: '9px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box' }} />
              <button type="submit" disabled={cargando} style={{ backgroundColor: '#f97316', color: '#fff', border: 'none', borderRadius: '8px', padding: '0 14px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Send size={16} /></button>
            </form>
          )}
        </div>
      )}
    </>
  );
};

export default AsistenteCompraBot;