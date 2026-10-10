package io.github.jorgeluissanchez.lectorcedula.motor

import io.github.jorgeluissanchez.lectorcedula.nucleo.LectorCedulaVersion
import io.kotest.assertions.throwables.shouldThrow
import io.kotest.core.spec.style.StringSpec
import io.kotest.matchers.shouldBe
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * NAT-07 "Igualdad entre motores" y "Errores pasados" en QuickJS (quickjs-kt) frente a Node. fixture-sintetico: los
 * casos los genera `packages/nucleo-js/scripts/generar-casos-nativos.mjs` con el catálogo del generador (NUIP
 * 9999123456); una prueba de Vitest exige que estén al día.
 */
class MotorJsNat07Test : StringSpec({
    val motor by lazy { MotorJs.desdeRecurso() }
    val casos by lazy {
        val texto = MotorJsNat07Test::class.java.classLoader.getResourceAsStream("lectorcedula/casos-motor.json")!!.use { it.readBytes().toString(Charsets.UTF_8) }
        Json.parseToJsonElement(texto).jsonObject
    }

    afterSpec { motor.close() }

    "NAT-07 QuickJS sin globals de navegador y con la versión del paquete" {
        motor.version shouldBe LectorCedulaVersion.VERSION
        motor.version shouldBe casos["version"]!!.jsonPrimitive.content
    }

    "NAT-07 Igualdad entre motores: salida JSON idéntica byte a byte a Node en el 100 % de los casos" {
        val lista = casos["casos"]!!.jsonArray
        (lista.size > 50) shouldBe true
        val distintos = lista.map { it.jsonObject }.filter { c ->
            val args = c["args"]!!.jsonArray.toTypedArray()
            motor.llamarTexto(c["fn"]!!.jsonPrimitive.content, *args) != c["salida"]!!.jsonPrimitive.content
        }.map { it["id"]!!.jsonPrimitive.content }
        distintos shouldBe emptyList()
    }

    "NAT-07 Errores pasados en QuickJS desde Kotlin (RH AB+, AB-, O-, sexo F con M, Ñ, orden de apellidos)" {
        fun campos(id: String): JsonObject {
            val c = casos["casos"]!!.jsonArray.map { it.jsonObject }.first { it["id"]!!.jsonPrimitive.content == id && it["fn"]!!.jsonPrimitive.content == "procesarPdf417" }
            val r = motor.llamar("procesarPdf417", c["args"]!!.jsonArray[0], JsonObject(mapOf("fechaReferencia" to JsonPrimitive("2026-10-09")))).jsonObject
            r["ok"] shouldBe JsonPrimitive(true)
            return r["resultado"]!!.jsonObject["campos"]!!.jsonObject
        }
        campos("rh-ab-positivo")["rh"] shouldBe JsonPrimitive("AB+")
        campos("rh-ab-negativo")["rh"] shouldBe JsonPrimitive("AB-")
        campos("rh-o-negativo")["rh"] shouldBe JsonPrimitive("O-")
        campos("sexo-f-apellido-con-m")["sexo"] shouldBe JsonPrimitive("F")
        campos("sexo-f-apellido-con-m")["apellidos"] shouldBe JsonPrimitive("MARTINEZ EJEMPLO")
        campos("enie")["apellidos"] shouldBe JsonPrimitive("PEÑA NUÑEZ")
        campos("completa-base")["apellidos"] shouldBe JsonPrimitive("PRUEBA EJEMPLO")
        campos("completa-base")["nombres"] shouldBe JsonPrimitive("FICTICIA LUZ")
        campos("apellido-compuesto")["apellidos"] shouldBe JsonPrimitive("DE LA OSSA EJEMPLO")
        campos("nuip-corto")["nuip"] shouldBe JsonPrimitive("99991234")
    }

    "NAT-07 Solo las funciones públicas del bundle; un bundle sin LectorCedulaNucleo se rechaza" {
        shouldThrow<IllegalArgumentException> { motor.llamarTexto("eval", JsonPrimitive("1")) }
        shouldThrow<IllegalArgumentException> { motor.llamarTexto("constructor") }
        shouldThrow<IllegalStateException> { MotorJs.crear("var x = 1;") }
        MotorJs.FUNCIONES shouldBe setOf("procesarPdf417", "procesarMrz", "transicion", "crearEstado", "validarOpciones", "validarUrlSubida", "decidirEnvio", "mensajeError")
    }

    "NAT-07 Entradas arbitrarias del puente nunca lanzan dentro del motor" {
        for (f in MotorJs.FUNCIONES) {
            motor.llamarTexto(f, JsonArray(listOf(JsonPrimitive(1))), JsonObject(emptyMap()))
            motor.llamarTexto(f)
        }
    }
})
