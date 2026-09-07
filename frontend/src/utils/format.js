// Helpers compartidos para el catálogo / cotizador.
// El backend aún no expone un campo "sku" en /tienda/productos, así que
// derivamos un código legible a partir de la categoría + id. Si el backend
// llega a exponer producto.sku o producto.codigo, se usa ese valor real.
import { API_URL } from './api';

export function codigoProducto(producto) {
  if (!producto) return '';
  if (producto.sku) return producto.sku;
  if (producto.codigo) return producto.codigo;
  const prefijo = (producto.categoria?.nombre || 'PRD')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z]/g, '')
    .slice(0, 3)
    .toUpperCase();
  return `${prefijo || 'PRD'}-${String(producto.id).padStart(4, '0')}`;
}

export function formatMoney(valor) {
  return `S/ ${Number(valor || 0).toFixed(2)}`;
}

export function formatFecha(fecha = new Date()) {
  return fecha.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function numeroPedido() {
  // Correlativo simple basado en la hora, solo para referencia visual
  // mientras el backend no asigne un número real de pedido/cotización.
  return `COT-${Date.now().toString().slice(-6)}`;
}

const ICONOS_CATEGORIA = {
  mayolica: '🀫',
  mayólica: '🀫',
  porcelanato: '◼️',
  pegamento: '🧴',
  acabado: '✨',
  construccion: '🧱',
  construcción: '🧱',
  fragua: '🪣',
  sellador: '🧴',
  herramienta: '🛠️',
};

export function iconoCategoria(nombre = '') {
  const clave = nombre
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const encontrada = Object.keys(ICONOS_CATEGORIA).find((k) => clave.includes(k.normalize('NFD').replace(/[\u0300-\u036f]/g, '')));
  return ICONOS_CATEGORIA[encontrada] || '📦';
}

export function imagenUrl(producto) {
  if (!producto?.imagen_url) return null;
  if (producto.imagen_url.startsWith('http')) return producto.imagen_url; // ya es absoluta
  return `${API_URL}${producto.imagen_url}`;
}