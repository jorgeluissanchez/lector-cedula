package io.github.jorgeluissanchez.lectorcedula.calidad

import io.github.jorgeluissanchez.lectorcedula.mrz.LocalizarMrz
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

/**
 * Presencia de documento antes de `listo` (OFF-22, OFF-25) en Kotlin (sdk-nativo, NAT-04). Puerto literal de
 * `packages/capture/src/calidad/presencia.ts`: tarjeta ID-1 por bordes rectos y contenido PDF417 o MRZ (TD1, TD3).
 * Las constantes de calibración son las de la fuente.
 */
object Presencia {
    data class Rect(val x: Int, val y: Int, val ancho: Int, val alto: Int)

    data class Resultado(val tarjeta: Rect?, val contenido: Contenido?, val presente: Boolean)

    private const val UMBRAL_BORDE = 24
    private const val FRACCION_LINEA = 0.3
    private const val TOLERANCIA_PROPORCION = 0.2
    private const val MARGEN = 0.06
    private const val BLOQUE = 8
    private const val BORDE_MEDIO_PDF417 = 12
    private const val RELACION_DX_DY = 3
    private const val FRACCION_BLOQUES_PDF417 = 0.12
    private const val MAX_VENTANAS_MRZ = 6
    private const val EVIDENCIA_MINIMA_MRZ = 0.6
    private const val BORDE_MEDIO_SUAVE = 1.5
    private const val RELACION_DX_DY_SUAVE = 1.5
    private const val ENERGIA_FILA_SUAVE = 0.5
    private const val FRACCION_BLOQUES_SUAVE = 0.08
    private const val PASO_BORDE = 2

    private fun lumas(f: FrameAnalisis, r: Rect): IntArray {
        val l = IntArray(r.ancho * r.alto)
        for (y in 0 until r.alto) {
            for (x in 0 until r.ancho) {
                val i = ((r.y + y) * f.ancho + r.x + x) * 4
                val p = f.pixeles
                l[y * r.ancho + x] = ((p[i].toInt() and 0xFF) * 77 + (p[i + 1].toInt() and 0xFF) * 150 + (p[i + 2].toInt() and 0xFF) * 29) shr 8
            }
        }
        return l
    }

    private fun recorteGuia(f: FrameAnalisis, guia: Cuadrilatero): Rect {
        val x0 = guia.minOf { it.x }
        val y0 = guia.minOf { it.y }
        val w = guia.maxOf { it.x } - x0
        val h = guia.maxOf { it.y } - y0
        val x = max(0.0, floor(x0 - MARGEN * w)).toInt()
        val y = max(0.0, floor(y0 - MARGEN * h)).toInt()
        val x1 = min(f.ancho.toDouble(), ceil(x0 + w + MARGEN * w)).toInt()
        val y1 = min(f.alto.toDouble(), ceil(y0 + h + MARGEN * h)).toInt()
        return Rect(x, y, x1 - x, y1 - y)
    }

    /** Rectángulo exterior de las líneas rectas largas del recorte, si tiene proporción ID-1. */
    fun buscarTarjeta(l: IntArray, w: Int, h: Int): Rect? {
        val col = IntArray(w)
        val fila = IntArray(h)
        for (y in 0 until h - PASO_BORDE) {
            for (x in 0 until w - PASO_BORDE) {
                val v = l[y * w + x]
                if (abs(v - l[y * w + x + PASO_BORDE]) >= UMBRAL_BORDE) col[x]++
                if (abs(v - l[(y + PASO_BORDE) * w + x]) >= UMBRAL_BORDE) fila[y]++
            }
        }
        val cols = (0 until w).filter { col[it] >= FRACCION_LINEA * h }
        val filas = (0 until h).filter { fila[it] >= FRACCION_LINEA * w }
        if (cols.size < 2 || filas.size < 2) return null
        val x0 = cols.first() + PASO_BORDE - 1
        val x1 = cols.last()
        val y0 = filas.first() + PASO_BORDE - 1
        val y1 = filas.last()
        val ancho = x1 - x0
        val alto = y1 - y0
        if (ancho < FRACCION_LINEA * w || alto < FRACCION_LINEA * h) return null
        val p = ancho.toDouble() / alto
        fun id1(objetivo: Double) = abs(p - objetivo) / objetivo <= TOLERANCIA_PROPORCION
        return if (id1(Guia.PROPORCION_ID1) || id1(1 / Guia.PROPORCION_ID1)) Rect(x0, y0, ancho, alto) else null
    }

    /** PDF417 nítido: fracción de bloques 8x8 con bordes verticales fuertes y casi sin horizontales. */
    fun hayPdf417(l: IntArray, w: Int, r: Rect): Boolean {
        var fuertes = 0
        var total = 0
        var by = r.y
        while (by + BLOQUE < r.y + r.alto) {
            var bx = r.x
            while (bx + BLOQUE < r.x + r.ancho) {
                var sx = 0
                var sy = 0
                for (y in by until by + BLOQUE) {
                    for (x in bx until bx + BLOQUE) {
                        val i = y * w + x
                        sx += abs(l[i] - l[i + 1])
                        sy += abs(l[i] - l[i + w])
                    }
                }
                total++
                if (sx > BLOQUE * BLOQUE * BORDE_MEDIO_PDF417 && sx > RELACION_DX_DY * sy) fuertes++
                bx += BLOQUE
            }
            by += BLOQUE
        }
        return total > 0 && fuertes >= FRACCION_BLOQUES_PDF417 * total
    }

    /** PDF417 con el patrón suave (desenfoque, ruido, JPEG). */
    fun hayPdf417Suave(l: IntArray, w: Int, r: Rect): Boolean {
        var fuertes = 0
        var total = 0
        val filas = DoubleArray(BLOQUE)
        var by = r.y
        while (by + BLOQUE < r.y + r.alto) {
            var bx = r.x
            while (bx + BLOQUE < r.x + r.ancho) {
                var sx = 0.0
                var sy = 0.0
                for (y in by until by + BLOQUE) {
                    var e = 0.0
                    for (x in bx until bx + BLOQUE) {
                        val i = y * w + x
                        e += abs(l[i] - l[i + 1])
                        sy += abs(l[i] - l[i + w])
                    }
                    filas[y - by] = e
                    sx += e
                }
                total++
                val minimaFila = filas.min()
                if (sx > BLOQUE * BLOQUE * BORDE_MEDIO_SUAVE && sx > RELACION_DX_DY_SUAVE * sy && minimaFila >= (ENERGIA_FILA_SUAVE * sx) / BLOQUE) fuertes++
                bx += BLOQUE
            }
            by += BLOQUE
        }
        return total > 0 && fuertes >= FRACCION_BLOQUES_SUAVE * total
    }

    private fun trioUnico(e: LocalizarMrz.Evidencia) = e.ventanas in 1..MAX_VENTANAS_MRZ

    private fun esMrz(e: LocalizarMrz.Evidencia) = trioUnico(e) && (e.evidencia ?: 0.0) >= EVIDENCIA_MINIMA_MRZ

    /** MRZ TD1 en las 4 orientaciones (OFF-22b) sobre la luminancia LMI de la tarjeta. */
    fun hayMrz(l: IntArray, w: Int, h: Int): Boolean {
        if (w < h) {
            val (a, aw, ah) = LocalizarMrz.girar(l, w, h, 90)
            if (esMrz(LocalizarMrz.evidenciaTd1(a, aw, ah))) return true
            val (b, bw, bh) = LocalizarMrz.girar(l, w, h, 270)
            return esMrz(LocalizarMrz.evidenciaTd1(b, bw, bh))
        }
        val derecha = LocalizarMrz.evidenciaTd1(l, w, h)
        if (esMrz(derecha)) return true
        if (!trioUnico(derecha)) return false
        val (g, gw, gh) = LocalizarMrz.girar(l, w, h, 180)
        return esMrz(LocalizarMrz.evidenciaTd1(g, gw, gh))
    }

    /** OD-20: par TD3 en las 4 orientaciones. */
    fun hayMrzTd3(l: IntArray, w: Int, h: Int): Boolean {
        if (w < h) {
            val (a, aw, ah) = LocalizarMrz.girar(l, w, h, 90)
            if (esMrz(LocalizarMrz.evidenciaTd3(a, aw, ah))) return true
            val (b, bw, bh) = LocalizarMrz.girar(l, w, h, 270)
            return esMrz(LocalizarMrz.evidenciaTd3(b, bw, bh))
        }
        if (esMrz(LocalizarMrz.evidenciaTd3(l, w, h))) return true
        val (g, gw, gh) = LocalizarMrz.girar(l, w, h, 180)
        return esMrz(LocalizarMrz.evidenciaTd3(g, gw, gh))
    }

    private class Traspuesta(val l: IntArray, val w: Int, val r: Rect)

    private fun traspuesta(l: IntArray, w: Int, r: Rect): Traspuesta {
        val t = IntArray(r.ancho * r.alto)
        for (y in 0 until r.alto) for (x in 0 until r.ancho) t[x * r.alto + y] = l[(r.y + y) * w + r.x + x]
        return Traspuesta(t, r.alto, Rect(0, 0, r.alto, r.ancho))
    }

    private fun lumaMrz(f: FrameAnalisis, r: Rect): IntArray {
        val sub = ByteArray(r.ancho * r.alto * 4)
        for (y in 0 until r.alto) System.arraycopy(f.pixeles, ((r.y + y) * f.ancho + r.x) * 4, sub, y * r.ancho * 4, r.ancho * 4)
        return LocalizarMrz.luminancias(sub, r.ancho * r.alto)
    }

    /** OFF-22: tarjeta en la guía y contenido (PDF417, MRZ TD1 o TD3). */
    fun detectar(frame: FrameAnalisis, guia: Cuadrilatero): Resultado {
        val recorte = recorteGuia(frame, guia)
        if (recorte.ancho < 8 || recorte.alto < 8) return Resultado(null, null, false)
        val l = lumas(frame, recorte)
        val t = buscarTarjeta(l, recorte.ancho, recorte.alto) ?: return Resultado(null, null, false)
        val tarjeta = Rect(recorte.x + t.x, recorte.y + t.y, t.ancho, t.alto)
        val vertical = if (t.alto > t.ancho) traspuesta(l, recorte.ancho, t) else null
        if (hayPdf417(l, recorte.ancho, t) || (vertical != null && hayPdf417(vertical.l, vertical.w, vertical.r))) return Resultado(tarjeta, Contenido.PDF417, true)
        val mrz = lumaMrz(frame, tarjeta)
        if (hayMrz(mrz, tarjeta.ancho, tarjeta.alto)) return Resultado(tarjeta, Contenido.MRZ_TD1, true)
        if (hayMrzTd3(mrz, tarjeta.ancho, tarjeta.alto)) return Resultado(tarjeta, Contenido.MRZ_TD3, true)
        if (hayPdf417Suave(l, recorte.ancho, t) || (vertical != null && hayPdf417Suave(vertical.l, vertical.w, vertical.r))) return Resultado(tarjeta, Contenido.PDF417, true)
        return Resultado(tarjeta, null, false)
    }

    /** Sin documento, la calidad nunca llega al umbral de `listo`: score umbral - 1 y motivo `acerca`. */
    fun aplicarPresencia(r: ResultadoCalidad, presente: Boolean, umbralListo: Int): ResultadoCalidad {
        if (presente || r.score < umbralListo) return r
        return r.copy(score = umbralListo - 1, motivo = Motivo.ACERCA)
    }

    /**
     * OFF-22 y OFF-25: la presencia es una condición adicional, nunca un sustituto. Solo se evalúa si el score ya llega a
     * `umbralListo`; por debajo el resultado no cambia (recalibración del 2026-10-10, ver la fuente TS).
     */
    fun evaluarConPresencia(r: ResultadoCalidad, presencia: () -> Boolean, umbralListo: Int): ResultadoCalidad =
        if (r.score >= umbralListo) aplicarPresencia(r, presencia(), umbralListo) else r
}
