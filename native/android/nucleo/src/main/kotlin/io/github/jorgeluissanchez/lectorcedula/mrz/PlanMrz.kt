package io.github.jorgeluissanchez.lectorcedula.mrz

import io.github.jorgeluissanchez.lectorcedula.mrz.LocalizarMrz.CajaMrz
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

/**
 * Imagen RGBA de 8 bits por canal (`ancho * alto * 4` bytes). La posee quien la crea; el núcleo solo la lee durante
 * la llamada y nunca la guarda (NAT-13).
 */
class ImagenRgba(val datos: ByteArray, val ancho: Int, val alto: Int) {
    init {
        require(ancho > 0 && alto > 0 && datos.size == ancho * alto * 4) { "imagen-invalida" }
    }

    internal fun canal(i: Int): Int = datos[i].toInt() and 0xFF
}

/** Formato de la MRZ que se busca (OD-21): TD1 (cédula digital, CE, TI) o TD3 (pasaporte). */
enum class FormatoMrz(val codigo: String) {
    TD1("td1"),
    TD3("td3"),
}

/** Método del candidato (LMI-01, LMI-10, LMI-11). */
enum class MetodoMrz(val codigo: String) {
    PROYECCION("proyeccion"),
    RECORTE_INFERIOR("recorte-inferior"),
    IMAGEN_COMPLETA("imagen-completa"),
    FRANJA("franja"),
}

data class CandidatoMrz(val metodo: MetodoMrz, val caja: CajaMrz)

/** Un intento del plan (LMI-12b): candidato de la vista girada `giro` grados en sentido horario (0 = derecha). */
class IntentoPlan(val giro: Int, val candidato: CandidatoMrz, val imagen: ImagenRgba) {
    /** Nombre del intento como en la web (`franja@90`, `proyeccion`, ...). */
    val nombre: String get() = candidato.metodo.codigo + if (giro == 0) "" else "@$giro"
}

/**
 * Plan de vistas y giros de la MRZ (sdk-nativo, NAT-06): puerto literal de `localizarConEvidencia`, `girar`,
 * `ordenVistasPorEvidencia`, `intentosMrz` e `intentosTd3` de `packages/capture/src/mrz` (LMI-01, LMI-10, LMI-11x,
 * LMI-12b, LMI-12c, LMI-14b, OD-20, OD-21). Puro y total. La paridad con la web la exige el diferencial de las pruebas.
 */
object PlanMrz {
    /** Giros de LMI-12 y LMI-12c en el orden de entrada de LMI-14b (la vista derecha va antes, con giro 0). */
    val GIROS = intArrayOf(90, 270, 180)

    private const val FRACCION_INFERIOR = 0.4
    private const val FRACCION_TINTA_FILA = 0.005

    /** `Math.round` de JavaScript: el entero más cercano y, en el empate, hacia +infinito. */
    internal fun redondearJs(x: Double): Double {
        val f = floor(x)
        return if (x - f >= 0.5) f + 1 else f
    }

    /** Luminancias de LMI (`(306 R + 601 G + 117 B) >> 10`). */
    fun luminancias(p: ImagenRgba): IntArray = LocalizarMrz.luminancias(p.datos, p.ancho * p.alto)

    /** Umbral de Otsu: la tinta es `luma <= t`; `null` si hay un solo nivel. */
    fun umbralOtsu(luma: IntArray): Int? {
        val hist = IntArray(256)
        for (v in luma) hist[v]++
        val total = luma.size
        var sumaTotal = 0.0
        for (i in 0 until 256) sumaTotal += i.toDouble() * hist[i]
        var pesoFondo = 0
        var sumaFondo = 0.0
        var mejor = 0.0
        var umbral: Int? = null
        for (t in 0 until 256) {
            pesoFondo += hist[t]
            if (pesoFondo == 0) continue
            val pesoFrente = total - pesoFondo
            if (pesoFrente == 0) break
            sumaFondo += t.toDouble() * hist[t]
            val m0 = sumaFondo / pesoFondo
            val m1 = (sumaTotal - sumaFondo) / pesoFrente
            val entre = pesoFondo.toDouble() * pesoFrente * (m0 - m1) * (m0 - m1)
            if (entre > mejor) {
                mejor = entre
                umbral = t
            }
        }
        return umbral
    }

    private fun bandas(conteos: IntArray, desde: Int, minimo: Int): List<LocalizarMrz.Banda> {
        val r = ArrayList<LocalizarMrz.Banda>()
        var inicio = -1
        for (y in desde..conteos.size) {
            val tinta = (if (y < conteos.size) conteos[y] else 0) >= minimo
            if (tinta && inicio < 0) inicio = y
            if (!tinta && inicio >= 0) {
                r.add(LocalizarMrz.Banda(inicio, y - 1))
                inicio = -1
            }
        }
        return r
    }

    private fun candidatoProyeccion(luma: IntArray, w: Int, h: Int): CandidatoMrz? {
        val t = umbralOtsu(luma) ?: -1
        val conteos = IntArray(h)
        val desde = h / 2
        for (y in desde until h) {
            var n = 0
            for (x in 0 until w) if (luma[y * w + x] <= t) n++
            conteos[y] = n
        }
        val enc = bandas(conteos, desde, max(1, ceil(FRACCION_TINTA_FILA * w).toInt()))
        for (i in enc.size - 3 downTo 0) {
            val a = enc[i]
            val b = enc[i + 1]
            val c = enc[i + 2]
            if (!LocalizarMrz.bandasRegulares(a, b, c)) continue
            var x0 = w
            var x1 = -1
            for (y in a.inicio..c.fin) {
                for (x in 0 until w) {
                    if (luma[y * w + x] <= t) {
                        if (x < x0) x0 = x
                        if (x > x1) x1 = x
                    }
                }
            }
            val margen = redondearJs((a.alto + b.alto + c.alto) / 3.0 * 0.5).toInt()
            val izq = max(0, x0 - margen)
            val der = min(w, x1 + 1 + margen)
            val arriba = max(0, a.inicio - margen)
            val abajo = min(h, c.fin + 1 + margen)
            return CandidatoMrz(MetodoMrz.PROYECCION, CajaMrz(izq, arriba, der - izq, abajo - arriba))
        }
        return null
    }

    /** Candidatos y evidencia de orientación de una vista (LMI-01, LMI-11, LMI-14a). */
    class Localizacion(val candidatos: List<CandidatoMrz>, val evidencia: Double?, val ventanasMrz: Int)

    fun localizarConEvidencia(p: ImagenRgba): Localizacion {
        val w = p.ancho
        val h = p.alto
        val y = redondearJs((1 - FRACCION_INFERIOR) * h).toInt()
        val luma = luminancias(p)
        val inferior = CandidatoMrz(MetodoMrz.RECORTE_INFERIOR, CajaMrz(0, y, w, h - y))
        val completa = CandidatoMrz(MetodoMrz.IMAGEN_COMPLETA, CajaMrz(0, 0, w, h))
        val r = ArrayList<CandidatoMrz>()
        candidatoProyeccion(luma, w, h)?.let(r::add)
        r.add(inferior)
        r.add(completa)
        var evidencia: Double? = null
        var ventanas = 0
        for (f in LocalizarMrz.ventanasFranja(w, h)) {
            val trio = LocalizarMrz.analizarVentana(luma, w, h, f)
            if (trio == null) {
                r.add(CandidatoMrz(MetodoMrz.FRANJA, f))
                continue
            }
            if (LocalizarMrz.esTrioMrzHorizontal(trio.tramos, trio.altoMedio, trio.ancho)) {
                ventanas++
                val centro = (trio.caja.y + trio.caja.alto / 2.0) / h
                if (evidencia == null || centro > evidencia) evidencia = centro
            }
            r.add(CandidatoMrz(MetodoMrz.FRANJA, trio.caja))
        }
        return Localizacion(r, evidencia, ventanas)
    }

    /** OD-20: ventanas con par TD3, la mayor posición vertical relativa de su centro y las cajas de los pares. */
    fun evidenciaTd3(p: ImagenRgba): Localizacion {
        val w = p.ancho
        val h = p.alto
        val luma = luminancias(p)
        var evidencia: Double? = null
        var ventanas = 0
        val candidatos = ArrayList<CandidatoMrz>()
        for (f in LocalizarMrz.ventanasFranja(w, h)) {
            val par = LocalizarMrz.parTd3ConCaja(luma, w, h, f) ?: continue
            ventanas++
            candidatos.add(CandidatoMrz(MetodoMrz.FRANJA, par.caja))
            if (evidencia == null || par.centro / h > evidencia) evidencia = par.centro / h
        }
        return Localizacion(candidatos, evidencia, ventanas)
    }

    /** LMI-12 y LMI-12c: copia de `p` girada 90, 180 o 270 grados en sentido horario. */
    fun girar(p: ImagenRgba, grados: Int): ImagenRgba {
        require(grados == 90 || grados == 180 || grados == 270) { "giro-invalido" }
        val w = p.ancho
        val h = p.alto
        val d = ByteArray(w * h * 4)
        if (grados == 180) {
            val n = w * h
            for (i in 0 until n) System.arraycopy(p.datos, (n - 1 - i) * 4, d, i * 4, 4)
            return ImagenRgba(d, w, h)
        }
        for (yd in 0 until w) {
            for (xd in 0 until h) {
                val xs = if (grados == 90) yd else w - 1 - yd
                val ys = if (grados == 90) h - 1 - xd else xd
                System.arraycopy(p.datos, (ys * w + xs) * 4, d, (yd * h + xd) * 4, 4)
            }
        }
        return ImagenRgba(d, h, w)
    }

    /** LMI-14b: evidencia de una vista para ordenarla. */
    data class EvidenciaVista(val giro: Int, val ventanasMrz: Int, val evidencia: Double?)

    /**
     * LMI-14b y LMI-14c: giros en orden de prueba. Primero el eje (0 y 180, 90 y 270) con más ventanas de MRZ
     * horizontal; empate, mayor evidencia (`null` al final); empate, el orden de entrada (orden estable).
     */
    fun ordenVistasPorEvidencia(vistas: List<EvidenciaVista>): List<Int> {
        fun eje(v: EvidenciaVista): Int = vistas.filter { it.giro % 180 == v.giro % 180 }.maxOf { it.ventanasMrz }
        return vistas.sortedWith { a, b ->
            val porEje = eje(b) - eje(a)
            if (porEje != 0) porEje else porEvidencia(a.evidencia, b.evidencia)
        }.map { it.giro }
    }

    /** Signo de `(b ?? -1) - (a ?? -1)` como el comparador de la web: mayor evidencia primero, `null` al final. */
    private fun porEvidencia(a: Double?, b: Double?): Int {
        val d = (b ?: -1.0) - (a ?: -1.0)
        return if (d > 0) 1 else if (d < 0) -1 else 0
    }

    private class Vista(val giro: Int, val imagen: ImagenRgba, val loc: Localizacion)

    private fun vistas(p: ImagenRgba): List<Pair<Int, ImagenRgba>> = listOf(0 to p) + GIROS.map { it to girar(p, it) }

    /**
     * LMI-12b: intentos en dos pasadas sobre las cuatro vistas, en el orden de LMI-14b, sin cajas repetidas dentro de
     * una vista. Pasada 1: los candidatos que no son ventanas literales de LMI-11; pasada 2: las ventanas literales.
     */
    fun intentosTd1(p: ImagenRgba): Sequence<IntentoPlan> = sequence {
        val todas = vistas(p).map { (g, img) -> Vista(g, img, localizarConEvidencia(img)) }
        val orden = ordenVistasPorEvidencia(todas.map { EvidenciaVista(it.giro, it.loc.ventanasMrz, it.loc.evidencia) })
        val ordenadas = orden.map { g -> todas.first { it.giro == g } }
        val literales = ArrayList<Pair<Vista, MutableList<CandidatoMrz>>>()
        val hechas = HashMap<Int, MutableSet<CajaMrz>>()
        for (v in ordenadas) {
            val ventanas = LocalizarMrz.ventanasFranja(v.imagen.ancho, v.imagen.alto).toSet()
            val lista = ArrayList<CandidatoMrz>()
            val vistas = HashSet<CajaMrz>()
            literales.add(v to lista)
            hechas[v.giro] = vistas
            for (c in v.loc.candidatos) {
                if (c.metodo == MetodoMrz.FRANJA && c.caja in ventanas) {
                    lista.add(c)
                } else if (vistas.add(c.caja)) {
                    yield(IntentoPlan(v.giro, c, v.imagen))
                }
            }
        }
        for ((v, lista) in literales) {
            val vistas = hechas.getValue(v.giro)
            for (c in lista) if (vistas.add(c.caja)) yield(IntentoPlan(v.giro, c, v.imagen))
        }
    }

    /**
     * OD-21: plan de la TD3 con las mismas cuatro vistas, ordenadas por la evidencia del par TD3 (orden estable). Pasada
     * 1: las cajas ajustadas a un par de líneas de 44; pasada 2: los candidatos de LMI-01 y LMI-11 que no se probaron.
     */
    fun intentosTd3(p: ImagenRgba): Sequence<IntentoPlan> = sequence {
        val todas = vistas(p).map { (g, img) -> Vista(g, img, evidenciaTd3(img)) }
            .sortedWith { a, b -> porEvidencia(a.loc.evidencia, b.loc.evidencia) }
        val hechas = HashMap<Int, MutableSet<CajaMrz>>()
        for (v in todas) {
            val vistas = HashSet<CajaMrz>()
            hechas[v.giro] = vistas
            for (c in v.loc.candidatos) if (vistas.add(c.caja)) yield(IntentoPlan(v.giro, c, v.imagen))
        }
        for (v in todas) {
            val vistas = hechas.getValue(v.giro)
            for (c in localizarConEvidencia(v.imagen).candidatos) if (vistas.add(c.caja)) yield(IntentoPlan(v.giro, c, v.imagen))
        }
    }

    fun intentos(p: ImagenRgba, formato: FormatoMrz): Sequence<IntentoPlan> = if (formato == FormatoMrz.TD3) intentosTd3(p) else intentosTd1(p)
}
