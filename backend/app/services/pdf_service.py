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
import re
from datetime import datetime

# ==========================================
# Paleta y helpers de estilo
# ==========================================
NEGRO = colors.HexColor("#111827")
GRIS = colors.HexColor("#64748b")
GRIS_CLARO = colors.HexColor("#f8ece0") 
ACENTO = colors.HexColor("#2d6a4f")   # Verde corporativo de J&S Acabados
NARANJA_BURDEOS = colors.HexColor("#c84b24") 
ROJO_ANULADO = colors.HexColor("#dc2626") # Rojo para anulaciones
BLANCO = colors.white

def _linea(grosor=0.6, color=colors.HexColor("#e2e8f0"), espacio_antes=4, espacio_despues=4):
    return HRFlowable(width="100%", thickness=grosor, color=color,
                       spaceBefore=espacio_antes, spaceAfter=espacio_despues)

# ==========================================
# Monto a letras
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

def _generar_qr(data: str, size_mm: float = 30) -> Image:
    qr = qrcode.QRCode(border=1, box_size=6)
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return Image(buf, width=size_mm * mm, height=size_mm * mm)


# ==========================================
# 1. PDF DEL TICKET POS (FACTURAS/BOLETAS)
# ==========================================
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

    negocio_style = ParagraphStyle('Negocio', fontName='Helvetica-Bold', fontSize=11, alignment=TA_CENTER, textColor=NEGRO, leading=13, spaceAfter=2)
    dato_negocio_style = ParagraphStyle('DatoNegocio', fontName='Helvetica', fontSize=7.5, alignment=TA_CENTER, textColor=GRIS, leading=10)
    tipo_doc_style = ParagraphStyle('TipoDoc', fontName='Helvetica-Bold', fontSize=10, alignment=TA_CENTER, textColor=colors.white, leading=13)
    nro_doc_style = ParagraphStyle('NroDoc', fontName='Helvetica-Bold', fontSize=9.5, alignment=TA_CENTER, textColor=colors.white, leading=12)
    etiqueta_style = ParagraphStyle('Etiqueta', fontName='Helvetica', fontSize=7.5, textColor=GRIS, leading=11)
    valor_style = ParagraphStyle('Valor', fontName='Helvetica', fontSize=7.5, textColor=NEGRO, alignment=TA_RIGHT, leading=11)
    
    celda_izq_style = ParagraphStyle('CeldaIzq', fontName='Helvetica', fontSize=6.8, leading=8.4)
    celda_der_style = ParagraphStyle('CeldaDer', fontName='Helvetica', fontSize=6.8, leading=8.4, alignment=TA_RIGHT)
    header_tabla_style = ParagraphStyle('HeaderTabla', fontName='Helvetica-Bold', fontSize=6.8, textColor=colors.white, leading=8.4)
    header_tabla_der_style = ParagraphStyle('HeaderTablaDer', parent=header_tabla_style, alignment=TA_RIGHT)
    total_label_style = ParagraphStyle('TotalLabel', fontName='Helvetica', fontSize=7.5, alignment=TA_LEFT, textColor=NEGRO)
    total_valor_style = ParagraphStyle('TotalValor', fontName='Helvetica', fontSize=7.5, alignment=TA_RIGHT, textColor=NEGRO)
    total_final_label_style = ParagraphStyle('TotalFinalLabel', fontName='Helvetica-Bold', fontSize=10, alignment=TA_LEFT, textColor=NEGRO)
    total_final_valor_style = ParagraphStyle('TotalFinalValor', fontName='Helvetica-Bold', fontSize=10, alignment=TA_RIGHT, textColor=NEGRO)
    legenda_style = ParagraphStyle('Legenda', fontName='Helvetica-Oblique', fontSize=7, alignment=TA_CENTER, textColor=ACENTO, leading=9, spaceBefore=4)
    footer_style = ParagraphStyle('Footer', fontName='Helvetica', fontSize=6.6, alignment=TA_CENTER, textColor=GRIS, leading=8.6)
    footer_bold_style = ParagraphStyle('FooterBold', parent=footer_style, fontName='Helvetica-Bold', textColor=NEGRO)
    footer_gracias_style = ParagraphStyle('FooterGracias', parent=footer_style, fontName='Helvetica-Oblique', textColor=ACENTO)

    razon_social = getattr(venta, 'emisor_razon_social', None) or "HUACHACA PALACIOS SONIA AYDEE"
    ruc_emisor = getattr(venta, 'emisor_ruc', None) or "10062517323"
    direccion_emisor = getattr(venta, 'emisor_direccion', None) or "AV. PROCERES DE LA INDEPENDENCIA NRO. 2009"

    story.append(Paragraph(razon_social, negocio_style))
    story.append(Paragraph(f"R.U.C. {ruc_emisor}", dato_negocio_style))
    story.append(Paragraph(direccion_emisor, dato_negocio_style))
    story.append(Spacer(1, 6))

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

    recuadro = Table([[Paragraph(tipo_doc, tipo_doc_style)], [Paragraph(serie_numero, nro_doc_style)]], colWidths=[70 * mm])
    recuadro.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), ACENTO),
        ('TOPPADDING', (0, 0), (-1, 0), 5),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 1),
        ('TOPPADDING', (0, 1), (-1, 1), 1),
        ('BOTTOMPADDING', (0, 1), (-1, 1), 5),
    ]))
    story.append(recuadro)
    story.append(Spacer(1, 6))

    fecha_emision = venta.fecha.strftime('%d/%m/%Y %H:%M') if venta.fecha else "-"
    cliente_nombre = venta.cliente.nombre if venta.cliente else "CLIENTE GENERAL"
    cliente_doc = (getattr(venta.cliente, 'documento', '') or getattr(venta.cliente, 'numero_documento', '') or getattr(venta.cliente, 'ruc', '') or getattr(venta.cliente, 'dni', '') or "00000000")

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
    story.append(Spacer(1, 4))
    story.append(_linea())

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
        desc = item.producto.nombre if item.producto else f"Prod #{item.producto_id}"

        table_data.append([
            Paragraph(f"{cantidad:g}", celda_izq_style),
            Paragraph(desc, celda_izq_style),
            Paragraph(f"{precio_unit:,.2f}", celda_der_style),
            Paragraph(f"{subtotal:,.2f}", celda_der_style),
        ])

    t = Table(table_data, colWidths=[8 * mm, 35 * mm, 13 * mm, 14 * mm], repeatRows=1)
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), ACENTO),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LINEBELOW', (0, 0), (-1, 0), 0.6, ACENTO),
        ('LINEBELOW', (0, -1), (-1, -1), 0.6, colors.HexColor("#cccccc")),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    story.append(t)

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

    qr_data = f"{ruc_emisor}|{tipo_comp}|{serie_numero}|{igv:.2f}|{total:.2f}|{fecha_emision[:10]}"
    try:
        qr_img = _generar_qr(qr_data)
        qr_img.hAlign = 'CENTER'
        story.append(qr_img)
    except Exception:
        pass

    story.append(Spacer(1, 4))
    story.append(Paragraph("Representación impresa del comprobante electrónico.", footer_style))
    story.append(Paragraph("Consulte su documento en apisunat.com", footer_bold_style))
    story.append(Paragraph("¡Gracias por su compra!", footer_gracias_style))

    doc.build(story)
    buffer.seek(0)
    return buffer.getvalue()


# ==========================================
# 2. PDF DE LA GUÍA DE REMISIÓN (ADAPTADO PÚBLICO / PRIVADO / ANULADO)
# ==========================================
def generar_pdf_guia_remision(guia, items):
    buffer = io.BytesIO()

    PAGE_WIDTH = 210 * mm
    PAGE_HEIGHT = 297 * mm
    margin = 12 * mm

    doc = SimpleDocTemplate(
        buffer,
        pagesize=(PAGE_WIDTH, PAGE_HEIGHT),
        leftMargin=margin,
        rightMargin=margin,
        topMargin=margin,
        bottomMargin=margin,
    )

    story = []
    
    # Evaluar si la guía está anulada
    esta_anulada = guia.estado_sunat == "anulado"

    estilo_titulo_emisor = ParagraphStyle('EmisorH1', fontName='Helvetica-Bold', fontSize=14.5, alignment=TA_CENTER, textColor=NEGRO, leading=16)
    estilo_sub_emisor = ParagraphStyle('EmisorP', fontName='Helvetica', fontSize=9, alignment=TA_CENTER, textColor=GRIS, leading=12)
    
    estilo_banner_ruc = ParagraphStyle('BannerRuc', fontName='Helvetica-Bold', fontSize=9.5, alignment=TA_CENTER, textColor=BLANCO, leading=12)
    estilo_banner_titulo = ParagraphStyle('BannerTitulo', fontName='Helvetica-Bold', fontSize=10.5, alignment=TA_CENTER, textColor=BLANCO, leading=13)
    estilo_banner_nro = ParagraphStyle('BannerNro', fontName='Helvetica-Bold', fontSize=11.5, alignment=TA_CENTER, textColor=BLANCO, leading=14)
    
    estilo_etiqueta = ParagraphStyle('KvLabel', fontName='Helvetica', fontSize=9.5, textColor=GRIS, leading=13)
    estilo_valor = ParagraphStyle('KvVal', fontName='Helvetica-Bold', fontSize=9.5, textColor=NEGRO, leading=13)
    
    estilo_h2 = ParagraphStyle('H2', fontName='Helvetica-Bold', fontSize=9, textColor=ACENTO, leading=12, spaceBefore=10, spaceAfter=4)
    
    estilo_tabla_header = ParagraphStyle('Th', fontName='Helvetica-Bold', fontSize=9, alignment=TA_LEFT, textColor=BLANCO, leading=11)
    estilo_tabla_header_c = ParagraphStyle('ThC', parent=estilo_tabla_header, alignment=TA_CENTER)
    
    estilo_tabla_celda = ParagraphStyle('Td', fontName='Helvetica', fontSize=9, alignment=TA_LEFT, textColor=NEGRO, leading=12)
    estilo_tabla_celda_c = ParagraphStyle('TdC', parent=estilo_tabla_celda, alignment=TA_CENTER)

    estilo_motivo = ParagraphStyle('Motivo', fontName='Helvetica', fontSize=9, textColor=NEGRO, leading=12)
    
    estilo_footer = ParagraphStyle('Pie', fontName='Helvetica', fontSize=8, alignment=TA_CENTER, textColor=GRIS, leading=12)
    estilo_footer_bold = ParagraphStyle('PieBold', parent=estilo_footer, fontName='Helvetica-Bold', textColor=NEGRO)
    estilo_footer_gracias = ParagraphStyle('PieGracias', parent=estilo_footer, fontName='Helvetica-Oblique', textColor=ACENTO)

    # Estilos específicos para anulación
    estilo_anulado_etiqueta = ParagraphStyle('AnuladoLabel', fontName='Helvetica', fontSize=8, textColor=ROJO_ANULADO, leading=12)
    estilo_anulado_valor = ParagraphStyle('AnuladoVal', fontName='Helvetica-Bold', fontSize=8, textColor=ROJO_ANULADO, leading=12)

    razon_social = "HUACHACA PALACIOS SONIA AYDEE"
    ruc_emisor = "10062517323"
    direccion_emisor = "AV. PROCERES DE LA INDEPENDENCIA NRO. 2009"
    serie_numero = f"{guia.serie or 'T002'}-{str(guia.numero or guia.id).zfill(8)}"

    logo_tabla = Table(
        [
            [Paragraph("<b>J&S</b>", ParagraphStyle('LogoTxt', fontName='Helvetica-Bold', fontSize=20, alignment=TA_CENTER, textColor=BLANCO))],
            [Paragraph("ACABADOS", ParagraphStyle('LogoSub', fontName='Helvetica-Bold', fontSize=13, alignment=TA_CENTER, textColor=NEGRO, spaceBefore=4))]
        ],
        colWidths=[42 * mm]
    )
    logo_tabla.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, 0), ACENTO),
        ('TOPPADDING', (0, 0), (0, 0), 10),
        ('BOTTOMPADDING', (0, 0), (0, 0), 10),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))

    datos_empresa = [
        Paragraph(razon_social, estilo_titulo_emisor),
        Spacer(1, 2),
        Paragraph(f"R.U.C. {ruc_emisor}", estilo_sub_emisor),
        Paragraph(direccion_emisor, estilo_sub_emisor)
    ]

    # Modificación del Banner para mostrar la etiqueta de Anulado
    banner_content = [
        [Paragraph(f"R.U.C. {ruc_emisor}", estilo_banner_ruc)],
        [Paragraph("GUÍA DE REMISIÓN<br/>ELECTRÓNICA REMITENTE", estilo_banner_titulo)],
        [Paragraph(f"N° {serie_numero}", estilo_banner_nro)]
    ]
    
    if esta_anulada:
        etiqueta_anulado = Paragraph("<font color='#dc2626'><b>✖ ANULADO</b></font>", ParagraphStyle('AnuladoBanner', fontName='Helvetica-Bold', fontSize=9.5, alignment=TA_CENTER, leading=12))
        tabla_anulada = Table([[etiqueta_anulado]], colWidths=[45 * mm], rowHeights=[6 * mm])
        tabla_anulada.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), BLANCO),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('ROUNDEDCORNERS', [3, 3, 3, 3]),
        ]))
        banner_content.append([tabla_anulada])

    banner_guia = Table(
        banner_content,
        colWidths=[55 * mm],
        style=TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), ACENTO),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ])
    )

    tabla_cabecera = Table([[logo_tabla, datos_empresa, banner_guia]], colWidths=[45 * mm, 86 * mm, 55 * mm])
    tabla_cabecera.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'MIDDLE')]))
    story.append(tabla_cabecera)
    story.append(Spacer(1, 10))

    # --- DATOS GENERALES (KV) ---
    fecha_emision_str = guia.fecha_emision.strftime('%d/%m/%Y %H:%M') if guia.fecha_emision else ""
    fecha_traslado_str = guia.fecha_traslado.strftime('%d/%m/%Y') if guia.fecha_traslado else ""

    kv_data = [
        [Paragraph("Fecha de emisión:", estilo_etiqueta), Paragraph(fecha_emision_str, estilo_valor), Paragraph("Punto de partida:", estilo_etiqueta), Paragraph(guia.direccion_partida.upper(), estilo_valor)],
        [Paragraph("Inicio de traslado:", estilo_etiqueta), Paragraph(fecha_traslado_str, estilo_valor), Paragraph("Punto de llegada:", estilo_etiqueta), Paragraph(guia.direccion_llegada.upper(), estilo_valor)],
        [Paragraph("Destinatario:", estilo_etiqueta), Paragraph(guia.destinatario_nombre, estilo_valor), "", ""],
        [Paragraph("Documento:", estilo_etiqueta), Paragraph(str(guia.destinatario_num_doc), estilo_valor), "", ""]
    ]

    tabla_kv = Table(kv_data, colWidths=[28 * mm, 62 * mm, 30 * mm, 66 * mm])
    tabla_kv.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('LINEBELOW', (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ('SPAN', (1, 2), (3, 2)),
        ('SPAN', (1, 3), (3, 3)),
    ]))
    story.append(tabla_kv)
    story.append(Spacer(1, 4))

    # --- MOTIVO DE TRASLADO ---
    story.append(Paragraph("MOTIVO DE TRASLADO", estilo_h2))
    story.append(_linea(grosor=1.5, color=ACENTO, espacio_antes=0, espacio_despues=4))

    motivos_lista = [
        ("01", "01 Venta"), ("02", "02 Compra"), ("03", "03 Venta con entrega a terceros"), ("04", "04 Traslado entre establecimientos de la misma empresa"),
        ("05", "05 Consignación"), ("06", "06 Devolución"), ("07", "07 Recojo de bienes transformados"), ("08", "08 Importación"),
        ("09", "09 Exportación"), ("13", "13 Otros"), ("14", "14 Venta sujeta a confirmación del comprador"), ("17", "17 Traslado de bienes para transformación"),
        ("18", "18 Traslado emisor itinerante CP"), ("19", "19 Traslado a zona primaria"), ("", ""), ("", "")
    ]

    matriz_motivos = []
    fila_actual = []
    for codigo, texto in motivos_lista:
        if codigo == "":
            chk_html = '<font face="Helvetica" size="9">[  ]</font>'
        else:
            if guia.motivo_traslado == codigo:
                chk_html = '<font face="Helvetica" size="9" color="white"><font backcolor="#2d6a4f"><b>&nbsp;✓&nbsp;</b></font></font>'
            else:
                chk_html = '<font face="Helvetica" size="9">[  ]</font>'
        
        celda_txt = f"{chk_html} {texto}" if texto else ""
        fila_actual.append(Paragraph(celda_txt, estilo_motivo))
        
        if len(fila_actual) == 4:
            matriz_motivos.append(fila_actual)
            fila_actual = []

    tabla_motivos = Table(matriz_motivos, colWidths=[46 * mm, 46 * mm, 46 * mm, 48 * mm])
    tabla_motivos.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ]))
    story.append(tabla_motivos)
    story.append(Spacer(1, 4))

    # --- DATOS DEL BIEN TRANSPORTADO ---
    story.append(Paragraph("DATOS DEL BIEN TRANSPORTADO", estilo_h2))
    story.append(_linea(grosor=1.5, color=ACENTO, espacio_antes=0, espacio_despues=4))

    encabezados_bienes = [
        Paragraph("N°", estilo_tabla_header_c),
        Paragraph("Código", estilo_tabla_header),
        Paragraph("Descripción", estilo_tabla_header),
        Paragraph("Cantidad", estilo_tabla_header_c),
        Paragraph("Unidad", estilo_tabla_header_c)
    ]
    
    datos_bienes = [encabezados_bienes]
    for i, item in enumerate(items):
        unidad_texto = "CAJA" if item.unidad_medida != 'NIU' else "UND"
        datos_bienes.append([
            Paragraph(str(i+1), estilo_tabla_celda_c),
            Paragraph(str(item.codigo_producto), estilo_tabla_celda),
            Paragraph(str(item.descripcion), estilo_tabla_celda),
            Paragraph(str(item.cantidad), estilo_tabla_celda_c),
            Paragraph(unidad_texto, estilo_tabla_celda_c)
        ])

    tabla_bienes = Table(datos_bienes, colWidths=[12 * mm, 30 * mm, 102 * mm, 20 * mm, 22 * mm], repeatRows=1)
    tabla_bienes.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), ACENTO),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LINEBELOW', (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    story.append(tabla_bienes)
    story.append(Spacer(1, 6))

    # --- UNIDAD DE TRANSPORTE Y CONDUCTOR ---
    story.append(Paragraph("UNIDAD DE TRANSPORTE Y CONDUCTOR", estilo_h2))
    story.append(_linea(grosor=1.5, color=ACENTO, espacio_antes=0, espacio_despues=4))

    es_publico = guia.modalidad_transporte == '01'
    modalidad_texto = "TRANSPORTE PÚBLICO" if es_publico else "TRANSPORTE PRIVADO"

    if es_publico:
        col_izq_data = [
            [Paragraph("RUC Transportista:", estilo_etiqueta), Paragraph(guia.transportista_doc or "---", estilo_valor)],
            [Paragraph("Empresa / Agencia:", estilo_etiqueta), Paragraph(guia.transportista_nombre or "---", estilo_valor)]
        ]
    else:
        col_izq_data = [
            [Paragraph("Placa del vehículo:", estilo_etiqueta), Paragraph(guia.vehiculo_placa or "---", estilo_valor)],
            [Paragraph("DNI del conductor:", estilo_etiqueta), Paragraph(guia.conductor_doc or "---", estilo_valor)]
        ]

    tabla_col_izq = Table(col_izq_data, colWidths=[35 * mm, 55 * mm])
    tabla_col_izq.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('LINEBELOW', (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
    ]))

    col_der_data = [
        [Paragraph("Modalidad:", estilo_etiqueta), Paragraph(modalidad_texto, estilo_valor)],
        [Paragraph("Peso total aprox. (KGM):", estilo_etiqueta), Paragraph(str(guia.peso_total), estilo_valor)]
    ]
    tabla_col_der = Table(col_der_data, colWidths=[45 * mm, 51 * mm])
    tabla_col_der.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('LINEBELOW', (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
    ]))

    tabla_dos_columnas = Table([[tabla_col_izq, tabla_col_der]], colWidths=[93 * mm, 93 * mm])
    tabla_dos_columnas.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP')]))
    story.append(tabla_dos_columnas)
    story.append(Spacer(1, 4))

    # --- CUADRO DE ANULACIÓN (Aparece solo si está anulada) ---
    if esta_anulada:
        fecha_baja = datetime.now().strftime('%d/%m/%Y')
        ticket_baja = ""
        # Buscar el ticket en las observaciones si existe
        if guia.observaciones_sunat:
            match = re.search(r"ticket:\s*([a-zA-Z0-9-]+)", guia.observaciones_sunat)
            if match:
                ticket_baja = match.group(1)

        cuadro_anulado_data = [
            [Paragraph("<b>⚠ Documento dado de baja</b> — Comunicación de baja aceptada por SUNAT.", ParagraphStyle('AnuladoTitulo', fontName='Helvetica-Bold', fontSize=8.5, textColor=ROJO_ANULADO, leading=12)), ""],
            [Paragraph("Fecha de baja:", estilo_anulado_etiqueta), Paragraph(fecha_baja, estilo_anulado_valor)],
            [Paragraph("Motivo de la baja:", estilo_anulado_etiqueta), Paragraph("Error en los datos de traslado o emisión", estilo_anulado_valor)],
            [Paragraph("N° de ticket / correlativo:", estilo_anulado_etiqueta), Paragraph(ticket_baja or "RA-NO-TICKET", estilo_anulado_valor)]
        ]
        
        tabla_cuadro_anulado = Table(cuadro_anulado_data, colWidths=[40 * mm, 140 * mm])
        tabla_cuadro_anulado.setStyle(TableStyle([
            ('SPAN', (0, 0), (1, 0)),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
            ('TOPPADDING', (0, 0), (-1, -1), 2),
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
            ('BOX', (0, 0), (-1, -1), 1, ROJO_ANULADO),
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#fef2f2")),
        ]))
        story.append(Spacer(1, 6))
        story.append(tabla_cuadro_anulado)
        story.append(Spacer(1, 4))

    # --- OBSERVACIONES ---
    story.append(Paragraph("OBSERVACIONES", estilo_h2))
    story.append(_linea(grosor=1.5, color=ACENTO, espacio_antes=0, espacio_despues=4))
    story.append(Paragraph(f"<b>Descripción / Motivo:</b> {guia.descripcion_motivo or 'Traslado de mercadería'}", estilo_etiqueta))
    story.append(Spacer(1, 10))

    # --- QR Y CONFORMIDAD DEL CLIENTE ---
    qr_data = f"{ruc_emisor}|09|{serie_numero}|0.00|0.00|{fecha_emision_str[:10]}"
    try:
        qr_img = _generar_qr(qr_data, size_mm=32)
    except Exception:
        qr_img = ""

    cuadro_conformidad_data = [
        [Paragraph("<br/><br/><br/>______________________________________________________<br/><b>Conformidad del cliente:</b><br/>Nombre:<br/>DNI:", estilo_etiqueta)]
    ]
    tabla_conformidad = Table(cuadro_conformidad_data, colWidths=[140 * mm], rowHeights=[32 * mm])
    tabla_conformidad.setStyle(TableStyle([
        ('BOX', (0, 0), (-1, -1), 1, ACENTO),
        ('ROUNDEDCORNERS', [3, 3, 3, 3]),
        ('VALIGN', (0, 0), (-1, -1), 'BOTTOM'),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ]))

    tabla_pie_final = Table([[qr_img, tabla_conformidad]], colWidths=[46 * mm, 140 * mm])
    tabla_pie_final.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('ALIGN', (0, 0), (0, -1), 'LEFT')
    ]))
    story.append(tabla_pie_final)
    story.append(Spacer(1, 14))

    # --- FOOTER ---
    story.append(_linea(grosor=0.5, color=colors.HexColor("#e2e8f0"), espacio_antes=4, espacio_despues=8))
    story.append(Paragraph("Representación impresa de la <b>guía de remisión electrónica</b>.", estilo_footer))
    story.append(Paragraph("<b>Consulte su documento en apisunat.com</b>", estilo_footer_bold))
    story.append(Paragraph("<i>¡Gracias por su preferencia!</i>", estilo_footer_gracias))

    # --- FUNCIÓN DE DIBUJO PARA LA MARCA DE AGUA (WATERMARK) ---
    def agregar_marca_agua(canvas, doc):
        if esta_anulada:
            canvas.saveState()
            canvas.setFont("Helvetica-Bold", 100)
            # Transparencia del 15% para que no tape el texto
            canvas.setFillColor(colors.Color(0.86, 0.15, 0.15, alpha=0.15)) 
            # Posicionar en el centro de la página A4 y rotar
            canvas.translate(PAGE_WIDTH / 2, PAGE_HEIGHT / 2)
            canvas.rotate(45)
            # Centrar el texto en el origen de rotación
            canvas.drawCentredString(0, -30, "ANULADO")
            canvas.restoreState()

    # Construir el documento inyectando la marca de agua en todas las páginas
    doc.build(story, onFirstPage=agregar_marca_agua, onLaterPages=agregar_marca_agua)
    
    buffer.seek(0)
    return buffer.getvalue()