package io.github.jorgeluissanchez.lectorcedula.calidad

import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

/**
 * Score de calidad de CAL-07 en Kotlin (sdk-nativo, NAT-03). Puerto literal de `packages/capture/src/calidad`
 * (`rampa`, `luminancia`, `region`, `nitidez`, `reflejo`, `exposicion`, `tamano` y `score`), con la misma aritmética
 * (enteros donde la fuente usa enteros, `Math.round` de JavaScript) para que el diferencial (`CT`) dé |Δscore| <= 2 y
 * el mismo motivo. Puro y determinista; no retiene el frame.
 */
object Calidad {
    /** `Math.round` de JavaScript: redondea .5 hacia +infinito. */
    internal fun redondear(x: Double): Int = floor(x + 0.5).toInt()

    /** `rampa(x, a, b)` de la spec `calidad-captura`. */
    fun rampa(x: Double, a: Double, b: Double): Int {
        if (x <= a) return 0
        if (x >= b) return 100
        return redondear((100 * (x - a)) / (b - a))
    }

    /** Luminancia entera de CAL-01: `Y = (77·R + 150·G + 29·B + 128) >> 8`. */
    fun luminancia(r: Int, g: Int, b: Int): Int = (77 * r + 150 * g + 29 * b + 128) shr 8

    /** Luminancia de cada píxel RGBA (el alfa se ignora). */
    fun luminanciasFrame(pixeles: ByteArray, ancho: Int, alto: Int): IntArray {
        val total = ancho * alto
        val y = IntArray(total)
        var o = 0
        for (i in 0 until total) {
            y[i] = luminancia(pixeles[o].toInt() and 0xFF, pixeles[o + 1].toInt() and 0xFF, pixeles[o + 2].toInt() and 0xFF)
            o += 4
        }
        return y
    }

    private const val TOLERANCIA = 1e-9

    /** Área con signo por la fórmula del polígono. */
    fun areaConSigno(c: Cuadrilatero): Double {
        var doble = 0.0
        for (i in 0 until 4) {
            val p0 = c[i]
            val p1 = c[(i + 1) % 4]
            doble += p0.x * p1.y - p1.x * p0.y
        }
        return doble / 2
    }

    private fun esConvexo(c: Cuadrilatero): Boolean {
        var positivos = 0
        var negativos = 0
        for (i in 0 until 4) {
            val a = c[i]
            val b = c[(i + 1) % 4]
            val d = c[(i + 2) % 4]
            val cruz = (b.x - a.x) * (d.y - b.y) - (b.y - a.y) * (d.x - b.x)
            if (cruz > 0) positivos++ else if (cruz < 0) negativos++
        }
        return positivos == 0 || negativos == 0
    }

    /** M de CAL-02: máscara (1 dentro) y su tamaño, o `null` si el cuadrilátero es inválido. */
    fun calcularRegion(c: Cuadrilatero, ancho: Int, alto: Int): Pair<ByteArray, Int>? {
        if (c.size != 4 || !c.all { it.x.isFinite() && it.y.isFinite() }) return null
        if (!esConvexo(c)) return null
        val area = areaConSigno(c)
        if (area == 0.0) return null
        val signo = if (area > 0) 1.0 else -1.0
        val xs = c.map { it.x }
        val ys = c.map { it.y }
        val xMin = max(0.0, floor(xs.min() - 0.5)).toInt()
        val xMax = min((ancho - 1).toDouble(), ceil(xs.max() - 0.5)).toInt()
        val yMin = max(0.0, floor(ys.min() - 0.5)).toInt()
        val yMax = min((alto - 1).toDouble(), ceil(ys.max() - 0.5)).toInt()
        val aristas = DoubleArray(16)
        for (i in 0 until 4) {
            val a = c[i]
            val b = c[(i + 1) % 4]
            aristas[i * 4] = a.x
            aristas[i * 4 + 1] = a.y
            aristas[i * 4 + 2] = signo * (b.x - a.x)
            aristas[i * 4 + 3] = signo * (b.y - a.y)
        }
        val mascara = ByteArray(ancho * alto)
        var tamano = 0
        for (y in yMin..yMax) {
            val py = y + 0.5
            for (x in xMin..xMax) {
                val px = x + 0.5
                var dentro = true
                var k = 0
                while (k < 16 && dentro) {
                    dentro = aristas[k + 2] * (py - aristas[k + 1]) - aristas[k + 3] * (px - aristas[k]) >= -TOLERANCIA
                    k += 4
                }
                if (dentro) {
                    mascara[y * ancho + x] = 1
                    tamano++
                }
            }
        }
        return if (tamano == 0) null else mascara to tamano
    }

    /** Nitidez de CAL-03: varianza poblacional del Laplaciano de 4 vecinos sobre M sin el borde del frame. */
    fun medirNitidez(lum: IntArray, mascara: ByteArray, ancho: Int, alto: Int, u: Umbrales): MetricaNitidez {
        fun laplaciano(i: Int) = lum[i - 1] + lum[i + 1] + lum[i - ancho] + lum[i + ancho] - 4 * lum[i]
        var n = 0
        var suma = 0.0
        for (y in 1 until alto - 1) {
            for (i in y * ancho + 1 until y * ancho + ancho - 1) {
                if (mascara[i].toInt() != 1) continue
                suma += laplaciano(i)
                n++
            }
        }
        var varianza = 0.0
        if (n > 0) {
            val media = suma / n
            var cuadrados = 0.0
            for (y in 1 until alto - 1) {
                for (i in y * ancho + 1 until y * ancho + ancho - 1) {
                    if (mascara[i].toInt() != 1) continue
                    val d = laplaciano(i) - media
                    cuadrados += d * d
                }
            }
            varianza = cuadrados / n
        }
        return MetricaNitidez(varianza, rampa(varianza, u.laplacianoDesenfocado, u.laplacianoNitido))
    }

    /** Reflejo de CAL-04: fracción saturada y mayor componente 4-conexo saturado, entre el tamaño de M. */
    fun medirReflejo(lum: IntArray, mascara: ByteArray, ancho: Int, alto: Int, tamanoM: Int, u: Umbrales): MetricaReflejo {
        val total = ancho * alto
        val visitados = BooleanArray(total)
        val pila = IntArray(total)
        fun saturado(i: Int) = mascara[i].toInt() == 1 && lum[i] >= u.luminanciaSaturada
        var saturados = 0
        var mayor = 0
        for (inicio in 0 until total) {
            if (!saturado(inicio)) continue
            saturados++
            if (visitados[inicio]) continue
            var area = 0
            var tope = 0
            pila[tope++] = inicio
            visitados[inicio] = true
            while (tope > 0) {
                val i = pila[--tope]
                area++
                val x = i % ancho
                val vecinos = intArrayOf(if (x > 0) i - 1 else -1, if (x < ancho - 1) i + 1 else -1, i - ancho, i + ancho)
                for (v in vecinos) {
                    if (v >= 0 && v < total && !visitados[v] && saturado(v)) {
                        visitados[v] = true
                        pila[tope++] = v
                    }
                }
            }
            if (area > mayor) mayor = area
        }
        val fraccionSaturada = saturados.toDouble() / tamanoM
        val componenteMayor = mayor.toDouble() / tamanoM
        val peor = max(fraccionSaturada / u.fraccionSaturadaMax, componenteMayor / u.componenteSaturadoMax)
        return MetricaReflejo(fraccionSaturada, componenteMayor, 100 - rampa(peor, 0.0, 1.0))
    }

    /** Exposición de CAL-05 sobre M. */
    fun medirExposicion(lum: IntArray, mascara: ByteArray, tamanoM: Int, u: Umbrales): MetricaExposicion {
        var suma = 0.0
        var oscuros = 0
        for (i in mascara.indices) {
            if (mascara[i].toInt() != 1) continue
            val y = lum[i]
            suma += y
            if (y <= u.luminanciaOscura) oscuros++
        }
        val media = suma / tamanoM
        val fraccionOscura = oscuros.toDouble() / tamanoM
        return MetricaExposicion(
            media,
            fraccionOscura,
            min(rampa(media, u.mediaNegra, u.mediaOscuraOk), 100 - rampa(fraccionOscura, 0.0, u.fraccionOscuraMax)),
            100 - rampa(media, u.mediaClaraOk, u.mediaBlanca),
        )
    }

    /** Tamaño relativo de CAL-06 (solo con `fuente` modelo). */
    fun medirTamano(c: Cuadrilatero, ancho: Int, alto: Int, u: Umbrales): MetricaTamano {
        val ratio = abs(areaConSigno(c)) / (ancho.toDouble() * alto)
        return MetricaTamano(ratio, rampa(ratio, u.ratioMinimo, u.ratioOk))
    }

    private fun frameValido(f: FrameAnalisis): Boolean = f.ancho > 0 && f.alto > 0 && f.pixeles.size == f.ancho * f.alto * 4

    private val NO_ENCONTRADO = ResultadoAnalisis.Ok(ResultadoCalidad(0, Motivo.ACERCA, null))

    /** Score de CAL-07: mínimo de los subscores; en empate gana el primero de [Motivo]. */
    fun analizarFrame(frame: FrameAnalisis, deteccion: DeteccionDocumento, u: Umbrales): ResultadoAnalisis {
        if (!frameValido(frame)) return ResultadoAnalisis.Error("frame-invalido")
        val ancho = frame.ancho
        val alto = frame.alto
        val cuad = deteccion.cuadrilatero ?: return NO_ENCONTRADO
        val (mascara, tamanoM) = calcularRegion(cuad, ancho, alto) ?: return ResultadoAnalisis.Error("cuadrilatero-invalido")
        val lum = luminanciasFrame(frame.pixeles, ancho, alto)
        val nitidez = medirNitidez(lum, mascara, ancho, alto, u)
        val reflejo = medirReflejo(lum, mascara, ancho, alto, tamanoM, u)
        val exposicion = medirExposicion(lum, mascara, tamanoM, u)
        val tamano = if (deteccion.fuente == DeteccionDocumento.Fuente.MODELO) medirTamano(cuad, ancho, alto, u) else null
        val subscores = mapOf(
            Motivo.ACERCA to tamano?.subscore,
            Motivo.OSCURO to exposicion.subscoreOscuro,
            Motivo.SOBREEXPUESTO to exposicion.subscoreSobreexpuesto,
            Motivo.REFLEJO to reflejo.subscore,
            Motivo.DESENFOCADO to nitidez.subscore,
        )
        var score = 100
        var limitante = Motivo.DESENFOCADO
        for (motivo in Motivo.entries.reversed()) {
            val s = subscores[motivo] ?: continue
            if (s <= score) {
                score = s
                limitante = motivo
            }
        }
        val motivo = if (score < u.umbralListo) limitante else null
        return ResultadoAnalisis.Ok(ResultadoCalidad(score, motivo, MetricasCalidad(nitidez, reflejo, exposicion, tamano)))
    }
}
