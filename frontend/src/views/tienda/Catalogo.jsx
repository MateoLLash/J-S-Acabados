import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, PackagePlus, Package } from 'lucide-react';
import { styles } from './Tienda.styles';
import { apiFetch } from '../../utils/api';
import { formatMoney, imagenUrl, iconoCategoria } from '../../utils/format';
import { useCarrito } from '../../context/CarritoContext';

const Catalogo = () => {
  const navigate = useNavigate();
  const { agregar } = useCarrito();

  const [categorias, setCategorias] = useState([]);
  const [categoriaId, setCategoriaId] = useState(null);
  const [productos, setProductos] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/tienda/categorias')
      .then(setCategorias)
      .catch((err) => console.error('No se pudieron cargar categorías:', err));
  }, []);

  useEffect(() => {
    const cargarProductos = async () => {
      try {
        setCargando(true);
        const query = categoriaId ? `?categoria_id=${categoriaId}` : '';
        const data = await apiFetch(`/tienda/productos${query}`);
        setProductos(data);
        setError('');
      } catch (err) {
        setError(err.message);
      } finally {
        setCargando(false);
      }
    };
    cargarProductos();
  }, [categoriaId]);

  const productosFiltrados = productos.filter((p) =>
    p.nombre.toLowerCase().includes(busqueda.toLowerCase())
  );

  return (
    <div style={styles.content}>
      <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a', marginBottom: '4px' }}>
        Catálogo de productos
      </h1>
      <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '18px' }}>
        Precios referenciales sujetos a stock disponible.
      </p>

      <input
        style={styles.searchInput}
        placeholder="Buscar producto..."
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
      />

      <div style={styles.filtersBar}>
        <button style={styles.chip(categoriaId === null)} onClick={() => setCategoriaId(null)}>
          Todas
        </button>
        {categorias.map((c) => (
          <button key={c.id} style={styles.chip(categoriaId === c.id)} onClick={() => setCategoriaId(c.id)}>
            {iconoCategoria(c.nombre)} {c.nombre}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ backgroundColor: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', padding: '12px 16px', borderRadius: '10px', marginBottom: '16px', fontSize: '13px' }}>
          ⚠️ {error}
        </div>
      )}

      {cargando ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#f97316', fontWeight: 500 }}>Cargando productos...</div>
      ) : productosFiltrados.length === 0 ? (
        <div style={styles.emptyState}>
          <Package size={32} />
          <p>No hay productos que coincidan con tu búsqueda.</p>
        </div>
      ) : (
        <div style={styles.grid}>
          {productosFiltrados.map((p) => (
            <div key={p.id} style={styles.card} onClick={() => navigate(`/tienda/producto/${p.id}`)}>
              <div style={styles.cardImageWrap}>
                {imagenUrl(p) ? (
                  <img src={imagenUrl(p)} alt={p.nombre} style={styles.cardImage} />
                ) : (
                  iconoCategoria(p.categoria?.nombre)
                )}
              </div>
              <div style={styles.cardBody}>
                <span style={styles.cardCategoria}>{p.categoria?.nombre || p.marca?.nombre || 'General'}</span>
                <h3 style={styles.cardNombre}>{p.nombre}</h3>
                <span style={styles.cardPrecio}>{formatMoney(p.precio_venta)}</span>
                <span style={styles.cardStock}>{p.stock} {p.unidad} disponibles</span>
                <button
                  style={styles.addButton}
                  onClick={(e) => {
                    e.stopPropagation();
                    agregar(p, 1);
                  }}
                >
                  <PackagePlus size={15} /> Agregar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Catalogo;
