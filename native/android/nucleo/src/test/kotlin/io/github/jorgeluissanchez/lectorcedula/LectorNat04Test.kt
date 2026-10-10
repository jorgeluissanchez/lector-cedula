package io.github.jorgeluissanchez.lectorcedula

import io.github.jorgeluissanchez.lectorcedula.calidad.Fixtures
import io.github.jorgeluissanchez.lectorcedula.motor.MotorJs
import io.kotest.core.spec.style.StringSpec
import io.kotest.matchers.collections.shouldContain
import io.kotest.matchers.shouldBe
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.double
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

/**
 * NAT-04 Presencia de documento y guía en el Lector (fixture-sintetico: vídeos `sin-documento-1080p` y
 * `amarilla-1080p`). La calidad es la real (AnalizadorCalidad); las fases las calcula el bundle.
 */
class LectorNat04Test : StringSpec({
    val motor by lazy { MotorJs.desdeRecurso() }
    afterSpec { motor.close() }

    fun normalizada(estado: EstadoLector): List<Double> {
        val n = estado.guia!!["normalizada"]!!.jsonObject
        return listOf("x", "y", "ancho", "alto").map { n[it]!!.jsonPrimitive.double }
    }

    "NAT-04 Guía normalizada: frame 1920x1080 y guía { 192, 216, 1536, 648 } dan { 0.1, 0.2, 0.8, 0.6 } en el estado" {
        val activo = buildJsonObject {
            put("tipo", "camara-lista")
        }.let { ev -> motor.llamar("transicion", motor.llamar("transicion", motor.llamar("crearEstado"), buildJsonObject { put("tipo", "iniciar") }), ev) }
        val calidad = buildJsonObject {
            put("tipo", "calidad")
            put("apto", false)
            put(
                "frame",
                buildJsonObject {
                    put("score", 10)
                    put("motivo", "acerca")
                    put("guia", buildJsonObject { put("x", 192); put("y", 216); put("ancho", 1536); put("alto", 648) })
                    put("anchoVideo", 1920)
                    put("altoVideo", 1080)
                    put("contenido", kotlinx.serialization.json.JsonNull)
                },
            )
        }
        val estado = EstadoLector(motor.llamar("transicion", activo, calidad) as JsonObject)
        normalizada(estado) shouldBe listOf(0.1, 0.2, 0.8, 0.6)
    }

    "NAT-04 Sin documento: 30 frames de sin-documento-1080p dejan la fase en activo con motivo acerca".config(enabled = Fixtures.disponibles()) {
        val l = Lector(motor, decodificador = DecodificadorFalso(null), fechaReferencia = { "2026-10-09" })
        val s = Secuencia(l)
        val fuente = FuenteFramesFalsa(List(30) { i -> { Falsos.video("sin-documento-1080p", i % 10) } })
        l.iniciar(fuente)
        fuente.entregados.size shouldBe 30
        s.fases shouldBe listOf("permiso", "activo")
        l.estado.value.fase shouldBe EstadoLector.Fase.ACTIVO
        l.estado.value.calidad!!["motivo"] shouldBe JsonPrimitive("acerca")
        // La guía publicada es la de CAM-08 del frame (en píxeles y normalizada).
        val g = io.github.jorgeluissanchez.lectorcedula.calidad.Guia.calcularGuia(1920, 1080)
        normalizada(l.estado.value) shouldBe listOf(g.x / 1920, g.y / 1080, g.ancho / 1920, g.alto / 1080)
    }

    "NAT-04 Documento presente: 3 frames de amarilla-1080p pasan la fase a listo".config(enabled = Fixtures.disponibles()) {
        val l = Lector(motor, decodificador = DecodificadorFalso(null), fechaReferencia = { "2026-10-09" })
        val s = Secuencia(l)
        l.iniciar(FuenteFramesFalsa(List(3) { { Falsos.amarilla() } }))
        s.pares shouldContain ("activo" to "listo")
        s.fases.take(3) shouldBe listOf("permiso", "activo", "listo")
    }
})
