package io.github.jorgeluissanchez.lectorcedula

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive

/**
 * `EstadoLector` de SDK-28 en Kotlin (sdk-nativo, NAT-01, NAT-11): una vista tipada y de solo lectura del JSON que
 * produce `transicion()` del bundle. Kotlin no calcula ningún campo: solo lee.
 */
class EstadoLector(val json: JsonObject) {
    enum class Fase(val codigo: String) {
        INICIO("inicio"),
        PERMISO("permiso"),
        ACTIVO("activo"),
        LISTO("listo"),
        LEYENDO("leyendo"),
        VERIFICANDO("verificando"),
        RESULTADO("resultado"),
        ERROR("error"),
        ;

        companion object {
            fun de(codigo: String?): Fase = entries.firstOrNull { it.codigo == codigo } ?: INICIO
        }
    }

    /** `ResultadoPresentacion` (SDK-28): `campos` como texto o `null`, `confiable` siempre `false`. */
    class Resultado(val json: JsonObject) {
        val tipo: String? get() = json["tipo"]?.texto()
        val campos: Map<String, String?> get() = (json["campos"] as? JsonObject).orEmpty().mapValues { it.value.texto() }
        val warnings: List<String> get() = (json["warnings"] as? JsonArray).orEmpty().mapNotNull { it.texto() }
        val confiable: Boolean get() = (json["confiable"] as? JsonPrimitive)?.booleanOrNull ?: false
        val validacionId: String? get() = json["validacion_id"]?.texto()
    }

    data class Error(val codigo: String, val mensaje: String)

    val fase: Fase get() = Fase.de(json["fase"]?.texto())
    val resultado: Resultado? get() = (json["resultado"] as? JsonObject)?.let(::Resultado)
    val error: Error? get() = (json["error"] as? JsonObject)?.let { Error(it["codigo"]?.texto().orEmpty(), it["mensaje"]?.texto().orEmpty()) }
    val contenido: String? get() = json["contenido"]?.texto()
    val envio: JsonObject? get() = json["envio"] as? JsonObject
    val calidad: JsonObject? get() = json["calidad"] as? JsonObject
    val guia: JsonObject? get() = json["guia"] as? JsonObject
    val intento: Int get() = json["intento"]?.jsonPrimitive?.contentOrNull?.toIntOrNull() ?: 1

    override fun equals(other: Any?): Boolean = other is EstadoLector && other.json == json

    override fun hashCode(): Int = json.hashCode()

    override fun toString(): String = "EstadoLector(fase=${fase.codigo})"

    private companion object {
        fun JsonElement.texto(): String? = if (this is JsonNull) null else (this as? JsonPrimitive)?.contentOrNull
    }
}
