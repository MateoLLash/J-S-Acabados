from typing import List, Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.database import get_db
from app.auth.dependencies import get_current_user

router = APIRouter(prefix="/trazabilidad", tags=["trazabilidad"])

@router.get("/{tabla}/{registro_id}")
def obtener_historial_registro(
    tabla: str, 
    registro_id: int, 
    db: Session = Depends(get_db),
    usuario_actual = Depends(get_current_user)
):
    # Validar que solo administradores vean la auditoría
    if usuario_actual.rol != 'admin':
        raise HTTPException(status_code=403, detail="Sin permisos para ver trazabilidad")

    # Consultar los logs ordenados desde la creación hasta el último cambio
    query = text("""
        SELECT a.id, a.accion, a.datos_anteriores, a.datos_nuevos, a.fecha, u.nombre as usuario
        FROM auditoria_logs a
        LEFT JOIN usuarios u ON a.usuario_id = u.id
        WHERE a.tabla_afectada = :tabla AND a.registro_id = :registro_id
        ORDER BY a.fecha ASC
    """)
    
    resultados = db.execute(query, {"tabla": tabla, "registro_id": registro_id}).mappings().all()
    
    if not resultados:
        raise HTTPException(status_code=404, detail="No hay historial para este registro")
        
    return resultados