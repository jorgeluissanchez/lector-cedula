package io.github.jorgeluissanchez.lectorcedula.mrz

import com.dokar.quickjs.QuickJs
import io.github.jorgeluissanchez.lectorcedula.mrz.LocalizarMrz.CajaMrz
import io.kotest.core.spec.style.StringSpec
import io.kotest.matchers.shouldBe
import io.kotest.property.Arb
import io.kotest.property.arbitrary.long
import io.kotest.property.checkAll
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import java.io.Closeable
import java.util.Base64
import java.util.Random

/** Oráculo MRZ (`dist/oraculo-mrz.js`, `npm run nucleo:construir`): el plan de `packages/capture` en QuickJS. */
class OraculoMrz : Closeable {
    private val js = QuickJs.create(Dispatchers.Unconfined)

    init {
        val codigo = OraculoMrz::class.java.classLoader.getResourceAsStream("lectorcedula/oraculo-mrz.js")
            ?.use { it.readBytes().toString(Charsets.UTF_8) }
            ?: error("Falta el oráculo MRZ: npm run nucleo:construir")
        runBlocking { js.evaluate<Any?>(codigo, "oraculo-mrz.js", false) }
    }

    @Synchronized
    fun json(expresion: String): JsonElement = Json.parseToJsonElement(runBlocking { js.evaluate<String>(expresion) })

    override fun close() = js.close()

    companion object {
        fun b64(p: ImagenRgba): String = Base64.getEncoder().encodeToString(p.datos)
    }
}

/** Huella FNV-1a de 32 bits (la del oráculo y de `nat-06-diferencial-mrz.test.ts`). */
fun huella(d: ByteArray): Long {
    var h = 0x811c9dc5L
    for (b in d) {
        h = h xor (b.toLong() and 0xFF)
        h = (h * 0x01000193L) and 0xFFFFFFFFL
    }
    return h
}

/** Plan de Kotlin en el formato del oráculo (`OraculoMrz.plan`). */
fun planJson(p: ImagenRgba, formato: FormatoMrz, vistas: Int, limite: Int = Int.MAX_VALUE): JsonArray = buildJsonArray {
    PlanMrz.intentos(p, formato).take(limite).forEachIndexed { i, intento ->
        add(
            buildJsonObject {
                put("giro", intento.giro)
                put("metodo", intento.candidato.metodo.codigo)
                val c = intento.candidato.caja
                put("caja", buildJsonArray { add(JsonPrimitive(c.x)); add(JsonPrimitive(c.y)); add(JsonPrimitive(c.ancho)); add(JsonPrimitive(c.alto)) })
                if (i < vistas) {
                    val v = VistaOcr.paraOcr(intento)
                    put("vista", buildJsonArray { add(JsonPrimitive(v.ancho)); add(JsonPrimitive(v.alto)); add(JsonPrimitive(huella(v.datos))) })
                }
            },
        )
    }
}

/**
 * NAT-06 "Paridad de líneas", parte de vistas y en proceso (tarea 1.5): el plan de Kotlin ([PlanMrz]) y la imagen que
 * recibe el OCR ([VistaOcr]) frente a `packages/capture` en QuickJS ([OraculoMrz]) sobre tarjetas generadas en las
 * cuatro orientaciones (TD1 y TD3, texto inclinado, ruido): igualdad exacta de giro, método, caja y huella de cada
 * vista. fixture-sintetico: [EscenasMrz]. `-Dnat.iteraciones` reduce los casos bajo PIT.
 */
class DiferencialMrzNat06Test : StringSpec({
    val oraculo by lazy { OraculoMrz() }
    afterSpec { oraculo.close() }
    val casos = System.getProperty("nat.iteraciones")?.toIntOrNull()?.let { maxOf(3, it / 20) } ?: 8

    "NAT-06 Diferencial en proceso: plan completo y primeras vistas iguales a packages/capture en tarjetas generadas" {
        checkAll(casos, Arb.long()) { semilla ->
            val p = EscenasMrz.aleatoria(semilla)
            for (formato in FormatoMrz.entries) {
                val ts = oraculo.json("OraculoMrz.plan('${OraculoMrz.b64(p)}', ${p.ancho}, ${p.alto}, '${formato.codigo}', 3)")
                planJson(p, formato, 3) shouldBe ts
            }
        }
    }

    "NAT-06 Diferencial en proceso: tarjetas TD1 y TD3 derechas, de pie y al revés con sus primeras vistas" {
        for ((filas, por) in listOf(3 to 30, 2 to 44)) {
            val t = EscenasMrz.tarjeta(600, 378, filas, por, 12)
            for (giro in if (filas == 3) listOf(0, 90) else listOf(180)) {
                val p = if (giro == 0) t else PlanMrz.girar(t, giro)
                val formato = if (filas == 3) FormatoMrz.TD1 else FormatoMrz.TD3
                val ts = oraculo.json("OraculoMrz.plan('${OraculoMrz.b64(p)}', ${p.ancho}, ${p.alto}, '${formato.codigo}', 4)").jsonArray
                planJson(p, formato, 4) shouldBe ts
                // Estas tarjetas tienen evidencia de orientación (LMI-14): la vista que endereza la MRZ va primero.
                val orden = oraculo.json("OraculoMrz.orden('${OraculoMrz.b64(p)}', ${p.ancho}, ${p.alto})").jsonObject
                if (formato == FormatoMrz.TD1) orden["orden"]!!.jsonArray.first().toString().toInt() shouldBe (360 - giro) % 360
                PlanMrz.intentos(p, formato).first().giro shouldBe (360 - giro) % 360
            }
        }
    }

    "NAT-06 Diferencial en proceso: recorte ampliado y enderezado de texto inclinado iguales a la web" {
        val r = Random(11)
        repeat(maxOf(4, casos / 2)) {
            val grados = (r.nextInt(33) - 16) * 0.25 + if (r.nextBoolean()) 0.1 else 0.0
            val b = EscenasMrz.barras(grados, 200 + r.nextInt(300), 120 + r.nextInt(100))
            val e = oraculo.json("OraculoMrz.enderezado('${OraculoMrz.b64(b)}', ${b.ancho}, ${b.alto})").jsonObject
            val v = VistaOcr.enderezar(b)
            val k = buildJsonObject {
                put("angulo", VistaOcr.estimarInclinacion(b))
                put("vista", buildJsonArray { add(JsonPrimitive(v.ancho)); add(JsonPrimitive(v.alto)); add(JsonPrimitive(huella(v.datos))) })
            }
            normalizar(k) shouldBe normalizar(e)
            val c = CajaMrz(r.nextInt(b.ancho / 2), r.nextInt(b.alto / 2), 1 + r.nextInt(b.ancho / 2), 1 + r.nextInt(b.alto / 2))
            val rc = VistaOcr.recortarYAmpliar(b, c)
            oraculo.json("OraculoMrz.recorte('${OraculoMrz.b64(b)}', ${b.ancho}, ${b.alto}, ${c.x}, ${c.y}, ${c.ancho}, ${c.alto})") shouldBe
                buildJsonArray { add(JsonPrimitive(rc.ancho)); add(JsonPrimitive(rc.alto)); add(JsonPrimitive(huella(rc.datos))) }
        }
    }
})

/** Ángulos enteros de JS (`2`) frente a Kotlin (`2.0`): se comparan como números. */
private fun normalizar(e: JsonElement): JsonElement = when (e) {
    is JsonObject -> JsonObject(e.mapValues { normalizar(it.value) })
    is JsonArray -> JsonArray(e.map(::normalizar))
    is JsonPrimitive -> if (!e.isString && e.content.toDoubleOrNull() != null) JsonPrimitive(e.content.toDouble()) else e
    else -> e
}
