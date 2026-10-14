"""Sincronizaciones con resultados persistidos y confirmación externa separados."""
import uuid
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth.dependencies import get_current_user
from app.models.catalogo import Categoria, Proveedor
from app.models.producto import Producto
from app.integrations.auditoria_integracion import registrar_evento, medir
from app.integrations.diagnostico_api import diagnosticar_error
from app.integrations.lina_client import consultar_productos_lina, consultar_proveedores_lina, confirmar_recepcion_lina

router = APIRouter(prefix='/api/v1/sync', tags=['sincronizacion'])
MAX_DETALLES = 200


def obtener_o_crear_categoria(db, nombre_categoria):
    categoria = db.query(Categoria).filter(Categoria.nombre == nombre_categoria).first()
    if categoria is None:
        categoria = Categoria(nombre=nombre_categoria)
        db.add(categoria)
        db.flush()
    return categoria


def _texto(data, campo, limite, opcional=False):
    valor = data.get(campo)
    if opcional and valor in (None, ''):
        return None
    if not isinstance(valor, str) or not valor.strip() or len(valor.strip()) > limite:
        raise ValueError(f'{campo}: texto requerido de hasta {limite} caracteres.')
    return valor.strip()


def _validar(data, tipo):
    if not isinstance(data, dict):
        raise ValueError('El registro debe ser un objeto JSON.')
    ident = data.get('id')
    if isinstance(ident, bool) or not isinstance(ident, int) or ident <= 0:
        raise ValueError('id: entero positivo requerido.')
    if tipo == 'productos':
        try:
            precio = Decimal(str(data.get('precioVenta')))
        except (InvalidOperation, TypeError, ValueError):
            raise ValueError('precioVenta: número válido requerido.')
        if not precio.is_finite() or precio < 0 or precio > Decimal('99999999.99') or precio != precio.quantize(Decimal('.01')):
            raise ValueError('precioVenta: importe no negativo con hasta dos decimales.')
        stock = data.get('stock')
        if isinstance(stock, bool) or not isinstance(stock, int) or not 0 <= stock <= 2147483647:
            raise ValueError('stock: entero no negativo requerido.')
        return {'id': ident, 'codigo': _texto(data, 'codigo', 30), 'nombre': _texto(data, 'nombre', 150),
                'categoria': _texto(data, 'categoria', 80), 'precio': precio, 'stock': stock}
    return {'id': ident, 'nombre': _texto(data, 'razonSocial', 120),
            'contacto': _texto(data, 'nombreContacto', 120, True),
            'telefono': _texto(data, 'telefono', 20, True), 'email': _texto(data, 'email', 120, True)}


def _sincronizar(tipo, db, usuario):
    correlacion = str(uuid.uuid4())
    recibidos = None
    guardados = omitidos = fallidos = 0
    pendientes = []
    detalles = []
    etapa, guardado, confirmacion = 'consulta', 'no_iniciado', 'no_aplica'
    resultado, http_status, error_tipo, diagnostico = 'exito', 200, None, {}
    confirmacion_lina = None
    vistos = set()

    def detalle(indice, registro, estado, motivo):
        if len(detalles) < MAX_DETALLES:
            # No guardar contacto, email, teléfono ni respuesta original.
            ident = registro.get('id') if isinstance(registro, dict) else None
            codigo = registro.get('codigo') if isinstance(registro, dict) and tipo == 'productos' else None
            detalles.append({'posicion': indice, 'id_externo': ident if isinstance(ident, int) else None,
                             'codigo': codigo[:30] if isinstance(codigo, str) else None,
                             'estado': estado, 'motivo': motivo})

    with medir() as ms:
        try:
            consulta = consultar_productos_lina if tipo == 'productos' else consultar_proveedores_lina
            data = consulta(correlacion, usuario.id)
            if not isinstance(data, dict) or not isinstance(data.get(tipo), list):
                raise ValueError('Colección esperada no disponible.')
            registros = data[tipo]
            recibidos = len(registros)
            etapa, guardado = 'guardado', 'en_proceso'
            for indice, registro in enumerate(registros, 1):
                try:
                    p = _validar(registro, tipo)
                except ValueError as exc:
                    fallidos += 1
                    detalle(indice, registro, 'fallido', str(exc))
                    continue
                clave = p['codigo'] if tipo == 'productos' else p['nombre']
                if clave in vistos:
                    omitidos += 1
                    detalle(indice, registro, 'omitido', 'Duplicado dentro de la respuesta de Lina.')
                    continue
                try:
                    # Cada registro tiene un savepoint; un inválido no revierte otros válidos.
                    with db.begin_nested():
                        if tipo == 'productos':
                            existente = db.query(Producto).filter(Producto.codigo == clave).first()
                        else:
                            existente = db.query(Proveedor).filter(Proveedor.nombre == clave).first()
                        if existente:
                            omitidos += 1
                            vistos.add(clave)
                            detalle(indice, registro, 'omitido', 'Ya existe en la base de datos; no se sobrescribe ni se confirma como nuevo.')
                            continue
                        if tipo == 'productos':
                            categoria = obtener_o_crear_categoria(db, p['categoria'])
                            nuevo = Producto(codigo=p['codigo'], nombre=p['nombre'], categoria_id=categoria.id,
                                             precio_compra=0, precio_venta=p['precio'], stock=p['stock'],
                                             stock_minimo=0, unidad='unidad', origen='lina')
                        else:
                            nuevo = Proveedor(nombre=p['nombre'], contacto=p['contacto'], telefono=p['telefono'], email=p['email'], origen='lina')
                        db.add(nuevo)
                        db.flush()
                    pendientes.append(p['id'])
                    vistos.add(clave)
                    detalle(indice, registro, 'pendiente_commit', 'Pendiente de confirmar la transacción local.')
                except IntegrityError:
                    fallidos += 1
                    detalle(indice, registro, 'fallido', 'No cumple una restricción de la base de datos; no se guardó este registro.')
            db.commit()
            guardados = len(pendientes)
            guardado = 'parcial' if fallidos else 'completado'
            for item in detalles:
                if item['estado'] == 'pendiente_commit':
                    item.update(estado='guardado', motivo='Guardado y confirmado en la base de datos local.')
            if pendientes:
                etapa, confirmacion = 'confirmacion', 'pendiente'
                confirmacion_lina = confirmar_recepcion_lina(
                    pendientes if tipo == 'productos' else [], pendientes if tipo == 'proveedores' else [], correlacion, usuario.id)
                confirmacion = 'respuesta_recibida'
            etapa = 'finalizado'
            if fallidos:
                resultado, http_status = 'parcial', 207
                diagnostico = {'diagnostico_codigo': 'registros_rechazados', 'error_mensaje': 'La sincronización finalizó con registros rechazados.',
                               'accion_sugerida': 'Revisa los motivos por registro y corrige los datos antes de volver a sincronizar.'}
        except Exception as exc:
            error_tipo = type(exc).__name__
            diagnostico = diagnosticar_error(exc)
            if etapa == 'confirmacion':
                # El commit YA ocurrió: rollback aquí no desharía productos guardados.
                confirmacion = 'pendiente'
                resultado, http_status = 'parcial', 207
                diagnostico['error_mensaje'] = 'Guardado completado; confirmación a Lina pendiente. ' + diagnostico['error_mensaje']
                diagnostico['accion_sugerida'] += ' No repitas la importación para confirmar: coordina la confirmación de los IDs guardados de esta traza; no hay reintento automático.'
            else:
                db.rollback()
                resultado = 'error'
                http_status = 502 if etapa == 'consulta' else 500
                if etapa == 'guardado':
                    guardado = 'revertido'
                    guardados = 0
                    fallidos = recibidos - omitidos if recibidos is not None else 0
                    for item in detalles:
                        if item['estado'] == 'pendiente_commit':
                            item.update(estado='fallido', motivo='Transacción revertida: el registro no quedó guardado.')
        finalmente = datetime.now(timezone.utc)
        registrar_evento(
            fecha=ms.fecha, fecha_fin=finalmente, correlacion_id=correlacion,
            direccion='interna', sistema='lina', operacion=f'sync.{tipo}', metodo='POST',
            endpoint=f'/api/v1/sync/lina/{tipo}', resultado=resultado, status_code=http_status,
            duracion_ms=ms(), alcance_duracion='sincronizacion_completa',
            registros_recibidos=recibidos, registros_procesados=guardados,
            registros_omitidos=omitidos, registros_fallidos=fallidos,
            usuario_id=usuario.id, etapa=etapa, estado_guardado=guardado,
            estado_confirmacion=confirmacion, error_tipo=error_tipo, **diagnostico,
            detalle_registros=detalles, detalle_total=recibidos,
        )
    contenido = {
        'resultado': resultado, 'correlacion_id': correlacion,
        f'{tipo}_guardados': guardados, 'recibidos': recibidos, 'omitidos': omitidos, 'fallidos': fallidos,
        'estado_guardado': guardado, 'estado_confirmacion': confirmacion,
        'confirmacion_lina': confirmacion_lina, 'mensaje': diagnostico.get('error_mensaje', 'Sincronización completada.'),
        'accion_sugerida': diagnostico.get('accion_sugerida'),
    }
    return JSONResponse(status_code=http_status, content=contenido)


@router.post('/lina/proveedores')
def sincronizar_proveedores_lina(db: Session = Depends(get_db), usuario_actual=Depends(get_current_user)):
    return _sincronizar('proveedores', db, usuario_actual)


@router.post('/lina/productos')
def sincronizar_productos_lina(db: Session = Depends(get_db), usuario_actual=Depends(get_current_user)):
    return _sincronizar('productos', db, usuario_actual)
