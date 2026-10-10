package io.github.jorgeluissanchez.lectorcedula

import io.github.jorgeluissanchez.lectorcedula.calidad.AnalizadorCalidad
import io.github.jorgeluissanchez.lectorcedula.calidad.Contenido
import io.github.jorgeluissanchez.lectorcedula.calidad.Guia
import io.github.jorgeluissanchez.lectorcedula.calidad.Umbrales
import io.github.jorgeluissanchez.lectorcedula.motor.MotorJs
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.time.LocalDate
import java.time.ZoneId
import java.util.Base64

/**
 * Frame RGBA de la cámara a resolución completa. Lo posee quien lo entrega; el [Lector] lo libera (pone a cero) al
 * terminar de usarlo (NAT-13). Liberar dos veces no lanza.
 */
class FrameCamara(val pixeles: ByteArray, val ancho: Int, val alto: Int) {
    fun liberar() = pixeles.fill(0)
}

/** Fallo al abrir la fuente con su código público de SDK-27 (`camara-denegada`, `camara-no-disponible`, ...). */
class ErrorFuente(val codigo: String) : Exception(codigo)

/** Fuente de frames inyectable (NAT-01): CameraX en Android, un vídeo o imágenes en pruebas. */
interface FuenteFrames {
    /** Abre la fuente; lanza [ErrorFuente] si no puede (permiso denegado, sin cámara). */
    suspend fun abrir()

    /** Siguiente frame o `null` si la fuente se cerró o se agotó. */
    suspend fun siguiente(): FrameCamara?

    /** Cierra la fuente y libera la cámara. Idempotente. */
    fun cerrar()
}

/** Datos crudos leídos por el decodificador nativo: los interpreta el bundle (NAT-05, NAT-06). */
sealed interface Lectura {
    class Pdf417(val bytes: ByteArray) : Lectura

    class Mrz(val lineas: List<String>) : Lectura
}

/** Decodificador de contenido (zxing-cpp para PDF417, Tesseract para MRZ). `null`: no se pudo leer este frame. */
fun interface Decodificador {
    fun leer(frame: FrameCamara, contenido: Contenido?): Lectura?
}

/**
 * Lector nativo (sdk-nativo, NAT-01, NAT-11): mismo modelo de estado que `@lector-cedula/web`. Cada cambio de [estado]
 * lo calcula `transicion()` del bundle `nucleo-js` en QuickJS; Kotlin solo orquesta la fuente, la calidad (NAT-03) y el
 * decodificador, y nunca interpreta campos. Sin servidor no hay red. No escribe en disco.
 */
class Lector(
    private val motor: MotorJs,
    private val opciones: JsonObject = JsonObject(emptyMap()),
    private val decodificador: Decodificador,
    private val umbrales: Umbrales = Umbrales.POR_DEFECTO,
    private val analizar: (FrameCamara) -> AnalizadorCalidad.Evaluacion? = AnalizadorCalidad(umbrales).let { a -> { f -> a.evaluarCompleto(f.pixeles, f.ancho, f.alto) } },
    private val fechaReferencia: () -> String = { LocalDate.now(ZoneId.of("America/Bogota")).toString() },
) {
    private val _estado = MutableStateFlow(EstadoLector(motor.llamar("crearEstado", opciones) as JsonObject))

    /** Estado observable (SDK-28). */
    val estado: StateFlow<EstadoLector> = _estado.asStateFlow()

    private var fuente: FuenteFrames? = null
    private var cuenta = 0
    private var destruido = false
    private val idioma: String = (opciones["idioma"] as? JsonPrimitive)?.content ?: "es"

    /** Abre `fuente` y procesa frames hasta un estado terminal, el fin de la fuente o [cancelar]. */
    suspend fun iniciar(fuente: FuenteFrames) {
        if (destruido) return
        if (!emitir(evento("iniciar"), EstadoLector.Fase.PERMISO)) return
        ejecutar(fuente)
    }

    /** Desde `resultado` o `error`, vuelve a `permiso` y reabre la última fuente (SDK-27). */
    suspend fun reintentar() {
        val f = fuente ?: return
        if (destruido) return
        if (!emitir(evento("reintentar"), EstadoLector.Fase.PERMISO)) return
        ejecutar(f)
    }

    /** Vuelve a `inicio` y libera la cámara (NAT-02 "Liberación"). */
    fun cancelar() {
        cerrarFuente()
        emitir(evento("cancelar"))
    }

    /** Cancela y deja el lector inservible: `iniciar` y `reintentar` ya no hacen nada. */
    fun destruir() {
        cancelar()
        destruido = true
    }

    private suspend fun ejecutar(f: FuenteFrames) {
        fuente = f
        cuenta = 0
        try {
            f.abrir()
        } catch (e: ErrorFuente) {
            falla(e.codigo)
            return
        } catch (e: Exception) {
            falla("camara-error")
            return
        }
        if (estado.value.fase != EstadoLector.Fase.PERMISO || fuente !== f) {
            f.cerrar()
            return
        }
        emitir(evento("camara-lista"))
        while (estado.value.fase == EstadoLector.Fase.ACTIVO || estado.value.fase == EstadoLector.Fase.LISTO) {
            if (fuente !== f) return
            val frame = f.siguiente() ?: return
            try {
                procesar(frame)
            } finally {
                frame.liberar()
            }
        }
    }

    /** Un frame: calidad y presencia, autocaptura (CAL-11) y, si toca, lectura e interpretación en el bundle. */
    private fun procesar(frame: FrameCamara) {
        val ev = try {
            analizar(frame)
        } catch (e: Exception) {
            falla("calidad-error")
            return
        } ?: return
        val r = ev.resultado
        val apto = r.score >= umbrales.umbralListo
        val guia = Guia.calcularGuia(frame.ancho, frame.alto)
        val pista = when (ev.contenido) {
            Contenido.PDF417 -> JsonPrimitive("pdf417")
            Contenido.MRZ_TD1 -> JsonPrimitive("mrz")
            else -> JsonNull
        }
        emitir(
            buildJsonObject {
                put("tipo", "calidad")
                put("apto", apto)
                put(
                    "frame",
                    buildJsonObject {
                        put("score", r.score)
                        put("motivo", r.motivo?.codigo?.let(::JsonPrimitive) ?: JsonNull)
                        put("guia", buildJsonObject { put("x", guia.x); put("y", guia.y); put("ancho", guia.ancho); put("alto", guia.alto) })
                        put("anchoVideo", frame.ancho)
                        put("altoVideo", frame.alto)
                        put("contenido", pista)
                    },
                )
            },
        )
        cuenta = if (apto) cuenta + 1 else 0
        if (cuenta < umbrales.framesConsecutivos) return
        cuenta = 0
        leer(frame, ev.contenido)
    }

    private fun leer(frame: FrameCamara, contenido: Contenido?) {
        emitir(buildJsonObject { put("tipo", "leyendo"); put("contenido", contenido?.codigo?.let(::JsonPrimitive) ?: JsonNull) })
        val opcionesProceso = buildJsonObject {
            put("fechaReferencia", fechaReferencia())
            for (clave in listOf("admitirTi", "enmascarar", "documentos")) opciones[clave]?.let { put(clave, it) }
        }
        val salida = try {
            when (val l = decodificador.leer(frame, contenido)) {
                is Lectura.Pdf417 -> try {
                    motor.llamar("procesarPdf417", JsonPrimitive(Base64.getEncoder().encodeToString(l.bytes)), opcionesProceso)
                } finally {
                    l.bytes.fill(0)
                }
                is Lectura.Mrz -> motor.llamar("procesarMrz", JsonArray(l.lineas.map(::JsonPrimitive)), opcionesProceso)
                null -> null
            }
        } catch (e: Exception) {
            null
        }
        if (salida !is JsonObject) {
            emitir(evento("reintento-automatico"))
            return
        }
        if (salida["ok"] != JsonPrimitive(true)) {
            val codigo = ((salida["error"] as? JsonObject)?.get("codigo") as? JsonPrimitive)?.content ?: "lectura-fallida"
            falla(codigo)
            return
        }
        cerrarFuente()
        val decision = motor.llamar("decidirEnvio", salida, opciones) as? JsonObject
        emitir(
            buildJsonObject {
                put("tipo", "resultado")
                put("resultado", salida["resultado"] ?: JsonNull)
                put("contenido", salida["contenido"] ?: JsonNull)
                put("envio", decision?.get("envio") ?: JsonNull)
            },
        )
    }

    private fun falla(codigo: String) {
        cerrarFuente()
        val error = motor.llamar("mensajeError", JsonPrimitive(codigo), JsonPrimitive(idioma)) as? JsonObject
            ?: (motor.llamar("mensajeError", JsonPrimitive("camara-error"), JsonPrimitive(idioma)) as JsonObject)
        emitir(buildJsonObject { put("tipo", "fallo"); put("error", error) })
    }

    private fun cerrarFuente() {
        val f = fuente
        fuente = null
        f?.cerrar()
    }

    private fun evento(tipo: String): JsonObject = buildJsonObject { put("tipo", tipo) }

    /** Aplica `transicion()` del bundle; con `esperada`, indica si la fase resultante es esa. */
    @Synchronized
    private fun emitir(evento: JsonElement, esperada: EstadoLector.Fase? = null): Boolean {
        val siguiente = motor.llamar("transicion", _estado.value.json, evento) as? JsonObject ?: return false
        _estado.value = EstadoLector(siguiente)
        return esperada == null || _estado.value.fase == esperada
    }
}
