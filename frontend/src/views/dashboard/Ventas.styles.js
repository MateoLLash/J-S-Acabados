export const styles = {
  container: { 
    padding: '24px', 
    backgroundColor: '#F7FAFC', 
    minHeight: '100vh' 
  },
  gridPrincipal: { 
    display: 'grid', 
    gridTemplateColumns: '1fr 380px', 
    gap: '24px', 
    marginTop: '20px' 
  },
  
  cardProducto: { 
    backgroundColor: '#FFFFFF', 
    padding: '16px', 
    borderRadius: '12px', 
    border: '1px solid #E2E8F0', 
    cursor: 'pointer',
    position: 'relative'
  },
  carrito: { 
    backgroundColor: '#FFFFFF', 
    padding: '20px', 
    borderRadius: '16px', 
    border: '1px solid #E2E8F0', 
    height: 'fit-content' 
  },
  input: { 
    width: '100%', 
    padding: '8px 12px', // Más delgado
    borderRadius: '6px', 
    border: '1px solid #E2E8F0', 
    marginBottom: '15px' 
  },
  botonFinalizar: { 
    width: '100%', 
    backgroundColor: '#1E293B', 
    color: '#FFFFFF', 
    padding: '14px', 
    borderRadius: '8px', 
    border: 'none', 
    cursor: 'pointer', 
    fontWeight: 'bold', 
    marginTop: '20px',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '8px'
  },
  contenedorProductos: { 
    display: 'grid', 
    gridTemplateColumns: 'repeat(3, 1fr)', // 3 columnas fijas para que no se estiren tanto
    gap: '12px' 
  },
  cardProducto: { 
    backgroundColor: '#FFFFFF', 
    padding: '12px', // Menos padding para que se vea más pequeño
    borderRadius: '8px', 
    border: '1px solid #E2E8F0', 
    cursor: 'pointer',
    height: '115px', // Altura fija para evitar que se estiren
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between'
  },
  // Mejora para el carrito
  itemCarrito: {
    display: 'flex', 
    justifyContent: 'space-between', 
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: '1px solid #F1F5F9'
  }
  
};