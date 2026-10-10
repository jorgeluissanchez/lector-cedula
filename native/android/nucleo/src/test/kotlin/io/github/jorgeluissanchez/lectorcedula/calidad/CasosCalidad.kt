package io.github.jorgeluissanchez.lectorcedula.calidad

import io.github.jorgeluissanchez.lectorcedula.mrz.LocalizarMrz
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

/**
 * Casos del diferencial de calidad (NAT-03, NAT-04; tarea 1.3). Cada familia da, para una semilla, la salida del puerto
 * Kotlin y la del oráculo TS ([Oraculo], `packages/capture` en QuickJS) en la misma forma canónica (texto): igualdad de
 * textos es igualdad exacta de score, motivo, métricas, tarjeta, contenido y geometría. Lo usan el diferencial en vivo
 * ([CalidadDiferencialNat03Test]) y el golden ([CalidadGoldenNat03Test], que no necesita QuickJS y corre bajo PIT).
 */
object CasosCalidad {
    private val u = Umbrales.POR_DEFECTO

    class Familia(val nombre: String, val casosGolden: Int, val kotlin: (Long) -> String, val ts: (Oraculo, Long) -> String)

    /** Semillas fijas del golden (índice 0..n-1). */
    fun semilla(i: Int): Long = (i + 1).toLong() * -7046029254386353131L

    private fun num(e: JsonElement?): Double? = (e as? JsonPrimitive)?.doubleOrNull

    private fun texto(e: JsonElement?): String? = (e as? JsonPrimitive)?.takeIf { it != JsonNull }?.content

    // --- Escenas completas: CAL-07, presencia y evaluación guiada (como el Worker web) ---

    /** Escena y fuente: una de cada cuatro con guía propia del integrador (SDK-61), otra con fuente modelo (CAL-06). */
    fun escena(semilla: Long): Pair<FrameAnalisis, Boolean> {
        val base = Escenas.generar(semilla)
        val r = Random(semilla xor 0x5DEECE66DL)
        val f = if (r.nextInt(4) == 0) {
            val g = Guia.calcularGuia(base.anchoOriginal, base.altoOriginal, r.nextBoolean(), r.nextDouble() * 0.15)
            FrameAnalisis(base.ancho, base.alto, base.pixeles, base.anchoOriginal, base.altoOriginal, g)
        } else {
            base
        }
        return f to (r.nextInt(4) == 0)
    }

    fun kotlinFrame(f: FrameAnalisis, modelo: Boolean = false): Map<String, Any?> {
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

    fun tsFrame(o: Oraculo, f: FrameAnalisis, modelo: Boolean = false): Map<String, Any?> {
        val guia = f.guia?.let { "{x:${it.x},y:${it.y},ancho:${it.ancho},alto:${it.alto}}" } ?: "null"
        val fuente = if (modelo) "'modelo'" else "'guia'"
        val j = o.json("OraculoCalidad.analizar('${Oraculo.b64(f.pixeles)}', ${f.ancho}, ${f.alto}, ${f.anchoOriginal}, ${f.altoOriginal}, $guia, $fuente)").jsonObject
        val p = j["presencia"]!!.jsonObject
        val t = p["tarjeta"] as? JsonObject
        val salida = mutableMapOf<String, Any?>(
            "tarjeta" to t?.let { listOf("x", "y", "ancho", "alto").map { k -> it[k]!!.jsonPrimitive.int } },
            "contenido" to texto(p["contenido"]),
            "presente" to p["presente"]!!.jsonPrimitive.booleanOrNull,
        )
        val c = j["cal07"]!!.jsonObject
        if (c["ok"]!!.jsonPrimitive.booleanOrNull != true) {
            salida["error"] = c["codigo"]!!.jsonPrimitive.content
        } else {
            val r = c["resultado"]!!.jsonObject
            salida["score"] = r["score"]!!.jsonPrimitive.int
            salida["motivo"] = texto(r["motivo"])
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
            salida["guiado"] = listOf(g["score"]!!.jsonPrimitive.int, texto(g["motivo"]))
        }
        return salida
    }

    // --- Localización MRZ (evidencia TD1 y TD3, cuatro orientaciones) en tarjetas generadas ---

    fun kotlinMrz(semilla: Long): String {
        val (p, w, h) = Escenas.tarjetaMrz(semilla)
        val l = LocalizarMrz.luminancias(p, w * h)
        val td1 = LocalizarMrz.evidenciaTd1(l, w, h)
        val td3 = LocalizarMrz.evidenciaTd3(l, w, h)
        return listOf(td1.evidencia, td1.ventanas.toDouble(), td3.evidencia, td3.ventanas.toDouble(), Presencia.hayMrz(l, w, h), Presencia.hayMrzTd3(l, w, h)).toString()
    }

    fun tsMrz(o: Oraculo, semilla: Long): String {
        val (p, w, h) = Escenas.tarjetaMrz(semilla)
        val j = o.json("OraculoCalidad.mrz('${Oraculo.b64(p)}', $w, $h)").jsonObject
        val td1 = j["td1"]!!.jsonObject
        val td3 = j["td3"]!!.jsonObject
        return listOf(num(td1["evidencia"]), num(td1["ventanas"]), num(td3["evidencia"]), num(td3["ventanas"]), j["hayMrz"]!!.jsonPrimitive.booleanOrNull, j["hayMrzTd3"]!!.jsonPrimitive.booleanOrNull).toString()
    }

    // --- Tarjeta ID-1 y PDF417 (estricto y suave) sobre luminancias generadas ---

    fun kotlinTarjeta(semilla: Long): String {
        val (l, w, h) = Escenas.luminanciaTarjeta(semilla)
        val t = Presencia.buscarTarjeta(l, w, h)
        val r = t ?: Presencia.Rect(0, 0, w, h)
        return listOf(t, Presencia.hayPdf417(l, w, r), Presencia.hayPdf417Suave(l, w, r)).toString()
    }

    fun tsTarjeta(o: Oraculo, semilla: Long): String {
        val (l, w, h) = Escenas.luminanciaTarjeta(semilla)
        val j = o.json("OraculoCalidad.tarjeta('${Oraculo.b64(ByteArray(l.size) { l[it].toByte() })}', $w, $h)").jsonObject
        val t = (j["tarjeta"] as? JsonObject)?.let { q -> Presencia.Rect(q["x"]!!.jsonPrimitive.int, q["y"]!!.jsonPrimitive.int, q["ancho"]!!.jsonPrimitive.int, q["alto"]!!.jsonPrimitive.int) }
        return listOf(t, j["pdf417"]!!.jsonPrimitive.booleanOrNull, j["pdf417Suave"]!!.jsonPrimitive.booleanOrNull).toString()
    }

    // --- Región M (CAL-02) con cuadriláteros arbitrarios, rampa, guía de CAM-08 y dimensiones de CAL-01 ---

    private class Geometria(semilla: Long) {
        val r = Random(semilla)
        val w = 1 + r.nextInt(80)
        val h = 1 + r.nextInt(80)
        val cuad: Cuadrilatero = List(4) { Punto(r.nextDouble() * (w + 20) - 10, r.nextDouble() * (h + 20) - 10) }.let { c ->
            when (r.nextInt(4)) {
                0 -> c
                1 -> listOf(Punto(c[0].x, c[0].y), Punto(c[0].x + 30, c[0].y), Punto(c[0].x + 30, c[0].y + 20), Punto(c[0].x, c[0].y + 20))
                2 -> listOf(c[0], c[0], c[1], c[2]) // degenerado
                else -> c.reversed()
            }
        }
        val x = r.nextDouble() * 300 - 50
        val a = r.nextDouble() * 100
        val b = a + r.nextDouble() * 200 + 0.001
        val gw = 2 + r.nextInt(3000)
        val gh = 2 + r.nextInt(3000)
        val orientacion = listOf(null, true, false)[r.nextInt(3)]
        val margen = if (r.nextBoolean()) null else r.nextDouble() * 0.2
    }

    fun kotlinGeometria(semilla: Long): String {
        val s = Geometria(semilla)
        val region = Calidad.calcularRegion(s.cuad, s.w, s.h)?.let { (m, n) -> n to m.withIndex().filter { it.value.toInt() == 1 }.sumOf { it.index.toLong() } }
        val g = Guia.calcularGuia(s.gw, s.gh, s.orientacion, s.margen)
        val (dw, dh) = Guia.dimensionesAnalisis(s.gw, s.gh)
        val ga = Guia.guiaEnAnalisis(dw, dh, s.gw, s.gh).flatMap { listOf(it.x, it.y) }
        return listOf(region, Calidad.rampa(s.x, s.a, s.b).toDouble(), listOf(g.x, g.y, g.ancho, g.alto), listOf(dw, dh), ga).toString()
    }

    fun tsGeometria(o: Oraculo, semilla: Long): String {
        val s = Geometria(semilla)
        val lista = s.cuad.joinToString(",") { "[${it.x},${it.y}]" }
        val region = (o.json("OraculoCalidad.region([$lista], ${s.w}, ${s.h})") as? JsonObject)?.let { it["tamano"]!!.jsonPrimitive.int to it["huella"]!!.jsonPrimitive.content.toDouble().toLong() }
        val rampa = o.numero("OraculoCalidad.rampa(${s.x}, ${s.a}, ${s.b})")
        val orient = when (s.orientacion) { null -> "null"; true -> "'horizontal'"; false -> "'vertical'" }
        val g = o.json("OraculoCalidad.guia(${s.gw}, ${s.gh}, $orient, ${s.margen ?: "null"})").jsonObject
        val d = o.json("OraculoCalidad.dimensiones(${s.gw}, ${s.gh})").jsonObject
        val (dw, dh) = d["ancho"]!!.jsonPrimitive.int to d["alto"]!!.jsonPrimitive.int
        val ga = o.json("OraculoCalidad.guiaEnAnalisis($dw, $dh, ${s.gw}, ${s.gh})").toString().trim('[', ']').replace("[", "").replace("]", "").split(",").map { it.toDouble() }
        return listOf(region, rampa, listOf("x", "y", "ancho", "alto").map { num(g[it]) }, listOf(dw, dh), ga).toString()
    }

    val FAMILIAS = listOf(
        Familia("escenas", 400, { s -> escena(s).let { (f, m) -> kotlinFrame(f, m).toString() } }, { o, s -> escena(s).let { (f, m) -> tsFrame(o, f, m).toString() } }),
        Familia("mrz", 150, ::kotlinMrz, ::tsMrz),
        Familia("tarjeta", 400, ::kotlinTarjeta, ::tsTarjeta),
        Familia("geometria", 400, ::kotlinGeometria, ::tsGeometria),
    )

    /** Golden comprometido (`lectorcedula/goldens-calidad.json`): familia -> salidas TS por índice de semilla, o `null`. */
    fun golden(): Map<String, List<String>>? {
        val texto = CasosCalidad::class.java.classLoader.getResourceAsStream("lectorcedula/goldens-calidad.json")?.use { it.readBytes().toString(Charsets.UTF_8) } ?: return null
        val j = kotlinx.serialization.json.Json.parseToJsonElement(texto).jsonObject
        return j.mapValues { (_, v) -> (v as kotlinx.serialization.json.JsonArray).map { it.jsonPrimitive.content } }
    }
}
