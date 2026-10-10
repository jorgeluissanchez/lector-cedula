package io.github.jorgeluissanchez.lectorcedula.mrz

import io.kotest.core.spec.style.StringSpec
import io.kotest.matchers.shouldBe
import io.kotest.matchers.shouldNotBe
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.File

/**
 * NAT-06 "Mismo modelo" (sdk-nativo, tarea 1.5): el `mrz.traineddata` que empaqueta el núcleo (y por tanto el AAR) tiene
 * el SHA-256 de `tesseract-mrz` en `models/manifest.json`, el mismo de la web; uno alterado no llega a Tesseract.
 * Con `-Dnat.ocrObligatorio=true` (CI) el modelo empaquetado es obligatorio.
 */
class ModeloMrzNat06Test : StringSpec({
    val obligatorio = System.getProperty("nat.ocrObligatorio") == "true"

    "NAT-06 Mismo modelo: la constante del núcleo es el SHA-256 de tesseract-mrz en models/manifest.json" {
        val manifiesto = Json.parseToJsonElement(File("../../../models/manifest.json").readText()).jsonArray
        val mrz = manifiesto.map { it.jsonObject }.single { it["nombre"]!!.jsonPrimitive.content == "tesseract-mrz" }
        mrz["sha256"]!!.jsonPrimitive.content shouldBe ModeloMrz.SHA256
        mrz["licencia"]!!.jsonPrimitive.content shouldBe "BSD-3-Clause"
    }

    val manifiestoWeb = File("../../../packages/web/dist/assets/manifest.json")
    "NAT-06 Mismo modelo: igual al mrz.traineddata de @lector-cedula/web/assets/manifest.json".config(enabled = obligatorio || manifiestoWeb.isFile) {
        val recursos = Json.parseToJsonElement(manifiestoWeb.readText()).jsonObject["recursos"]!!.jsonArray.map { it.jsonObject }
        recursos.single { it["archivo"]!!.jsonPrimitive.content == "mrz.traineddata" }["sha256"]!!.jsonPrimitive.content shouldBe ModeloMrz.SHA256
    }

    "NAT-06 Mismo modelo: el mrz.traineddata empaquetado coincide con el manifiesto".config(enabled = obligatorio || ModeloMrz.cargar() != null) {
        val bytes = ModeloMrz::class.java.classLoader.getResourceAsStream(ModeloMrz.RECURSO)?.use { it.readBytes() }
        bytes shouldNotBe null
        ModeloMrz.sha256(bytes!!) shouldBe ModeloMrz.SHA256
        ModeloMrz.cargar() shouldNotBe null
    }

    "NAT-06 Un modelo alterado o ausente se rechaza antes de llegar a Tesseract" {
        ModeloMrz.sha256("abc".toByteArray()) shouldBe "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        ModeloMrz.verificar("abc".toByteArray()) shouldBe null
        TesseractNativo.crear(ByteArray(16)) shouldBe null
        ModeloMrz.cargar(object : ClassLoader(null) {}) shouldBe null
    }
})
