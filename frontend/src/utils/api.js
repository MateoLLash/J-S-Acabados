// Utilidad central para hablar con el backend FastAPI.
// Centraliza la URL base, el token de autorización y el manejo de errores
// para que cada vista no tenga que repetir el mismo boilerplate de fetch.

export const API_URL = 'https://j-s-acabados.onrender.com';

/**
 * Llama a la API con el token guardado en localStorage.
 * Lanza un Error con el mensaje que manda FastAPI (detail) si algo falla,
 * para que los componentes puedan mostrarlo directo en un alert/toast.
 */
export async function apiFetch(path, options = {}) {
  const token = localStorage.getItem('token');
  const esFormData = options.body instanceof FormData;

  const headers = {
    // Si hay body y NO es FormData, añadimos application/json.
    // Si es FormData (ej. subir una foto), dejamos que el navegador ponga
    // el Content-Type con el boundary correcto automáticamente.
    ...(options.body && !esFormData ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  // 401 => el token venció o no es válido: mandamos al login
  if (res.status === 401) {
    localStorage.clear();
    window.location.href = '/login';
    throw new Error('Sesión expirada, inicia sesión de nuevo.');
  }

  // 204 No Content (ej. DELETE) no trae body
  if (res.status === 204) return null;

  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    data = null;
  }

  if (!res.ok) {
    const detail = (data && (data.detail || data.message)) || `Error ${res.status}`;
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
  }

  return data;
}