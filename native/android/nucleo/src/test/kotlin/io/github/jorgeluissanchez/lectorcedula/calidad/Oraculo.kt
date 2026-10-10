package io.github.jorgeluissanchez.lectorcedula.calidad

import com.dokar.quickjs.QuickJs
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import java.io.Closeable
import java.util.Base64

/**
 * Oráculo TS de calidad (tarea 1.3): `packages/capture` (calidad, guía y localización MRZ) compilado por
 * `npm run nucleo:construir` en `dist/oraculo-calidad.js` y evaluado en QuickJS dentro de la misma prueba, para
 * comparar el puerto Kotlin con la implementación web sin salir de la JVM. Solo pruebas.
 */
class Oraculo : Closeable {
    private val js = QuickJs.create(Dispatchers.Unconfined)

    init {
        val codigo = Oraculo::class.java.classLoader.getResourceAsStream("lectorcedula/oraculo-calidad.js")
            ?.use { it.readBytes().toString(Charsets.UTF_8) }
            ?: error("Falta el oráculo: npm run nucleo:construir")
        runBlocking { js.evaluate<Any?>(codigo, "oraculo-calidad.js", false) }
    }

    @Synchronized
    fun json(expresion: String): JsonElement = Json.parseToJsonElement(runBlocking { js.evaluate<String>(expresion) })

    @Synchronized
    fun numero(expresion: String): Double = runBlocking { js.evaluate<Any?>(expresion) }.let { (it as Number).toDouble() }

    override fun close() = js.close()

    companion object {
        fun b64(b: ByteArray): String = Base64.getEncoder().encodeToString(b)
    }
}
