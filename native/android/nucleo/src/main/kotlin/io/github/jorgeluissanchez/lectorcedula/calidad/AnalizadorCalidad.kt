package io.github.jorgeluissanchez.lectorcedula.calidad

/**
 * Evaluación de un frame como el Worker de calidad de la web (`worker-calidad.ts` con `presencia: true` y
 * `contenidoTd: true`): detector de guía (CAL-14), score de CAL-07 y presencia OFF-22/OFF-25. NAT-03 y NAT-04.
 */
class AnalizadorCalidad(private val umbrales: Umbrales = Umbrales.POR_DEFECTO) {
    /** Resultado de calidad, contenido detectado (`null` si la presencia no se evaluó) y guía de análisis. */
    data class Evaluacion(val resultado: ResultadoCalidad, val contenido: Contenido?, val guia: Cuadrilatero)

    /** Evalúa un frame de análisis; `null` si el frame o la guía son inválidos (`frame-invalido`, `cuadrilatero-invalido`). */
    fun evaluar(frame: FrameAnalisis): Evaluacion? {
        val guia = Guia.guiaEnAnalisis(frame.ancho, frame.alto, frame.anchoOriginal, frame.altoOriginal, frame.guia)
        val r = Calidad.analizarFrame(frame, DeteccionDocumento(guia, DeteccionDocumento.Fuente.GUIA), umbrales)
        if (r !is ResultadoAnalisis.Ok) return null
        var contenido: Contenido? = null
        val resultado = Presencia.evaluarConPresencia(
            r.resultado,
            {
                val p = Presencia.detectar(frame, guia)
                contenido = p.contenido
                p.presente
            },
            umbrales.umbralListo,
            umbrales.laplacianoMinimoGuiado,
        )
        return Evaluacion(resultado, contenido, guia)
    }

    /** Reduce un frame RGBA completo a CAL-01 y lo evalúa. No retiene `pixeles`. */
    fun evaluarCompleto(pixeles: ByteArray, ancho: Int, alto: Int, guia: Caja? = null): Evaluacion? {
        val (reducido, an, al) = Guia.reducir(pixeles, ancho, alto)
        try {
            return evaluar(FrameAnalisis(an, al, reducido, ancho, alto, guia))
        } finally {
            reducido.fill(0)
        }
    }
}
