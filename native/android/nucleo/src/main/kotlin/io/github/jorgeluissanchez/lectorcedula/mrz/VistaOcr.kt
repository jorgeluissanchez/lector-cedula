package io.github.jorgeluissanchez.lectorcedula.mrz

import io.github.jorgeluissanchez.lectorcedula.mrz.LocalizarMrz.CajaMrz
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

/**
 * Imagen que recibe el OCR en cada intento (sdk-nativo, NAT-06): puerto literal de `recortarYAmpliar` (LMI-04) y de
 * `enderezar`/`estimarInclinacion` (LMI-04, LMI-06) de `packages/capture/src/mrz`, con el giro bilineal de
 * `pdf417/pixeles.ts`. Las funciones trigonométricas usan [StrictMath] (fdlibm, la misma base que V8) y los
 * redondeos replican `Math.round` y la conversión de `Uint8ClampedArray` (mitad al par), para que la vista sea byte a
 * byte la de la web. Puro y total.
 */
object VistaOcr {
    /** Ancho mínimo de la imagen que recibe el OCR (LMI-04). */
    const val ANCHO_MINIMO_OCR = 900

    const val INCLINACION_MAXIMA = 4.0
    const val PASO_INCLINACION = 0.25
    const val INCLINACION_MINIMA = 0.5

    /** Conversión de un número a `Uint8ClampedArray` (ToUint8Clamp: recorte y redondeo al par en el empate). */
    internal fun aUint8Clamp(v: Double): Int = when {
        v.isNaN() || v <= 0 -> 0
        v >= 255 -> 255
        else -> Math.rint(v).toInt()
    }

    /** Recorta `caja` y la amplía (bilineal) hasta [ANCHO_MINIMO_OCR] px de ancho si es más estrecha. */
    fun recortarYAmpliar(p: ImagenRgba, caja: CajaMrz): ImagenRgba {
        val factor = max(1.0, ANCHO_MINIMO_OCR.toDouble() / caja.ancho)
        val w = max(caja.ancho, ceil(caja.ancho * factor).toInt())
        val h = max(1, PlanMrz.redondearJs(caja.alto * factor).toInt())
        val d = ByteArray(w * h * 4)
        for (y in 0 until h) {
            val sy = min((caja.alto - 1).toDouble(), max(0.0, (y + 0.5) / factor - 0.5))
            val y0 = floor(sy).toInt()
            val y1 = min(caja.alto - 1, y0 + 1)
            val fy = sy - y0
            for (x in 0 until w) {
                val sx = min((caja.ancho - 1).toDouble(), max(0.0, (x + 0.5) / factor - 0.5))
                val x0 = floor(sx).toInt()
                val x1 = min(caja.ancho - 1, x0 + 1)
                val fx = sx - x0
                val o = (y * w + x) * 4
                for (k in 0 until 4) {
                    fun v(yy: Int, xx: Int): Double = p.canal(((caja.y + yy) * p.ancho + caja.x + xx) * 4 + k).toDouble()
                    val r = (v(y0, x0) * (1 - fx) + v(y0, x1) * fx) * (1 - fy) + (v(y1, x0) * (1 - fx) + v(y1, x1) * fx) * fy
                    d[o + k] = aUint8Clamp(r).toByte()
                }
            }
        }
        return ImagenRgba(d, w, h)
    }

    /** Ángulos probados ordenados por valor absoluto (0, 0,25, -0,25, ...): ante empate gana el menor giro. */
    fun angulosProbados(): DoubleArray {
        val r = arrayListOf(0.0)
        var k = 1
        while (k * PASO_INCLINACION <= INCLINACION_MAXIMA) {
            r.add(k * PASO_INCLINACION)
            r.add(-k * PASO_INCLINACION)
            k++
        }
        return r.toDoubleArray()
    }

    /** Inclinación estimada del texto en grados (positiva si las líneas bajan hacia la derecha), o 0 sin tinta. */
    fun estimarInclinacion(p: ImagenRgba): Double {
        val w = p.ancho
        val h = p.alto
        val luma = PlanMrz.luminancias(p)
        val t = PlanMrz.umbralOtsu(luma) ?: -1
        var n = 0
        for (v in luma) if (v <= t) n++
        val px = IntArray(n)
        val py = IntArray(n)
        var i = 0
        for (y in 0 until h) {
            for (x in 0 until w) {
                if (luma[y * w + x] <= t) {
                    px[i] = x
                    py[i] = y
                    i++
                }
            }
        }
        val filas = DoubleArray(h + 2 * w)
        var mejorAngulo = 0.0
        var mejorPuntaje = -1.0
        for (angulo in angulosProbados()) {
            val tan = StrictMath.tan(angulo * Math.PI / 180)
            filas.fill(0.0)
            for (j in 0 until n) {
                val fila = PlanMrz.redondearJs(py[j] - px[j] * tan).toInt() + w
                filas[fila] += 1.0
            }
            var puntaje = 0.0
            for (v in filas) puntaje += v * v
            if (puntaje > mejorPuntaje) {
                mejorPuntaje = puntaje
                mejorAngulo = angulo
            }
        }
        return mejorAngulo
    }

    /**
     * Gira `p` `grados` sobre su centro (positivo en sentido horario con el eje y hacia abajo), mismo tamaño, bilineal,
     * fondo blanco y salida en gris opaco (`girar` de `pdf417/pixeles.ts`).
     */
    fun girarGris(p: ImagenRgba, grados: Double): ImagenRgba {
        val w = p.ancho
        val h = p.alto
        val luma = FloatArray(w * h)
        for (i in luma.indices) {
            val o = i * 4
            luma[i] = ((306 * p.canal(o) + 601 * p.canal(o + 1) + 117 * p.canal(o + 2)).toDouble() / 1024).toFloat()
        }
        val d = ByteArray(w * h * 4)
        val rad = grados * Math.PI / 180
        val cos = StrictMath.cos(rad)
        val sin = StrictMath.sin(rad)
        val cx = (w - 1) / 2.0
        val cy = (h - 1) / 2.0
        for (y in 0 until h) {
            val dy = y - cy
            for (x in 0 until w) {
                val dx = x - cx
                val sx = cx + dx * cos + dy * sin
                val sy = cy - dx * sin + dy * cos
                val x0 = floor(sx).toInt()
                val y0 = floor(sy).toInt()
                val fx = sx - floor(sx)
                val fy = sy - floor(sy)
                val dentroX0 = x0 >= 0 && x0 < w
                val dentroX1 = x0 + 1 >= 0 && x0 + 1 < w
                val dentroY0 = y0 >= 0 && y0 < h
                val dentroY1 = y0 + 1 >= 0 && y0 + 1 < h
                val a = if (dentroX0 && dentroY0) luma[y0 * w + x0].toDouble() else 255.0
                val b = if (dentroX1 && dentroY0) luma[y0 * w + x0 + 1].toDouble() else 255.0
                val c = if (dentroX0 && dentroY1) luma[(y0 + 1) * w + x0].toDouble() else 255.0
                val e = if (dentroX1 && dentroY1) luma[(y0 + 1) * w + x0 + 1].toDouble() else 255.0
                val v = aUint8Clamp(PlanMrz.redondearJs((a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + e * fx) * fy)).toByte()
                val o = (y * w + x) * 4
                d[o] = v
                d[o + 1] = v
                d[o + 2] = v
                d[o + 3] = 255.toByte()
            }
        }
        return ImagenRgba(d, w, h)
    }

    /** `p` enderezado si su inclinación estimada alcanza [INCLINACION_MINIMA]; si no, `p` sin cambios. */
    fun enderezar(p: ImagenRgba): ImagenRgba {
        val angulo = estimarInclinacion(p)
        return if (abs(angulo) >= INCLINACION_MINIMA) girarGris(p, -angulo) else p
    }

    /** Imagen que recibe el OCR para un intento del plan (LMI-04: recorte ampliado y enderezado). */
    fun paraOcr(intento: IntentoPlan): ImagenRgba = enderezar(recortarYAmpliar(intento.imagen, intento.candidato.caja))
}
