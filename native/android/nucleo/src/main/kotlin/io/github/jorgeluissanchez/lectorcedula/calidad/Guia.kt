package io.github.jorgeluissanchez.lectorcedula.calidad

import kotlin.math.max
import kotlin.math.min

/**
 * Guía de encuadre (CAM-08, SDK-61) y reducción del frame de análisis (CAL-01) en Kotlin (sdk-nativo, NAT-03 y NAT-04).
 * Puerto de `packages/capture/src/flujo/guia.ts` y `calidad/reduccion.ts`.
 */
object Guia {
    /** Proporción ID-1 (85,60:53,98; hipótesis C01). */
    const val PROPORCION_ID1 = 85.6 / 53.98
    private const val FRACCION_MAXIMA = 0.9

    /** Lado largo del frame de análisis (CAL-01). */
    const val LADO_ANALISIS = 640

    /** Guía centrada en píxeles del frame, con lados y posiciones redondeados (CAM-08). */
    fun calcularGuia(ancho: Int, alto: Int, horizontalForzada: Boolean? = null, margen: Double? = null): Caja {
        val horizontal = horizontalForzada ?: (ancho >= alto)
        val fraccion = if (margen == null) FRACCION_MAXIMA else 1 - 2 * margen
        val anchoMax = fraccion * ancho
        val altoMax = fraccion * alto
        val anchoGuia = Calidad.redondear(if (horizontal) min(anchoMax, altoMax * PROPORCION_ID1) else min(anchoMax, altoMax / PROPORCION_ID1))
        val altoGuia = Calidad.redondear(if (horizontal) min(altoMax, anchoMax / PROPORCION_ID1) else min(altoMax, anchoMax * PROPORCION_ID1))
        return Caja(
            Calidad.redondear((ancho - anchoGuia) / 2.0).toDouble(),
            Calidad.redondear((alto - altoGuia) / 2.0).toDouble(),
            anchoGuia.toDouble(),
            altoGuia.toDouble(),
        )
    }

    /** Guía del frame original escalada, sin redondear, al frame de análisis. */
    fun guiaEnAnalisis(ancho: Int, alto: Int, anchoOriginal: Int, altoOriginal: Int, guia: Caja? = null): Cuadrilatero {
        val g = guia ?: calcularGuia(anchoOriginal, altoOriginal)
        val x0 = (g.x * ancho) / anchoOriginal
        val x1 = ((g.x + g.ancho) * ancho) / anchoOriginal
        val y0 = (g.y * alto) / altoOriginal
        val y1 = ((g.y + g.alto) * alto) / altoOriginal
        return listOf(Punto(x0, y0), Punto(x1, y0), Punto(x1, y1), Punto(x0, y1))
    }

    /** NAT-04 y SDK-28: la guía normalizada (0..1) respecto al frame. */
    fun normalizada(guia: Caja, ancho: Int, alto: Int): Caja = Caja(guia.x / ancho, guia.y / alto, guia.ancho / ancho, guia.alto / alto)

    /** Dimensiones del frame de análisis (CAL-01): lado largo 640 px (o el del original si es menor). */
    fun dimensionesAnalisis(ancho: Int, alto: Int): Pair<Int, Int> {
        val largo = max(ancho, alto)
        if (largo <= LADO_ANALISIS) return ancho to alto
        val escala = LADO_ANALISIS.toDouble() / largo
        return if (ancho >= alto) LADO_ANALISIS to Calidad.redondear(alto * escala) else Calidad.redondear(ancho * escala) to LADO_ANALISIS
    }

    /**
     * Reduce RGBA al tamaño de CAL-01 promediando por área: cada píxel destino es la media redondeada de los píxeles
     * fuente `[floor(x·sx), floor((x+1)·sx))`. Determinista (enteros); `CT` aplica la misma reducción en el lado TS.
     */
    fun reducir(pixeles: ByteArray, ancho: Int, alto: Int): Triple<ByteArray, Int, Int> {
        val (an, al) = dimensionesAnalisis(ancho, alto)
        if (an == ancho && al == alto) return Triple(pixeles.copyOf(), ancho, alto)
        val salida = ByteArray(an * al * 4)
        for (yd in 0 until al) {
            val y0 = (yd.toLong() * alto / al).toInt()
            val y1 = max(y0 + 1, ((yd + 1).toLong() * alto / al).toInt())
            for (xd in 0 until an) {
                val x0 = (xd.toLong() * ancho / an).toInt()
                val x1 = max(x0 + 1, ((xd + 1).toLong() * ancho / an).toInt())
                val n = (y1 - y0) * (x1 - x0)
                for (k in 0 until 4) {
                    var s = 0
                    for (y in y0 until y1) for (x in x0 until x1) s += pixeles[(y * ancho + x) * 4 + k].toInt() and 0xFF
                    salida[(yd * an + xd) * 4 + k] = ((s + n / 2) / n).toByte()
                }
            }
        }
        return Triple(salida, an, al)
    }
}
