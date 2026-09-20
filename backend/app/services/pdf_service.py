import io
import qrcode
from reportlab.lib.pagesizes import mm
from reportlab.lib import colors
from reportlab.lib.utils import ImageReader
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, Image, KeepTogether
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

# ==========================================
# Paleta y helpers de estilo
# ==========================================
NEGRO = colors.HexColor("#1a1a1a")
GRIS = colors.HexColor("#666666")
GRIS_CLARO = colors.HexColor("#f8ece0") # Fondo crema claro para el recuadro "Documento que modifica"
ACENTO = colors.HexColor("#2d6a4f")   # Verde de tu diseño
NARANJA_BURDEOS = colors.HexColor("#c84b24") # Color del borde y título "DOCUMENTO QUE MODIFICA"

def _linea(grosor=0.6, color=colors.HexColor("#cccccc"), espacio_antes=3, espacio_despues=3):
    return HRFlowable(width="100%", thickness=grosor, color=color,
                       spaceBefore=espacio_antes, spaceAfter=espacio_despues)


# ==========================================
# Monto a letras (mismo criterio que el envío a SUNAT)
# ==========================================
_UNIDADES = ["", "UNO", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE",
             "DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISEIS", "DIECISIETE",
             "DIECIOCHO", "DIECINUEVE", "VEINTE"]
_DECENAS = ["", "", "VEINTE", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"]
_CENTENAS = ["", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS",
             "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"]

def _tres_digitos_a_letras(num: int) -> str:
    if num == 0:
        return ""
    if num == 100:
        return "CIEN"
    c, resto = divmod(num, 100)
    partes = []
    if c:
        partes.append(_CENTENAS[c])
    if resto:
        if resto <= 20:
            partes.append(_UNIDADES[resto])
        elif resto < 30:
            partes.append("VEINTI" + _UNIDADES[resto - 20])
        else:
            d, u = divmod(resto, 10)
            partes.append(_DECENAS[d] + (f" Y {_UNIDADES[u]}" if u else ""))
    return " ".join(partes)

def _entero_a_letras(n: int) -> str:
    if n == 0:
        return "CERO"
    millones, resto = divmod(n, 1_000_000)
    miles, resto3 = divmod(resto, 1000)
    partes = []
    if millones:
        partes.append("UN MILLON" if millones == 1 else f"{_tres_digitos_a_letras(millones)} MILLONES")
    if miles:
        partes.append("MIL" if miles == 1 else f"{_tres_digitos_a_letras(miles)} MIL")
    if resto3:
        partes.append(_tres_digitos_a_letras(resto3))
    return " ".join(partes) if partes else "CERO"

def _monto_a_legenda(total: float, moneda: str = "SOLES") -> str:
    total = round(float(total), 2)
    entero = int(total)
    centavos = int(round((total - entero) * 100))
    return f"SON {_entero_a_letras(entero)} CON {centavos:02d}/100 {moneda}"

def _generar_qr(data: str, size_mm: float = 22) -> Image:
    qr = qrcode.QRCode(border=1, box_size=6)
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return Image(buf, width=size_mm * mm, height=size_mm * mm)


def generar_pdf_comprobante(venta, items):
    buffer = io.BytesIO()

    PAGE_WIDTH = 80 * mm
    PAGE_HEIGHT = 200 * mm
    margin = 5 * mm

    doc = SimpleDocTemplate(
        buffer,
        pagesize=(PAGE_WIDTH, PAGE_HEIGHT),
        leftMargin=margin,
        rightMargin=margin,
        topMargin=margin,
        bottomMargin=margin,
    )

    story = []

    # ---------- Estilos ----------
    negocio_style = ParagraphStyle(
        'Negocio', fontName='Helvetica-Bold', fontSize=11,
        alignment=TA_CENTER, textColor=NEGRO, leading=13, spaceAfter=2,
    )
    dato_negocio_style = ParagraphStyle(
        'DatoNegocio', fontName='Helvetica', fontSize=7.5,
        alignment=TA_CENTER, textColor=GRIS, leading=10,
    )
    tipo_doc_style = ParagraphStyle(
        'TipoDoc', fontName='Helvetica-Bold', fontSize=10,
        alignment=TA_CENTER, textColor=colors.white, leading=13,
    )
    nro_doc_style = ParagraphStyle(
        'NroDoc', fontName='Helvetica-Bold', fontSize=9.5,
        alignment=TA_CENTER, textColor=colors.white, leading=12,
    )
    etiqueta_style = ParagraphStyle(
        'Etiqueta', fontName='Helvetica', fontSize=7.5,
        textColor=GRIS, leading=11,
    )
    valor_style = ParagraphStyle(
        'Valor', fontName='Helvetica', fontSize=7.5,
        textColor=NEGRO, alignment=TA_RIGHT, leading=11,
    )
    
    # Estilos para el bloque de modificación
    titulo_modifica_style = ParagraphStyle(
        'TituloModifica', fontName='Helvetica-Bold', fontSize=7.5,
        textColor=NARANJA_BURDEOS, leading=11, spaceAfter=2
    )
    etiqueta_modifica_style = ParagraphStyle(
        'EtiquetaMod', fontName='Helvetica', fontSize=7,
        textColor=GRIS, leading=10,
    )
    valor_modifica_style = ParagraphStyle(
        'ValorMod', fontName='Helvetica-Bold', fontSize=7,
        textColor=NEGRO, alignment=TA_RIGHT, leading=10,
    )

    celda_izq_style = ParagraphStyle('CeldaIzq', fontName='Helvetica', fontSize=6.8, leading=8.4)
    celda_der_style = ParagraphStyle('CeldaDer', fontName='Helvetica', fontSize=6.8, leading=8.4, alignment=TA_RIGHT)
    header_tabla_style = ParagraphStyle(
        'HeaderTabla', fontName='Helvetica-Bold', fontSize=6.8,
        textColor=colors.white, leading=8.4,
    )
    header_tabla_der_style = ParagraphStyle(
        'HeaderTablaDer', parent=header_tabla_style, alignment=TA_RIGHT,
    )
    total_label_style = ParagraphStyle(
        'TotalLabel', fontName='Helvetica', fontSize=7.5,
        alignment=TA_LEFT, textColor=NEGRO,
    )
    total_valor_style = ParagraphStyle(
        'TotalValor', fontName='Helvetica', fontSize=7.5,
        alignment=TA_RIGHT, textColor=NEGRO,
    )
    total_final_label_style = ParagraphStyle(
        'TotalFinalLabel', fontName='Helvetica-Bold', fontSize=10,
        alignment=TA_LEFT, textColor=NEGRO,
    )
    total_final_valor_style = ParagraphStyle(
        'TotalFinalValor', fontName='Helvetica-Bold', fontSize=10,
        alignment=TA_RIGHT, textColor=NEGRO,
    )
    legenda_style = ParagraphStyle(
        'Legenda', fontName='Helvetica-Oblique', fontSize=7,
        alignment=TA_CENTER, textColor=ACENTO, leading=9, spaceBefore=4,
    )
    footer_style = ParagraphStyle(
        'Footer', fontName='Helvetica', fontSize=6.6,
        alignment=TA_CENTER, textColor=GRIS, leading=8.6,
    )
    footer_bold_style = ParagraphStyle(
        'FooterBold', parent=footer_style, fontName='Helvetica-Bold', textColor=NEGRO,
    )
    footer_gracias_style = ParagraphStyle(
        'FooterGracias', parent=footer_style, fontName='Helvetica-Oblique', textColor=ACENTO,
    )

    # ---------- 1. Cabecera del negocio ----------
    razon_social = getattr(venta, 'emisor_razon_social', None) or "HUACHACA PALACIOS SONIA AYDEE"
    ruc_emisor = getattr(venta, 'emisor_ruc', None) or "10062517323"
    direccion_emisor = getattr(venta, 'emisor_direccion', None) or "AV. PROCERES DE LA INDEPENDENCIA NRO. 2009"

    story.append(Paragraph(razon_social, negocio_style))
    story.append(Paragraph(f"R.U.C. {ruc_emisor}", dato_negocio_style))
    story.append(Paragraph(direccion_emisor, dato_negocio_style))
    story.append(Spacer(1, 6))

    # ---------- 2. Recuadro con tipo de documento y número ----------
    tipo_comp = str(venta.tipo_documento_id).zfill(2)
    es_nota_credito = tipo_comp == "07"
    es_nota_debito = tipo_comp == "08"
    
    if es_nota_credito:
        tipo_doc = "NOTA DE CRÉDITO ELECTRÓNICA"
    elif es_nota_debito:
        tipo_doc = "NOTA DE DÉBITO ELECTRÓNICA"
    elif tipo_comp == "01":
        tipo_doc = "FACTURA ELECTRÓNICA"
    else:
        tipo_doc = "BOLETA DE VENTA ELECTRÓNICA"
        
    serie_numero = f"{venta.serie or 'B001'}-{str(venta.numero or venta.id).zfill(8)}"

    recuadro = Table(
        [[Paragraph(tipo_doc, tipo_doc_style)],
         [Paragraph(serie_numero, nro_doc_style)]],
        colWidths=[70 * mm],
    )
    recuadro.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), ACENTO),
        ('TOPPADDING', (0, 0), (-1, 0), 5),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 1),
        ('TOPPADDING', (0, 1), (-1, 1), 1),
        ('BOTTOMPADDING', (0, 1), (-1, 1), 5),
    ]))
    story.append(recuadro)
    story.append(Spacer(1, 6))

    # ---------- 3. Datos de emisión y cliente ----------
    fecha_emision = venta.fecha.strftime('%d/%m/%Y %H:%M') if venta.fecha else "-"
    cliente_nombre = venta.cliente.nombre if venta.cliente else "CLIENTE GENERAL"
    cliente_doc = (
        getattr(venta.cliente, 'documento', '')
        or getattr(venta.cliente, 'numero_documento', '')
        or getattr(venta.cliente, 'ruc', '')
        or getattr(venta.cliente, 'dni', '')
        or "00000000"
    )

    # Base de filas para Facturas y Boletas
    filas_cliente = [
        [Paragraph("Fecha:", etiqueta_style), Paragraph(fecha_emision, valor_style)],
        [Paragraph("Moneda:", etiqueta_style), Paragraph("SOLES (PEN)", valor_style)],
        [Paragraph("Cliente:", etiqueta_style), Paragraph(cliente_nombre, valor_style)],
        [Paragraph("Documento:", etiqueta_style), Paragraph(str(cliente_doc), valor_style)],
    ]

    datos_tabla = Table(filas_cliente, colWidths=[20 * mm, 50 * mm])
    datos_tabla.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
    ]))
    story.append(datos_tabla)

    # ---------- RECUADRO ESPECIAL: DOCUMENTO QUE MODIFICA ----------
    if es_nota_credito or es_nota_debito:
        story.append(Spacer(1, 4))
        
        doc_afectado = "No especificado"
        tipo_ref = "Documento"
        fecha_ref = "-"
        serie_num_ref = "0000-00000000"
        
        if getattr(venta, 'documento_referencia', None):
            ref = venta.documento_referencia
            tipo_ref = "Factura Electrónica (01)" if ref.tipo_comprobante == "factura" else "Boleta Electrónica (03)"
            serie_ref = ref.serie or ("F001" if ref.tipo_comprobante == "factura" else "B001")
            num_ref = str(ref.numero or ref.id).zfill(8)
            serie_num_ref = f"{serie_ref}-{num_ref}"
            fecha_ref = ref.fecha.strftime('%d/%m/%Y') if ref.fecha else "-"

        motivos_dict = {
            "01": "01 - Intereses por mora" if es_nota_debito else "01 - Anulación de la operación",
            "02": "02 - Aumento en el valor" if es_nota_debito else "02 - Anulación por error en el RUC",
            "03": "03 - Penalidades / Otros conceptos" if es_nota_debito else "03 - Corrección por error en la descripción",
            "06": "06 - Devolución total" if es_nota_credito else "",
        }
        
        codigo_motivo = venta.motivo_nota_id or "01"
        tipo_nota_texto = motivos_dict.get(codigo_motivo, "Otros Conceptos")
        sustento_texto = venta.observaciones_sunat or "Modificación de comprobante"

        filas_modifica = [
            [Paragraph("DOCUMENTO QUE MODIFICA", titulo_modifica_style), ""],
            [Paragraph("Tipo:", etiqueta_modifica_style), Paragraph(tipo_ref, valor_modifica_style)],
            [Paragraph("Serie - Número:", etiqueta_modifica_style), Paragraph(serie_num_ref, valor_modifica_style)],
            [Paragraph("Fecha de emisión:", etiqueta_modifica_style), Paragraph(fecha_ref, valor_modifica_style)],
            [Paragraph("Tipo de nota:", etiqueta_modifica_style), Paragraph(tipo_nota_texto, valor_modifica_style)],
            [Paragraph("Motivo / Sustento:", etiqueta_modifica_style), Paragraph(sustento_texto, valor_modifica_style)],
        ]

        tabla_modifica = Table(filas_modifica, colWidths=[25 * mm, 45 * mm])
        tabla_modifica.setStyle(TableStyle([
            ('SPAN', (0, 0), (1, 0)), # Une la fila del título
            ('BACKGROUND', (0, 0), (-1, -1), GRIS_CLARO), # Fondo crema
            ('LINELEFT', (0, 0), (0, -1), 2.5, NARANJA_BURDEOS), # Línea lateral naranja
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('TOPPADDING', (0, 0), (-1, -1), 2),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
            ('RIGHTPADDING', (0, 0), (-1, -1), 4),
        ]))
        
        story.append(tabla_modifica)
    
    story.append(Spacer(1, 4))
    story.append(_linea())

    # ---------- 4. Tabla de ítems ----------
    encabezado = [
        Paragraph("Cant.", header_tabla_style),
        Paragraph("Descripción", header_tabla_style),
        Paragraph("P.Unit", header_tabla_der_style),
        Paragraph("Subtotal", header_tabla_der_style),
    ]
    table_data = [encabezado]

    for item in items:
        cantidad = float(item.cantidad)
        precio_unit = float(item.precio_unitario)
        subtotal = round(cantidad * precio_unit, 2)
        
        # En caso de Nota de Débito/Crédito, la SUNAT suele exigir que la descripción empiece con el motivo
        desc = item.producto.nombre if item.producto else f"Prod #{item.producto_id}"
        
        if es_nota_debito or es_nota_credito:
            motivo_limpio = tipo_nota_texto.split("-")[-1].strip().upper()
            if getattr(venta, 'documento_referencia', None):
                tipo_ref = "FACTURA" if venta.documento_referencia.tipo_comprobante == "factura" else "BOLETA"
                serie_ref = venta.documento_referencia.serie or "B001"
                num_ref = str(venta.documento_referencia.numero or venta.documento_referencia.id).zfill(8)
                desc = f"{motivo_limpio} — {tipo_ref} {serie_ref}-{num_ref}"

        table_data.append([
            Paragraph(f"{cantidad:g}", celda_izq_style),
            Paragraph(desc, celda_izq_style),
            Paragraph(f"{precio_unit:,.2f}", celda_der_style),
            Paragraph(f"{subtotal:,.2f}", celda_der_style),
        ])

    t = Table(table_data, colWidths=[8 * mm, 35 * mm, 13 * mm, 14 * mm], repeatRows=1)
    estilo_tabla = [
        ('BACKGROUND', (0, 0), (-1, 0), ACENTO),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LINEBELOW', (0, 0), (-1, 0), 0.6, ACENTO),
        ('LINEBELOW', (0, -1), (-1, -1), 0.6, colors.HexColor("#cccccc")),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]
    t.setStyle(TableStyle(estilo_tabla))
    story.append(t)

    # ---------- 5. Totales ----------
    total = float(venta.total)
    igv = round(total - (total / 1.18), 2)
    subtotal_neto = round(total - igv, 2)

    totales_tabla = Table(
        [
            [Paragraph("Op. Gravada", total_label_style), Paragraph(f"S/ {subtotal_neto:,.2f}", total_valor_style)],
            [Paragraph("I.G.V. (18%)", total_label_style), Paragraph(f"S/ {igv:,.2f}", total_valor_style)],
            [Paragraph("TOTAL", total_final_label_style), Paragraph(f"S/ {total:,.2f}", total_final_valor_style)],
        ],
        colWidths=[35 * mm, 35 * mm],
    )
    totales_tabla.setStyle(TableStyle([
        ('TOPPADDING', (0, 0), (-1, 1), 1.5),
        ('BOTTOMPADDING', (0, 0), (-1, 1), 1.5),
        ('LINEABOVE', (0, 2), (-1, 2), 0.7, NEGRO),
        ('TOPPADDING', (0, 2), (-1, 2), 3),
    ]))
    story.append(Spacer(1, 4))
    story.append(totales_tabla)

    story.append(Paragraph(_monto_a_legenda(total), legenda_style))
    story.append(_linea(espacio_antes=6, espacio_despues=6))

    # ---------- 6. QR + footer ----------
    qr_data = f"{ruc_emisor}|{tipo_comp}|{serie_numero}|{igv:.2f}|{total:.2f}|{fecha_emision[:10]}"
    try:
        qr_img = _generar_qr(qr_data)
        qr_img.hAlign = 'CENTER'
        story.append(qr_img)
    except Exception:
        pass  # si falla la generación del QR, el comprobante igual se genera

    story.append(Spacer(1, 4))
    
    if es_nota_credito:
        texto_repr = "Representación impresa de la nota de crédito electrónica."
    elif es_nota_debito:
        texto_repr = "Representación impresa de la nota de débito electrónica."
    else:
        texto_repr = "Representación impresa del comprobante electrónico."
    
    story.append(Paragraph(texto_repr, footer_style))
    story.append(Paragraph("Consulte su documento en apisunat.com", footer_bold_style))
    story.append(Paragraph("¡Gracias por su compra!", footer_gracias_style))

    doc.build(story)
    buffer.seek(0)
    return buffer.getvalue()