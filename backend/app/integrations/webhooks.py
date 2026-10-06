from app.integrations.lina_client import registrar_cliente_en_lina


def notificar_cliente_nuevo(cliente) -> None:
    try:
        resultado = registrar_cliente_en_lina(
            nombre=cliente.nombre,
            documento=cliente.documento,
            telefono=cliente.telefono,
            email=cliente.email,
        )
        print(f"[WEBHOOK] Cliente notificado correctamente a Lina: {resultado}")
    except Exception as e:
        # El detalle (tiempo, estado, error) ya quedó en auditoria_integracion
        print(f"[WEBHOOK] No se pudo notificar a Lina: {e}")