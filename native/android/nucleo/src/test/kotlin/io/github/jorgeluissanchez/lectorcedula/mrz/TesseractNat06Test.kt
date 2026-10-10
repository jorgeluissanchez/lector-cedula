package io.github.jorgeluissanchez.lectorcedula.mrz

import io.github.jorgeluissanchez.lectorcedula.motor.MotorJs
import io.kotest.assertions.withClue
import io.kotest.core.spec.style.StringSpec
import io.kotest.matchers.shouldBe
import io.kotest.matchers.shouldNotBe
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.io.File

/**
 * NAT-06 con Tesseract nativo REAL (sdk-nativo, tarea 1.5): `liblectorcedula_ocr` compilada para el host Linux en la
 * imagen docker/android-sdk (`:nucleo:compilarOcrHost`, la ruta llega en `-Dlectorcedula.ocr`) con el mismo
 * `mrz.traineddata` que la web, sobre las escenas de `tools/nativo/fixtures-mrz.mjs`. Escenarios "Digital TD1",
 * "Pasaporte TD3" y "Giro de 180°" (y de pie, 90 y 270), y volcado `build/volcados/mrz.json` para la paridad de líneas y
 * vistas con packages/capture (`CT`: `packages/nucleo-js/test/nat-06-diferencial-mrz.test.ts`). Sin biblioteca, modelo o
 * escenas se omite; con `-Dnat.ocrObligatorio=true` (CI) falla. fixture-sintetico: PERSONA_BASE y el pasaporte de OD-01.
 */
class TesseractNat06Test : StringSpec({
    val biblioteca = System.getProperty("lectorcedula.ocr")?.let(::File)?.takeIf { it.isFile }
    val dir = File(System.getProperty("lectorcedula.fixturesMrz") ?: "../build/fixtures-mrz")
    val obligatorio = System.getProperty("nat.ocrObligatorio") == "true"
    val modelo = ModeloMrz.cargar()
    val disponible = biblioteca != null && modelo != null && File(dir, "casos.json").isFile
    val motor by lazy { MotorJs.desdeRecurso() }
    val casos by lazy { Json.parseToJsonElement(File(dir, "casos.json").readText()).jsonObject }
    val fecha by lazy { casos["fechaReferencia"]!!.jsonPrimitive.content }

    /** Lectura de cada escena: plan seguido, líneas y salida de `procesarMrz`. */
    class Lectura(val nombre: String, val resultado: ResultadoMrz, val vistas: JsonArray, val salida: JsonObject?)

    val lecturas: Map<String, Lectura> by lazy {
        System.load(biblioteca!!.absolutePath)
        val tesseract = TesseractNativo.crear(modelo!!) ?: error("Tesseract no arrancó con el modelo")
        tesseract.use { t ->
            casos["casos"]!!.jsonArray.associate { c ->
                val o = c.jsonObject
                val nombre = o["nombre"]!!.jsonPrimitive.content
                val img = ImagenRgba(File(dir, o["archivo"]!!.jsonPrimitive.content).readBytes(), o["ancho"]!!.jsonPrimitive.int, o["alto"]!!.jsonPrimitive.int)
                val formato = if (o["formato"]!!.jsonPrimitive.content == "td3") FormatoMrz.TD3 else FormatoMrz.TD1
                val vistas = ArrayList<JsonElement>()
                val lector = LectorMrz(t, EvaluadorBundle(motor) { fecha })
                lector.observador = { i, v ->
                    val k = i.candidato.caja
                    vistas.add(
                        buildJsonObject {
                            put("giro", i.giro)
                            put("metodo", i.candidato.metodo.codigo)
                            put("caja", buildJsonArray { add(JsonPrimitive(k.x)); add(JsonPrimitive(k.y)); add(JsonPrimitive(k.ancho)); add(JsonPrimitive(k.alto)) })
                            put("vista", buildJsonArray { add(JsonPrimitive(v.ancho)); add(JsonPrimitive(v.alto)); add(JsonPrimitive(huella(v.datos))) })
                        },
                    )
                }
                val r = lector.leer(img, formato)
                val salida = r.lineas?.let { l -> motor.llamar("procesarMrz", JsonArray(l.map(::JsonPrimitive)), buildJsonObject { put("fechaReferencia", fecha) }) as JsonObject }
                nombre to Lectura(nombre, r, JsonArray(vistas), salida)
            }
        }
    }

    afterSpec {
        if (disponible) motor.close()
    }

    "NAT-06 OCR nativo, modelo y escenas disponibles (obligatorio en CI)".config(enabled = obligatorio) {
        withClue("biblioteca ${System.getProperty("lectorcedula.ocr")}, modelo ${modelo != null}, escenas ${dir.absolutePath}") { disponible shouldBe true }
    }

    "NAT-06 Digital TD1: contenido mrz-td1 y NUIP 9999123456".config(enabled = disponible) {
        val s = lecturas.getValue("digital-1080p").salida
        s shouldNotBe null
        s!!["ok"] shouldBe JsonPrimitive(true)
        s["contenido"] shouldBe JsonPrimitive("mrz-td1")
        s["resultado"]!!.jsonObject["campos"]!!.jsonObject["nuip"] shouldBe JsonPrimitive("9999123456")
    }

    "NAT-06 Pasaporte TD3: contenido mrz-td3 y dos líneas de 44 caracteres".config(enabled = disponible) {
        val l = lecturas.getValue("pasaporte-1080p")
        l.resultado.lineas!!.map { it.length } shouldBe listOf(44, 44)
        l.salida!!["contenido"] shouldBe JsonPrimitive("mrz-td3")
    }

    "NAT-06 Giro de 180: resultado idéntico al de la imagen sin girar (y de pie, 90 y 270)".config(enabled = disponible) {
        val base = lecturas.getValue("digital-1080p")
        for (n in listOf("digital-girada-180-1080p", "digital-girada-90-1080p", "digital-girada-270-1080p")) {
            withClue(n) { lecturas.getValue(n).salida shouldBe base.salida }
        }
        lecturas.getValue("digital-girada-180-1080p").resultado.intento!!.endsWith("@180") shouldBe true
    }

    "NAT-06 Volcado para la paridad con packages/capture (CT)".config(enabled = disponible) {
        val volcado = buildJsonObject {
            put("fechaReferencia", fecha)
            put(
                "casos",
                JsonArray(
                    casos["casos"]!!.jsonArray.map { c ->
                        val l = lecturas.getValue(c.jsonObject["nombre"]!!.jsonPrimitive.content)
                        buildJsonObject {
                            put("nombre", l.nombre)
                            put("lineas", l.resultado.lineas?.let { x -> JsonArray(x.map(::JsonPrimitive)) } ?: JsonNull)
                            put("intento", l.resultado.intento?.let(::JsonPrimitive) ?: JsonNull)
                            put("llamadas", l.resultado.llamadas)
                            put("vistas", l.vistas)
                        }
                    },
                ),
            )
        }
        val salida = File("build/volcados/mrz.json")
        salida.parentFile.mkdirs()
        salida.writeText(volcado.toString())
        lecturas.values.all { it.resultado.lineas != null } shouldBe true
    }
})

