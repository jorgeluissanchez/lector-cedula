package io.github.jorgeluissanchez.lectorcedula

import io.github.jorgeluissanchez.lectorcedula.calidad.Fixtures
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.util.Base64

/**
 * Dobles de prueba del Lector (sdk-nativo, NAT-01). fixture-sintetico: el payload PDF417 es `completa-base` de
 * `casos-motor.json` (catálogo del generador, `PERSONA_BASE`, NUIP 9999123456); los frames, vídeos sintéticos o negros.
 */
object Falsos {
    /** Bytes PDF417 de `PERSONA_BASE` (los que entregará zxing-cpp en la tarea 1.4). */
    val bytesPersonaBase: ByteArray by lazy {
        val texto = Falsos::class.java.classLoader.getResourceAsStream("lectorcedula/casos-motor.json")!!.use { it.readBytes().toString(Charsets.UTF_8) }
        val caso = Json.parseToJsonElement(texto).jsonObject["casos"]!!.jsonArray.map { it.jsonObject }
            .first { it["id"]!!.jsonPrimitive.content == "completa-base" && it["fn"]!!.jsonPrimitive.content == "procesarPdf417" }
        Base64.getDecoder().decode(caso["args"]!!.jsonArray[0].jsonPrimitive.content)
    }

    /** Frame 1920x1080 negro (score bajo: `oscuro`). */
    fun negra(): FrameCamara = FrameCamara(ByteArray(1920 * 1080 * 4).also { p -> for (i in 3 until p.size step 4) p[i] = 255.toByte() }, 1920, 1080)

    private val amarilla by lazy { Fixtures.frame("amarilla-1080p") }

    /** Copia nueva del frame 0 de `amarilla-1080p` (el Lector pone a cero cada frame que recibe). */
    fun amarilla(): FrameCamara = FrameCamara(amarilla.pixeles.copyOf(), amarilla.ancho, amarilla.alto)

    /** Frame `indice` de un vídeo sintético. */
    fun video(nombre: String, indice: Int = 0): FrameCamara = Fixtures.frame(nombre, indice).let { FrameCamara(it.pixeles, it.ancho, it.alto) }
}

/** `FuenteFramesFalsa` de la spec: entrega una lista fija de frames; con `error`, `abrir` lanza ese código. */
class FuenteFramesFalsa(
    private val frames: List<() -> FrameCamara>,
    private val error: String? = null,
    private val alEntregar: (Int) -> Unit = {},
) : FuenteFrames {
    var aperturas = 0
        private set
    var cierres = 0
        private set
    var abierta = false
        private set
    val entregados = mutableListOf<FrameCamara>()
    private var i = 0

    override suspend fun abrir() {
        aperturas++
        error?.let { throw ErrorFuente(it) }
        abierta = true
        i = 0
    }

    override suspend fun siguiente(): FrameCamara? {
        if (!abierta || i >= frames.size) return null
        val f = frames[i]()
        alEntregar(i++)
        entregados += f
        return f
    }

    override fun cerrar() {
        abierta = false
        cierres++
    }
}

/** Decodificador falso: devuelve una copia de `bytes` (o nada) y guarda cada copia para comprobar que quedó a cero. */
class DecodificadorFalso(private val bytes: ByteArray?) : Decodificador {
    val entregados = mutableListOf<ByteArray>()
    val fasesAlLeer = mutableListOf<EstadoLector.Fase>()
    var lector: Lector? = null

    override fun leer(frame: FrameCamara, contenido: io.github.jorgeluissanchez.lectorcedula.calidad.Contenido?): Lectura? {
        lector?.let { fasesAlLeer += it.estado.value.fase }
        val copia = bytes?.copyOf() ?: return null
        entregados += copia
        return Lectura.Pdf417(copia)
    }
}

/** Fases observadas sin repeticiones consecutivas, a partir de cada transición del bundle (sin la conflación de StateFlow). */
class Secuencia(lector: Lector) {
    val fases = mutableListOf<String>()
    val pares = mutableListOf<Pair<String, String>>()

    init {
        lector.observador = { a, s ->
            pares += a.fase.codigo to s.fase.codigo
            if (fases.lastOrNull() != s.fase.codigo && a.fase != s.fase) fases += s.fase.codigo
        }
    }
}
