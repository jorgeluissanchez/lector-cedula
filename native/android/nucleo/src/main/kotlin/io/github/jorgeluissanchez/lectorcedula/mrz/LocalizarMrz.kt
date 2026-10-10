package io.github.jorgeluissanchez.lectorcedula.mrz

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/**
 * Localización de la franja MRZ (LMI-11, LMI-14, OD-20) en Kotlin (sdk-nativo, NAT-04 y NAT-06). Puerto literal de
 * `packages/capture/src/mrz/localizar.ts` sobre luminancias (la fuente las calcula de RGBA con
 * `(306 R + 601 G + 117 B) >> 10`; girar RGBA y luego medir es igual que medir y luego girar). Pura y total.
 */
object LocalizarMrz {
    data class CajaMrz(val x: Int, val y: Int, val ancho: Int, val alto: Int)

    data class Banda(val inicio: Int, val fin: Int) {
        val alto: Int get() = fin - inicio + 1
        val dobleCentro: Int get() = inicio + fin
    }

    /** Luminancia de LMI: `(306 R + 601 G + 117 B) >> 10`. */
    fun luminancias(rgba: ByteArray, n: Int): IntArray {
        val l = IntArray(n)
        for (i in 0 until n) {
            val o = i * 4
            l[i] = (306 * (rgba[o].toInt() and 0xFF) + 601 * (rgba[o + 1].toInt() and 0xFF) + 117 * (rgba[o + 2].toInt() and 0xFF)) shr 10
        }
        return l
    }

    /** Luminancias giradas `grados` en sentido horario (90, 180 o 270) con sus nuevas dimensiones. */
    fun girar(l: IntArray, w: Int, h: Int, grados: Int): Triple<IntArray, Int, Int> {
        val d = IntArray(w * h)
        if (grados == 180) {
            val n = w * h
            for (i in 0 until n) d[i] = l[n - 1 - i]
            return Triple(d, w, h)
        }
        for (yd in 0 until w) {
            for (xd in 0 until h) {
                val xs = if (grados == 90) yd else w - 1 - yd
                val ys = if (grados == 90) h - 1 - xd else xd
                d[yd * h + xd] = l[ys * w + xs]
            }
        }
        return Triple(d, h, w)
    }

    private const val TOLERANCIA_ALTURA = 0.35
    private const val TOLERANCIA_SEPARACION = 0.25

    private fun bandas(conteos: IntArray, desde: Int, minimo: Int): List<Banda> {
        val r = ArrayList<Banda>()
        var inicio = -1
        for (y in desde..conteos.size) {
            val tinta = (if (y < conteos.size) conteos[y] else 0) >= minimo
            if (tinta && inicio < 0) inicio = y
            if (!tinta && inicio >= 0) {
                r.add(Banda(inicio, y - 1))
                inicio = -1
            }
        }
        return r
    }

    /** Criterio de regularidad de LMI-01b para 3 bandas consecutivas. */
    fun bandasRegulares(a: Banda, b: Banda, c: Banda): Boolean {
        val altos = intArrayOf(a.alto, b.alto, c.alto)
        val media = (a.alto + b.alto + c.alto) / 3.0
        if (altos.max() - altos.min() >= TOLERANCIA_ALTURA * media) return false
        val s1 = (b.dobleCentro - a.dobleCentro) / 2.0
        val s2 = (c.dobleCentro - b.dobleCentro) / 2.0
        return abs(s1 - s2) < (TOLERANCIA_SEPARACION * (s1 + s2)) / 2
    }

    private const val TRAMOS_MINIMOS = 20
    private const val RELACION_MINIMA = 0.5
    private const val RELACION_MAXIMA = 2.5

    /** LMI-14: el trío tiene forma de MRZ horizontal. */
    fun esTrioMrzHorizontal(tramos: IntArray, altoMedio: Double, ancho: Int): Boolean {
        val t = tramos.min()
        if (t < TRAMOS_MINIMOS) return false
        val relacion = (t * altoMedio) / ancho
        return relacion >= RELACION_MINIMA && relacion <= RELACION_MAXIMA
    }

    private const val FRACCION_COLUMNA_FONDO = 0.8
    private const val UMBRAL_BORDE_MAXIMO = 40
    private const val UMBRAL_BORDE_MINIMO = 12
    private const val FACTOR_UMBRAL = 0.5
    private const val PERCENTIL_UMBRAL = 0.99
    private const val FRACCION_BORDES_FILA = 0.03

    private fun percentilSaltos(luma: IntArray, base: Int, w: Int, hf: Int, p: Double): Int {
        val hist = IntArray(256)
        for (y in 0 until hf) for (x in 0 until w - 1) hist[abs(luma[base + y * w + x] - luma[base + y * w + x + 1])]++
        val objetivo = p * hf * (w - 1)
        var acumulado = 0
        for (v in 0 until 256) {
            acumulado += hist[v]
            if (acumulado >= objetivo) return v
        }
        return 255
    }

    /** Bordes y bandas de texto de una ventana (compartido por el trío TD1 y el par TD3). */
    private class Ventana(luma: IntArray, val w: Int, val y0: Int, val hf: Int) {
        private val base = y0 * w
        val umbral: Int
        private val bordes: BooleanArray
        private val utilCol: BooleanArray
        val utiles: Int
        val encontradas: List<Banda>

        init {
            umbral = min(UMBRAL_BORDE_MAXIMO, max(UMBRAL_BORDE_MINIMO, redondear(FACTOR_UMBRAL * percentilSaltos(luma, base, w, hf, PERCENTIL_UMBRAL))))
            bordes = BooleanArray(w * hf)
            val bordeCol = IntArray(w)
            for (y in 0 until hf) {
                for (x in 0 until w) {
                    val b = x + 1 < w && abs(luma[base + y * w + x] - luma[base + y * w + x + 1]) >= umbral
                    bordes[y * w + x] = b
                    if (b) bordeCol[x]++
                }
            }
            utilCol = BooleanArray(w) { bordeCol[it] < FRACCION_COLUMNA_FONDO * hf }
            utiles = utilCol.count { it }
            encontradas = if (utiles == 0) {
                emptyList()
            } else {
                val conteos = IntArray(hf)
                for (y in 0 until hf) {
                    var n = 0
                    for (x in 0 until w) if (utilCol[x] && bordes[y * w + x]) n++
                    conteos[y] = n
                }
                bandas(conteos, 0, max(2, kotlin.math.ceil(FRACCION_BORDES_FILA * utiles).toInt()))
            }
        }

        fun util(x: Int) = utilCol[x]

        fun borde(x: Int, y: Int) = bordes[y * w + x]
    }

    private fun redondear(x: Double): Int = kotlin.math.floor(x + 0.5).toInt()

    /** Trío ajustado de una ventana: caja (en filas de la imagen) y medidas LMI-14, o `null`. */
    data class Trio(val caja: CajaMrz, val tramos: IntArray, val altoMedio: Double, val ancho: Int)

    fun analizarVentana(luma: IntArray, w: Int, h: Int, f: CajaMrz): Trio? {
        val y0 = f.y
        val hf = f.alto
        val v = Ventana(luma, w, y0, hf)
        if (v.utiles == 0) return null
        val enc = v.encontradas
        for (i in enc.size - 3 downTo 0) {
            val a = enc[i]
            val b = enc[i + 1]
            val c = enc[i + 2]
            if (!bandasRegulares(a, b, c)) continue
            if ((a.inicio == 0 && y0 > 0) || (c.fin == hf - 1 && y0 + hf < h)) continue
            val filasLineas = a.alto + b.alto + c.alto
            val filasHuecos = c.fin - a.inicio + 1 - filasLineas
            fun enLinea(y: Int) = (y >= a.inicio && y <= a.fin) || (y >= b.inicio && y <= b.fin) || (y >= c.inicio && y <= c.fin)
            fun columna(x: Int): Boolean {
                if (!v.util(x)) return false
                var lineas = 0
                var huecos = 0
                for (y in a.inicio..c.fin) {
                    if (!v.borde(x, y)) continue
                    if (enLinea(y)) lineas++ else huecos++
                }
                return lineas > 0 && huecos.toDouble() * filasLineas <= 0.5 * lineas * filasHuecos
            }
            val altoMedio = (a.alto + b.alto + c.alto) / 3.0
            val (x0, x1) = grupoMayor(::columna, w, altoMedio)
            val margen = redondear(altoMedio * 0.5)
            val izq = max(0, x0 - margen)
            val der = min(w, x1 + 1 + margen)
            val arriba = max(0, a.inicio - margen)
            val abajo = min(hf, c.fin + 1 + margen)
            val tramos = IntArray(3)
            listOf(a, b, c).forEachIndexed { k, banda ->
                var n = 0
                var antes = false
                for (x in x0..x1) {
                    var hay = false
                    var y = banda.inicio
                    while (y <= banda.fin && !hay) {
                        hay = v.util(x) && v.borde(x, y)
                        y++
                    }
                    if (hay && !antes) n++
                    antes = hay
                }
                tramos[k] = n
            }
            return Trio(CajaMrz(izq, y0 + arriba, der - izq, abajo - arriba), tramos, altoMedio, x1 - x0 + 1)
        }
        return null
    }

    private fun grupoMayor(activa: (Int) -> Boolean, w: Int, hueco: Double): Pair<Int, Int> {
        var mejorX0 = 0
        var mejorX1 = -1
        var mejorN = 0
        var x0 = 0
        var x1 = -1
        var n = 0
        for (x in 0 until w) {
            if (!activa(x)) continue
            if (n == 0 || x - x1 - 1 > hueco) {
                x0 = x
                x1 = x
                n = 0
            }
            x1 = x
            n++
            if (n > mejorN) {
                mejorX0 = x0
                mejorX1 = x1
                mejorN = n
            }
        }
        return mejorX0 to mejorX1
    }

    private val FRACCIONES_FRANJA = doubleArrayOf(0.15, 0.3, 0.45)
    private const val FRACCION_PASO = 0.05

    /** LMI-11: ventanas horizontales de todo el ancho, de abajo arriba, sin repetir cajas. */
    fun ventanasFranja(w: Int, h: Int): List<CajaMrz> {
        val paso = max(1, redondear(FRACCION_PASO * h))
        val r = ArrayList<CajaMrz>()
        for (fraccion in FRACCIONES_FRANJA) {
            val alto = max(1, redondear(fraccion * h))
            val vistas = HashSet<Int>()
            var y = h - alto
            while (y > -paso) {
                val y0 = max(0, y)
                if (vistas.add(y0)) r.add(CajaMrz(0, y0, w, min(alto, h - y0)))
                y -= paso
            }
        }
        return r
    }

    /** LMI-14a: número de ventanas con trío MRZ horizontal y evidencia (mayor centro vertical relativo) o `null`. */
    data class Evidencia(val evidencia: Double?, val ventanas: Int)

    fun evidenciaTd1(luma: IntArray, w: Int, h: Int): Evidencia {
        var evidencia: Double? = null
        var ventanas = 0
        for (f in ventanasFranja(w, h)) {
            val t = analizarVentana(luma, w, h, f) ?: continue
            if (!esTrioMrzHorizontal(t.tramos, t.altoMedio, t.ancho)) continue
            ventanas++
            val centro = (t.caja.y + t.caja.alto / 2.0) / h
            if (evidencia == null || centro > evidencia) evidencia = centro
        }
        return Evidencia(evidencia, ventanas)
    }

    private const val TRAMOS_MINIMOS_TD3 = 30

    /** OD-20: par TD3 horizontal en la ventana; devuelve el centro vertical (filas de la imagen) o `null`. */
    fun parTd3(luma: IntArray, w: Int, h: Int, f: CajaMrz): Double? = parTd3ConCaja(luma, w, h, f)?.centro

    /** OD-20 y OD-21: par TD3 con su centro vertical y la caja ajustada al par (margen de medio alto de línea). */
    data class ParTd3(val centro: Double, val caja: CajaMrz)

    fun parTd3ConCaja(luma: IntArray, w: Int, h: Int, f: CajaMrz): ParTd3? {
        val y0 = f.y
        val hf = f.alto
        val v = Ventana(luma, w, y0, hf)
        if (v.utiles == 0) return null
        val enc = v.encontradas
        for (i in enc.size - 2 downTo 0) {
            val a = enc[i]
            val b = enc[i + 1]
            val media = (a.alto + b.alto) / 2.0
            if (abs(a.alto - b.alto) >= TOLERANCIA_ALTURA * media) continue
            val separacion = (b.dobleCentro - a.dobleCentro) / 2.0
            if (separacion < 1.1 * media || separacion > 2.5 * media) continue
            if ((a.inicio == 0 && y0 > 0) || (b.fin == hf - 1 && y0 + hf < h)) continue
            var t = Int.MAX_VALUE
            var ancho = Int.MIN_VALUE
            var xMin = Int.MAX_VALUE
            var xMax = Int.MIN_VALUE
            for (banda in listOf(a, b)) {
                var n = 0
                var antes = false
                var x0 = w
                var x1 = -1
                for (x in 0 until w) {
                    var hay = false
                    var y = banda.inicio
                    while (y <= banda.fin && !hay) {
                        hay = v.util(x) && v.borde(x, y)
                        y++
                    }
                    if (hay) {
                        x0 = min(x0, x)
                        x1 = x
                    }
                    if (hay && !antes) n++
                    antes = hay
                }
                t = min(t, n)
                ancho = max(ancho, x1 - x0 + 1)
                xMin = min(xMin, x0)
                xMax = max(xMax, x1)
            }
            if (t < TRAMOS_MINIMOS_TD3) continue
            val relacion = (t * media) / ancho
            if (relacion < RELACION_MINIMA || relacion > RELACION_MAXIMA) continue
            val margen = redondear(media * 0.5)
            val izq = max(0, xMin - margen)
            val der = min(w, xMax + 1 + margen)
            val arriba = max(0, a.inicio - margen)
            val abajo = min(hf, b.fin + 1 + margen)
            return ParTd3(y0 + (a.dobleCentro + b.dobleCentro) / 4.0, CajaMrz(izq, y0 + arriba, der - izq, abajo - arriba))
        }
        return null
    }

    /** OD-20: ventanas con par TD3 y la mayor posición vertical relativa de su centro. */
    fun evidenciaTd3(luma: IntArray, w: Int, h: Int): Evidencia {
        var evidencia: Double? = null
        var ventanas = 0
        for (f in ventanasFranja(w, h)) {
            val centro = parTd3(luma, w, h, f) ?: continue
            ventanas++
            if (evidencia == null || centro / h > evidencia) evidencia = centro / h
        }
        return Evidencia(evidencia, ventanas)
    }
}
