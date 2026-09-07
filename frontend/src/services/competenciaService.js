import axios from 'axios';

// Ajusta la URL base según tu entorno (ej. http://localhost:8000/api)
const API_URL = 'http://localhost:8000/api/competencia';

export const competenciaService = {
  async listarCompetidores() {
    const res = await axios.get(`${API_URL}/competidores`);
    return res.data;
  },

  async listarProductos(competidorId = '', busqueda = '') {
    const params = {};
    if (competidorId) params.competidor_id = competidorId;
    if (busqueda) params.busqueda = busqueda;
    const res = await axios.get(`${API_URL}/productos`, { params });
    return res.data;
  },

  async obtenerComparativa() {
    const res = await axios.get(`${API_URL}/comparativa-precios`);
    return res.data;
  },

  async crearMatch(productoId, productoCompetidorId) {
    const res = await axios.post(`${API_URL}/match`, {
      producto_id: productoId,
      producto_competidor_id: productoCompetidorId
    });
    return res.data;
  },

  async ejecutarScraper(competidorId) {
    const res = await axios.post(`${API_URL}/ejecutar-scraper/${competidorId}`);
    return res.data;
  },

  async obtenerHistorico(productoCompetidorId) {
    const res = await axios.get(`${API_URL}/historico/${productoCompetidorId}`);
    return res.data;
  }
};