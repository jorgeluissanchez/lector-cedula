package io.github.jorgeluissanchez.lectorcedula.calidad

import io.github.jorgeluissanchez.lectorcedula.mrz.LocalizarMrz
import io.kotest.core.spec.style.StringSpec
import io.kotest.matchers.shouldBe
import io.kotest.property.Arb
import io.kotest.property.arbitrary.long
import io.kotest.property.checkAll
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.util.Random
import kotlin.math.PI
import kotlin.math.sqrt

/**
 * NAT-03 y NAT-04 "Paridad con la web", en proceso (tarea 1.3): el puerto Kotlin de calidad, presencia, guía y
 * localización MRZ frente a `packages/capture` evaluado en QuickJS ([Oraculo]) sobre escenas generadas (tarjeta ID-1,
 * barras tipo PDF417, filas tipo MRZ TD1/TD3, reflejo, desenfoque, ruido) y recortes de los vídeos sintéticos. Igualdad
 * exacta de score, motivo, métricas, tarjeta y contenido: la aritmética es la misma. fixture-sintetico: escenas
 * generadas con semilla y vídeos de e2e/videos/sinteticos; ningún dato real. `-Dnat.iteraciones` reduce los casos bajo PIT.
 */
class CalidadDiferencialNat03Test : StringSpec({
    val oraculo by lazy { Oraculo() }
    afterSpec { oraculo.close() }
    val casos = System.getProperty("nat.iteraciones")?.toIntOrNull()?.coerceAtMost(40) ?: 300
    val u = Umbrales.POR_DEFECTO

    fun num(e: JsonElement?): Double? = (e as? JsonPrimitive)?.doubleOrNull

    /** Lo que da Kotlin en el mismo formato que el oráculo (`analizar`). */
    fun kotlin(f: FrameAnalisis, modelo: Boolean = false): Map<String, Any?> {
        val guia = Guia.guiaEnAnalisis(f.ancho, f.alto, f.anchoOriginal, f.altoOriginal, f.guia)
        val fuente = if (modelo) DeteccionDocumento.Fuente.MODELO else DeteccionDocumento.Fuente.GUIA
        val r = Calidad.analizarFrame(f, DeteccionDocumento(guia, fuente), u)
        val p = Presencia.detectar(f, guia)
        val salida = mutableMapOf<String, Any?>(
            "tarjeta" to p.tarjeta?.let { listOf(it.x, it.y, it.ancho, it.alto) },
            "contenido" to p.contenido?.codigo,
            "presente" to p.presente,
        )
        when (r) {
            is ResultadoAnalisis.Error -> salida["error"] = r.codigo
            is ResultadoAnalisis.Ok -> {
                val c = r.resultado
                salida["score"] = c.score
                salida["motivo"] = c.motivo?.codigo
                c.metricas?.let { m ->
                    salida["metricas"] = listOf(
                        m.nitidez.varianza, m.nitidez.subscore.toDouble(), m.reflejo.fraccionSaturada, m.reflejo.componenteMayor,
                        m.reflejo.subscore.toDouble(), m.exposicion.media, m.exposicion.fraccionOscura,
                        m.exposicion.subscoreOscuro.toDouble(), m.exposicion.subscoreSobreexpuesto.toDouble(),
                        m.tamano?.ratio, m.tamano?.subscore?.toDouble(),
                    )
                }
                val g = Presencia.evaluarConPresencia(c, { p.presente }, u.umbralListo, u.laplacianoMinimoGuiado)
                salida["guiado"] = listOf(g.score, g.motivo?.codigo)
            }
        }
        return salida
    }

    fun ts(f: FrameAnalisis, modelo: Boolean = false): Map<String, Any?> {
        val guia = f.guia?.let { "{x:${it.x},y:${it.y},ancho:${it.ancho},alto:${it.alto}}" } ?: "null"
        val fuente = if (modelo) "'modelo'" else "'guia'"
        val j = oraculo.json("OraculoCalidad.analizar('${Oraculo.b64(f.pixeles)}', ${f.ancho}, ${f.alto}, ${f.anchoOriginal}, ${f.altoOriginal}, $guia, $fuente)").jsonObject
        val p = j["presencia"]!!.jsonObject
        val t = p["tarjeta"] as? JsonObject
        val salida = mutableMapOf<String, Any?>(
            "tarjeta" to t?.let { listOf("x", "y", "ancho", "alto").map { k -> it[k]!!.jsonPrimitive.int } },
            "contenido" to (p["contenido"] as? JsonPrimitive)?.takeIf { it != JsonNull }?.content,
            "presente" to p["presente"]!!.jsonPrimitive.booleanOrNull,
        )
        val c = j["cal07"]!!.jsonObject
        if (c["ok"]!!.jsonPrimitive.booleanOrNull != true) {
            salida["error"] = c["codigo"]!!.jsonPrimitive.content
        } else {
            val r = c["resultado"]!!.jsonObject
            salida["score"] = r["score"]!!.jsonPrimitive.int
            salida["motivo"] = (r["motivo"] as? JsonPrimitive)?.takeIf { it != JsonNull }?.content
            (r["metricas"] as? JsonObject)?.let { m ->
                val n = m["nitidez"]!!.jsonObject
                val re = m["reflejo"]!!.jsonObject
                val e = m["exposicion"]!!.jsonObject
                salida["metricas"] = listOf(
                    num(n["varianza"]), num(n["subscore"]), num(re["fraccionSaturada"]), num(re["componenteMayor"]), num(re["subscore"]),
                    num(e["media"]), num(e["fraccionOscura"]), num(e["subscoreOscuro"]), num(e["subscoreSobreexpuesto"]),
                    (m["tamano"] as? JsonObject)?.let { num(it["ratio"]) }, (m["tamano"] as? JsonObject)?.let { num(it["subscore"]) },
                )
            }
            val g = j["guiado"]!!.jsonObject
            salida["guiado"] = listOf(g["score"]!!.jsonPrimitive.int, (g["motivo"] as? JsonPrimitive)?.takeIf { it != JsonNull }?.content)
        }
        return salida
    }

    "NAT-03 Diferencial en proceso: CAL-07, presencia y evaluación guiada iguales a packages/capture en escenas generadas" {
        var conTarjeta = 0
        var conContenido = 0
        checkAll(casos, Arb.long()) { semilla ->
            val base = Escenas.generar(semilla)
            // Una de cada cuatro con guía propia del integrador (SDK-61) y otra con fuente modelo (tamaño de CAL-06).
            val r = Random(semilla xor 0x5DEECE66DL)
            val f = if (r.nextInt(4) == 0) {
                val g = Guia.calcularGuia(base.anchoOriginal, base.altoOriginal, r.nextBoolean(), r.nextDouble() * 0.15)
                FrameAnalisis(base.ancho, base.alto, base.pixeles, base.anchoOriginal, base.altoOriginal, g)
            } else {
                base
            }
            val modelo = r.nextInt(4) == 0
            val k = kotlin(f, modelo)
            k shouldBe ts(f, modelo)
            if (k["tarjeta"] != null) conTarjeta++
            if (k["contenido"] != null) conContenido++
        }
        // Las escenas deben ejercitar la presencia, no solo el score.
        (conTarjeta > 0 && conContenido > 0) shouldBe true
    }

    "NAT-04 Diferencial en proceso: recortes y giros de los vídeos sintéticos dan la misma presencia y calidad".config(enabled = Fixtures.disponibles()) {
        val nombres = listOf("amarilla-1080p", "digital-1080p", "pasaporte-col-1080p", "amarilla-de-pie-vertical", "reflejo-1080p", "sin-documento-1080p")
        val reducidos = nombres.map { n -> Fixtures.frame(n).let { Guia.reducir(it.pixeles, it.ancho, it.alto) } }
        for ((p, w, h) in reducidos) kotlin(FrameAnalisis(w, h, p, w, h)) shouldBe ts(FrameAnalisis(w, h, p, w, h))
        val r = Random(7)
        repeat(minOf(casos / 10, 12)) {
            val (p, w, h) = reducidos[r.nextInt(reducidos.size)]
            val f = Escenas.recorte(p, w, h, r)
            kotlin(f) shouldBe ts(f)
        }
    }

    "NAT-04 Diferencial en proceso: localización MRZ (evidencia TD1 y TD3, cuatro orientaciones) en tarjetas generadas" {
        // La localización MRZ en QuickJS es lenta (cuatro orientaciones por tarjeta): una quinta parte de los casos.
        checkAll(maxOf(8, casos / 5), Arb.long()) { semilla ->
            val (p, w, h) = Escenas.tarjetaMrz(semilla)
            val j = oraculo.json("OraculoCalidad.mrz('${Oraculo.b64(p)}', $w, $h)").jsonObject
            val l = LocalizarMrz.luminancias(p, w * h)
            val td1 = LocalizarMrz.evidenciaTd1(l, w, h)
            val td3 = LocalizarMrz.evidenciaTd3(l, w, h)
            listOf(td1.evidencia, td1.ventanas.toDouble(), td3.evidencia, td3.ventanas.toDouble()) shouldBe listOf(
                num(j["td1"]!!.jsonObject["evidencia"]), num(j["td1"]!!.jsonObject["ventanas"]),
                num(j["td3"]!!.jsonObject["evidencia"]), num(j["td3"]!!.jsonObject["ventanas"]),
            )
            listOf(Presencia.hayMrz(l, w, h), Presencia.hayMrzTd3(l, w, h)) shouldBe listOf(j["hayMrz"]!!.jsonPrimitive.booleanOrNull, j["hayMrzTd3"]!!.jsonPrimitive.booleanOrNull)
        }
    }

    "NAT-04 Diferencial en proceso: tarjeta ID-1 y PDF417 (estricto y suave) sobre luminancias generadas" {
        checkAll(casos, Arb.long()) { semilla ->
            val (l, w, h) = Escenas.luminanciaTarjeta(semilla)
            val j = oraculo.json("OraculoCalidad.tarjeta('${Oraculo.b64(ByteArray(l.size) { l[it].toByte() })}', $w, $h)").jsonObject
            val t = Presencia.buscarTarjeta(l, w, h)
            val r = t ?: Presencia.Rect(0, 0, w, h)
            val tTs = (j["tarjeta"] as? JsonObject)?.let { o -> Presencia.Rect(o["x"]!!.jsonPrimitive.int, o["y"]!!.jsonPrimitive.int, o["ancho"]!!.jsonPrimitive.int, o["alto"]!!.jsonPrimitive.int) }
            t shouldBe tTs
            Presencia.hayPdf417(l, w, r) shouldBe j["pdf417"]!!.jsonPrimitive.booleanOrNull
            Presencia.hayPdf417Suave(l, w, r) shouldBe j["pdf417Suave"]!!.jsonPrimitive.booleanOrNull
        }
    }

    "NAT-03 Diferencial en proceso: región M (CAL-02) con cuadriláteros arbitrarios, rampa, guía y dimensiones" {
        checkAll(casos, Arb.long()) { semilla ->
            val r = Random(semilla)
            val w = 1 + r.nextInt(80)
            val h = 1 + r.nextInt(80)
            val cuad = List(4) { Punto(r.nextDouble() * (w + 20) - 10, r.nextDouble() * (h + 20) - 10) }.let { c ->
                when (r.nextInt(4)) {
                    0 -> c
                    1 -> listOf(Punto(c[0].x, c[0].y), Punto(c[0].x + 30, c[0].y), Punto(c[0].x + 30, c[0].y + 20), Punto(c[0].x, c[0].y + 20))
                    2 -> listOf(c[0], c[0], c[1], c[2]) // degenerado
                    else -> c.reversed()
                }
            }
            val k = Calidad.calcularRegion(cuad, w, h)?.let { (m, n) -> n to m.withIndex().filter { it.value.toInt() == 1 }.sumOf { it.index.toLong() } }
            val lista = cuad.joinToString(",") { "[${it.x},${it.y}]" }
            val j = oraculo.json("OraculoCalidad.region([$lista], $w, $h)")
            val t = (j as? JsonObject)?.let { it["tamano"]!!.jsonPrimitive.int to it["huella"]!!.jsonPrimitive.content.toDouble().toLong() }
            k shouldBe t
            if (k != null) Calidad.areaConSigno(cuad).let { a -> (a != 0.0) shouldBe true }

            val x = r.nextDouble() * 300 - 50
            val a = r.nextDouble() * 100
            val b = a + r.nextDouble() * 200 + 0.001
            Calidad.rampa(x, a, b).toDouble() shouldBe oraculo.numero("OraculoCalidad.rampa($x, $a, $b)")

            val gw = 2 + r.nextInt(3000)
            val gh = 2 + r.nextInt(3000)
            val orientacion = listOf(null, true, false)[r.nextInt(3)]
            val margen = if (r.nextBoolean()) null else r.nextDouble() * 0.2
            val g = Guia.calcularGuia(gw, gh, orientacion, margen)
            val o = when (orientacion) { null -> "null"; true -> "'horizontal'"; false -> "'vertical'" }
            val gTs = oraculo.json("OraculoCalidad.guia($gw, $gh, $o, ${margen ?: "null"})").jsonObject
            listOf(g.x, g.y, g.ancho, g.alto) shouldBe listOf("x", "y", "ancho", "alto").map { num(gTs[it]) }
            val (dw, dh) = Guia.dimensionesAnalisis(gw, gh)
            val d = oraculo.json("OraculoCalidad.dimensiones($gw, $gh)").jsonObject
            listOf(dw, dh) shouldBe listOf(d["ancho"]!!.jsonPrimitive.int, d["alto"]!!.jsonPrimitive.int)
            val ga = Guia.guiaEnAnalisis(dw, dh, gw, gh).flatMap { listOf(it.x, it.y) }
            val gaTs = oraculo.json("OraculoCalidad.guiaEnAnalisis($dw, $dh, $gw, $gh)").toString().trim('[', ']').replace("[", "").replace("]", "").split(",").map { it.toDouble() }
            ga shouldBe gaTs
        }
    }
})

/** Escenas sintéticas deterministas por semilla (fixture-sintetico: ninguna imagen real). */
object Escenas {
    private fun clamp(v: Int) = if (v < 0) 0 else if (v > 255) 255 else v

    private class Lienzo(val w: Int, val h: Int) {
        val p = ByteArray(w * h * 4)
        fun pon(x: Int, y: Int, v: Int) {
            if (x !in 0 until w || y !in 0 until h) return
            val o = (y * w + x) * 4
            p[o] = clamp(v).toByte()
            p[o + 1] = clamp(v).toByte()
            p[o + 2] = clamp(v + 10).toByte()
            p[o + 3] = 255.toByte()
        }
        fun rect(x0: Int, y0: Int, an: Int, al: Int, v: Int) {
            for (y in y0 until y0 + al) for (x in x0 until x0 + an) pon(x, y, v)
        }
        fun luma(x: Int, y: Int) = p[(y * w + x) * 4].toInt() and 0xFF
    }

    /** Barras verticales (u horizontales si `traspuestas`) de anchos 1..3 en el bloque. */
    private fun barras(c: Lienzo, r: Random, x0: Int, y0: Int, an: Int, al: Int, oscuro: Int, traspuestas: Boolean) {
        var t = 0
        val largo = if (traspuestas) al else an
        while (t < largo) {
            val grosor = 1 + r.nextInt(3)
            if (r.nextBoolean()) for (k in t until minOf(largo, t + grosor)) {
                if (traspuestas) c.rect(x0, y0 + k, an, 1, oscuro) else c.rect(x0 + k, y0, 1, al, oscuro)
            }
            t += grosor
        }
    }

    /** `filas` líneas de "caracteres" (bloques oscuros) de alto `hc` con separación ~1,7·hc, desde `yBase`. */
    private fun filasTexto(c: Lienzo, r: Random, x0: Int, ancho: Int, yBase: Int, filas: Int, hc: Int, oscuro: Int, caracteres: Int) {
        val paso = maxOf(2, ancho / caracteres)
        for (f in 0 until filas) {
            val y = yBase + f * (hc * 17 / 10 + 1)
            var x = x0
            while (x + paso <= x0 + ancho) {
                if (r.nextInt(5) != 0) c.rect(x, y, maxOf(1, paso - 1), hc - r.nextInt(2), oscuro)
                x += paso
            }
        }
    }

    private fun desenfocar(c: Lienzo, pasadas: Int) {
        repeat(pasadas) {
            val q = c.p.copyOf()
            for (y in 1 until c.h - 1) for (x in 1 until c.w - 1) for (k in 0 until 3) {
                var s = 0
                for (dy in -1..1) for (dx in -1..1) s += q[((y + dy) * c.w + x + dx) * 4 + k].toInt() and 0xFF
                c.p[(y * c.w + x) * 4 + k] = ((s + 4) / 9).toByte()
            }
        }
    }

    fun generar(semilla: Long): FrameAnalisis {
        val r = Random(semilla)
        var w = 40 + r.nextInt(200)
        var h = maxOf(16, (w * (0.45 + r.nextDouble() * 0.35)).toInt())
        val vertical = r.nextInt(4) == 0
        if (vertical) w = h.also { h = w }
        val escala = if (r.nextBoolean()) 1 else 2 + r.nextInt(3)
        val c = Lienzo(w, h)
        val fondo = r.nextInt(256)
        val ruido = r.nextInt(30)
        for (y in 0 until h) for (x in 0 until w) c.pon(x, y, fondo + if (ruido > 0) r.nextInt(2 * ruido + 1) - ruido else 0)
        val g = Guia.calcularGuia(w, h)
        if (r.nextInt(5) != 0) {
            val f = 0.75 + r.nextDouble() * 0.3
            val an = (g.ancho * f).toInt()
            val al = (g.alto * f).toInt()
            val x0 = (w - an) / 2 + r.nextInt(5) - 2
            val y0 = (h - al) / 2 + r.nextInt(5) - 2
            val claro = 120 + r.nextInt(136)
            c.rect(x0, y0, an, al, claro)
            val oscuro = r.nextInt(90)
            when (r.nextInt(5)) {
                1 -> if (vertical) barras(c, r, x0 + an / 8, y0 + al / 10, an * 3 / 4, al / 2, oscuro, true) else barras(c, r, x0 + an / 10, y0 + al / 3, an * 4 / 5, al / 2, oscuro, false)
                2 -> filasTexto(c, r, x0 + an / 20, an * 9 / 10, y0 + al * 2 / 3, 3, maxOf(2, al / 18), oscuro, 30)
                3 -> filasTexto(c, r, x0 + an / 20, an * 9 / 10, y0 + al * 3 / 4, 2, maxOf(2, al / 16), oscuro, 44)
                4 -> filasTexto(c, r, x0 + an / 20, an * 9 / 10, y0 + al / 5, 2 + r.nextInt(5), maxOf(2, al / 14), oscuro, 10 + r.nextInt(30))
                else -> Unit
            }
        }
        if (r.nextInt(6) == 0) {
            val radio = sqrt((0.02 + r.nextDouble() * 0.3) * g.ancho * g.alto / PI)
            for (y in 0 until h) for (x in 0 until w) {
                val dx = x - w / 2.0
                val dy = y - h / 2.0
                if (dx * dx + dy * dy <= radio * radio) c.pon(x, y, 255)
            }
        }
        desenfocar(c, r.nextInt(3))
        return FrameAnalisis(w, h, c.p, w * escala, h * escala)
    }

    /** Recorte (y giro de 0/90/180/270) de un frame reducido de un vídeo sintético. */
    fun recorte(p: ByteArray, w: Int, h: Int, r: Random): FrameAnalisis {
        val an = maxOf(32, (w * (0.5 + r.nextDouble() * 0.5)).toInt())
        val al = maxOf(24, (h * (0.5 + r.nextDouble() * 0.5)).toInt())
        val x0 = r.nextInt(w - an + 1)
        val y0 = r.nextInt(h - al + 1)
        val giro = r.nextInt(4)
        val (dw, dh) = if (giro % 2 == 0) an to al else al to an
        val d = ByteArray(dw * dh * 4)
        for (y in 0 until dh) for (x in 0 until dw) {
            val (sx, sy) = when (giro) {
                0 -> x to y
                1 -> y to (al - 1 - x)
                2 -> (an - 1 - x) to (al - 1 - y)
                else -> (an - 1 - y) to x
            }
            System.arraycopy(p, ((y0 + sy) * w + x0 + sx) * 4, d, (y * dw + x) * 4, 4)
        }
        return FrameAnalisis(dw, dh, d, dw, dh)
    }

    /** Tarjeta sola (RGBA) con filas tipo MRZ TD1 o TD3 en una posición y orientación aleatorias. */
    fun tarjetaMrz(semilla: Long): Triple<ByteArray, Int, Int> {
        val r = Random(semilla)
        val w = 90 + r.nextInt(130)
        val h = (w / Guia.PROPORCION_ID1).toInt()
        val c = Lienzo(w, h)
        val claro = 150 + r.nextInt(100)
        for (y in 0 until h) for (x in 0 until w) c.pon(x, y, claro - r.nextInt(8))
        val filas = if (r.nextBoolean()) 3 else 2
        val hc = maxOf(2, h / (14 + r.nextInt(8)))
        val yBase = if (r.nextInt(4) == 0) h / 8 else h - filas * (hc * 17 / 10 + 1) - h / 12
        filasTexto(c, r, w / 20, w * 9 / 10, yBase, filas, hc, r.nextInt(80), if (filas == 3) 30 else 44)
        if (r.nextInt(3) == 0) filasTexto(c, r, w / 3, w / 2, h / 6, 3, maxOf(2, hc - 1), r.nextInt(80), 12)
        desenfocar(c, r.nextInt(2))
        if (r.nextBoolean()) return Triple(c.p, w, h)
        // Vertical: traspuesta (la tarjeta de pie).
        val t = ByteArray(c.p.size)
        for (y in 0 until h) for (x in 0 until w) System.arraycopy(c.p, (y * w + x) * 4, t, (x * h + y) * 4, 4)
        return Triple(t, h, w)
    }

    /** Luminancias con un rectángulo de proporción variable (a veces ID-1) y barras o texto dentro. */
    fun luminanciaTarjeta(semilla: Long): Triple<IntArray, Int, Int> {
        val r = Random(semilla)
        val w = 24 + r.nextInt(180)
        val h = 24 + r.nextInt(140)
        val c = Lienzo(w, h)
        val fondo = r.nextInt(256)
        for (y in 0 until h) for (x in 0 until w) c.pon(x, y, fondo + r.nextInt(9) - 4)
        val proporcion = if (r.nextBoolean()) Guia.PROPORCION_ID1 else 0.6 + r.nextDouble() * 1.4
        val vertical = r.nextInt(3) == 0
        var an = (w * (0.4 + r.nextDouble() * 0.55)).toInt()
        var al = (an / proporcion).toInt()
        if (vertical) an = al.also { al = an }
        an = an.coerceIn(4, w - 2)
        al = al.coerceIn(4, h - 2)
        val x0 = r.nextInt(w - an)
        val y0 = r.nextInt(h - al)
        c.rect(x0, y0, an, al, if (fondo < 128) 200 + r.nextInt(56) else r.nextInt(60))
        val tinta = if (fondo < 128) r.nextInt(60) else 200 + r.nextInt(56)
        when (r.nextInt(3)) {
            0 -> barras(c, r, x0 + an / 10, y0 + al / 4, an * 4 / 5, al / 2, tinta, vertical)
            1 -> filasTexto(c, r, x0 + 2, an - 4, y0 + al / 3, 3, maxOf(2, al / 12), tinta, 20)
            else -> Unit
        }
        desenfocar(c, r.nextInt(2))
        return Triple(IntArray(w * h) { c.luma(it % w, it / w) }, w, h)
    }
}
