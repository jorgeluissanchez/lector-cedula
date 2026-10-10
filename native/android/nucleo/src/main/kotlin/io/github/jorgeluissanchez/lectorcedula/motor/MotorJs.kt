package io.github.jorgeluissanchez.lectorcedula.motor

import com.dokar.quickjs.QuickJs
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import java.io.Closeable

/**
 * Motor de reglas del SDK nativo (sdk-nativo, NAT-07; tarea 1.1): el bundle `@lector-cedula/nucleo-js` evaluado en
 * QuickJS con quickjs-kt (Apache-2.0; QuickJS de Bellard, MIT). Kotlin no contiene reglas de campos: solo pasa JSON
 * de entrada y recibe el JSON que serializa el propio bundle (`JSON.stringify`), igual byte a byte que en Node.
 * Sin red ni disco: el bundle no tiene E/S y el contexto no recibe bindings. Llamadas serializadas (un contexto).
 */
class MotorJs private constructor(private val js: QuickJs) : Closeable {
    /** Versión del bundle (`LectorCedulaNucleo.version`). */
    val version: String = evaluar("LectorCedulaNucleo.version")

    /**
     * Llama `LectorCedulaNucleo.<funcion>(...args)` y devuelve su salida serializada con `JSON.stringify` dentro del
     * motor. Solo admite las funciones públicas del bundle. Los argumentos son JSON (literal válido de JavaScript).
     */
    fun llamarTexto(funcion: String, vararg args: JsonElement): String {
        require(funcion in FUNCIONES) { "funcion-no-admitida" }
        val lista = args.joinToString(",") { JSON.encodeToString(JsonElement.serializer(), it) }
        return evaluar("JSON.stringify(LectorCedulaNucleo.$funcion($lista))")
    }

    /** Como [llamarTexto] pero devuelve el JSON ya interpretado. */
    fun llamar(funcion: String, vararg args: JsonElement): JsonElement = JSON.parseToJsonElement(llamarTexto(funcion, *args))

    @Synchronized
    private fun evaluar(codigo: String): String = runBlocking { js.evaluate<String>(codigo) }

    @Synchronized
    override fun close() = js.close()

    companion object {
        /** Funciones públicas del bundle (NAT-07, NAT-12). */
        val FUNCIONES = setOf("procesarPdf417", "procesarMrz", "evaluarTextoMrz", "transicion", "crearEstado", "validarOpciones", "validarUrlSubida", "decidirEnvio", "mensajeError")

        private val JSON = Json

        /** Ruta del bundle en el classpath (JVM) y en `assets/` (Android). */
        const val RECURSO = "lectorcedula/nucleo.js"

        /** Crea un motor con el código del bundle; falla si el código no define `LectorCedulaNucleo`. */
        fun crear(codigo: String): MotorJs {
            val js = QuickJs.create(Dispatchers.Unconfined)
            try {
                runBlocking { js.evaluate<Any?>(codigo, "nucleo.js", false) }
                val tipo = runBlocking { js.evaluate<String>("typeof LectorCedulaNucleo") }
                check(tipo == "object") { "bundle-invalido" }
                return MotorJs(js)
            } catch (e: Throwable) {
                js.close()
                throw e
            }
        }

        /** Motor con el bundle empaquetado como recurso del classpath. */
        fun desdeRecurso(): MotorJs {
            val flujo = MotorJs::class.java.classLoader.getResourceAsStream(RECURSO) ?: error("bundle-no-empaquetado")
            return crear(flujo.use { it.readBytes().toString(Charsets.UTF_8) })
        }
    }
}
