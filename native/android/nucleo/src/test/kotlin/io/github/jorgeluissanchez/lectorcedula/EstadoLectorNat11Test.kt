package io.github.jorgeluissanchez.lectorcedula

import io.kotest.core.spec.style.StringSpec
import io.kotest.matchers.shouldBe
import io.kotest.matchers.shouldNotBe
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject

/**
 * NAT-11 (API Kotlin): `EstadoLector` es una vista de solo lectura del JSON del bundle (SDK-28). fixture-sintetico: JSON
 * escrito a mano con el NUIP 9999123456.
 */
class EstadoLectorNat11Test : StringSpec({
    fun estado(texto: String) = EstadoLector(Json.parseToJsonElement(texto) as JsonObject)

    "NAT-11 Resultado: tipo, campos, warnings, confiable y validacion_id tal como los da el bundle" {
        val e = estado(
            """{"fase":"resultado","intento":3,"contenido":"pdf417","resultado":{"tipo":"cedula-ciudadania","campos":{"nuip":"9999123456","rh":null},
            "warnings":["h-01",null,"h-02"],"confiable":true,"validacion_id":"val_sintetico_01"},"error":null}""",
        )
        e.fase shouldBe EstadoLector.Fase.RESULTADO
        e.intento shouldBe 3
        e.contenido shouldBe "pdf417"
        val r = e.resultado!!
        r.tipo shouldBe "cedula-ciudadania"
        r.campos shouldBe mapOf("nuip" to "9999123456", "rh" to null)
        r.warnings shouldBe listOf("h-01", "h-02")
        r.confiable shouldBe true
        r.validacionId shouldBe "val_sintetico_01"
        e.error shouldBe null
    }

    "NAT-11 Valores ausentes o de otro tipo: confiable false, listas vacías, nulos e intento 1" {
        val e = estado("""{"fase":"otra","resultado":{"tipo":null,"campos":[],"warnings":{},"confiable":"si","validacion_id":null},"intento":"x"}""")
        e.fase shouldBe EstadoLector.Fase.INICIO
        e.intento shouldBe 1
        val r = e.resultado!!
        r.tipo shouldBe null
        r.campos shouldBe emptyMap()
        r.warnings shouldBe emptyList()
        r.confiable shouldBe false
        r.validacionId shouldBe null
        estado("""{"resultado":{}}""").resultado!!.confiable shouldBe false
        estado("""{"resultado":{"confiable":false}}""").resultado!!.confiable shouldBe false
        e.envio shouldBe null
        e.calidad shouldBe null
        e.guia shouldBe null
    }

    "NAT-11 Error con opción, envío, calidad y guía como objetos JSON" {
        val e = estado(
            """{"fase":"error","error":{"codigo":"opcion-invalida","mensaje":"m","opcion":"servidor"},"envio":{"estado":"fallido"},
            "calidad":{"score":10},"guia":{"normalizada":{}}}""",
        )
        e.error shouldBe EstadoLector.Error("opcion-invalida", "m", "servidor")
        estado("""{"error":{"codigo":"camara-denegada","mensaje":"m"}}""").error!!.opcion shouldBe null
        estado("""{"error":{}}""").error shouldBe EstadoLector.Error("", "", null)
        (e.envio != null && e.calidad != null && e.guia != null) shouldBe true
    }

    "NAT-11 Igualdad por contenido JSON, hashCode coherente y toString sin datos del documento" {
        val a = estado("""{"fase":"resultado","resultado":{"campos":{"nuip":"9999123456"}}}""")
        val b = estado("""{"fase":"resultado","resultado":{"campos":{"nuip":"9999123456"}}}""")
        a shouldBe b
        a.hashCode() shouldBe b.hashCode()
        a.hashCode() shouldBe a.json.hashCode()
        a shouldNotBe estado("""{"fase":"inicio"}""")
        (a.equals("texto")) shouldBe false
        a.toString() shouldBe "EstadoLector(fase=resultado)"
        EstadoLector.Fase.entries.map { it.codigo } shouldBe listOf("inicio", "permiso", "activo", "listo", "leyendo", "verificando", "resultado", "error")
        EstadoLector.Fase.entries.forEach { EstadoLector.Fase.de(it.codigo) shouldBe it }
        EstadoLector.Fase.de(null) shouldBe EstadoLector.Fase.INICIO
    }
})
