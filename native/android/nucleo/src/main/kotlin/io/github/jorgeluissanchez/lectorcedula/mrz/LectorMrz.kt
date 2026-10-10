package io.github.jorgeluissanchez.lectorcedula.mrz

import io.github.jorgeluissanchez.lectorcedula.Decodificador
import io.github.jorgeluissanchez.lectorcedula.FrameCamara
import io.github.jorgeluissanchez.lectorcedula.Lectura
import io.github.jorgeluissanchez.lectorcedula.calidad.Contenido
import io.github.jorgeluissanchez.lectorcedula.motor.MotorJs
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.put

/**
 * Motor OCR que recibe la vista ya preparada (RGBA) y devuelve el texto reconocido. En el SDK es Tesseract nativo con
 * `mrz.traineddata` ([TesseractNativo]); en pruebas, uno falso. Un fallo (excepción) cuenta como texto vacío.
 */
fun interface MotorOcr {
    fun reconocer(vista: ImagenRgba): String
}

/** Resumen de una vista que da `evaluarTextoMrz` del bundle (NAT-07: las reglas no están en Kotlin). */
sealed interface EvaluacionTexto {
    data class Valida(val lineas: List<String>, val digitosValidos: Int, val documento: Boolean) : EvaluacionTexto

    data class Invalida(val error: String, val lineas: List<String>?) : EvaluacionTexto
}

/** Evalúa el texto OCR de una vista para el formato pedido. */
fun interface EvaluadorTexto {
    fun evaluar(texto: String, formato: FormatoMrz): EvaluacionTexto
}

/** [EvaluadorTexto] con `evaluarTextoMrz` del bundle `nucleo-js` (NAT-06, NAT-07). */
class EvaluadorBundle(private val motor: MotorJs, private val fechaReferencia: () -> String) : EvaluadorTexto {
    override fun evaluar(texto: String, formato: FormatoMrz): EvaluacionTexto {
        val opciones = buildJsonObject {
            put("fechaReferencia", fechaReferencia())
            put("formato", formato.codigo)
        }
        val r = motor.llamar("evaluarTextoMrz", JsonPrimitive(texto), opciones) as? JsonObject ?: return EvaluacionTexto.Invalida("motor", null)
        val lineas = (r["lineas"] as? JsonArray)?.map { (it as JsonPrimitive).content }
        if ((r["ok"] as? JsonPrimitive)?.booleanOrNull != true) {
            return EvaluacionTexto.Invalida((r["error"] as? JsonPrimitive)?.content ?: "motor", lineas)
        }
        return EvaluacionTexto.Valida(
            lineas.orEmpty(),
            (r["digitosValidos"] as? JsonPrimitive)?.intOrNull ?: 0,
            (r["documento"] as? JsonPrimitive)?.booleanOrNull == true,
        )
    }
}

/** Resultado de una lectura MRZ: las líneas elegidas (o `null`), el intento que las leyó y las llamadas al OCR. */
data class ResultadoMrz(val lineas: List<String>?, val intento: String?, val llamadas: Int)

/**
 * Bucle de lectura MRZ (sdk-nativo, NAT-06): el de `crearLectorMrz` de `packages/capture` (LMI-12, LMI-12b, LMI-12c,
 * LMI-13, OD-21). Recorre el plan de vistas de [PlanMrz] (derecha, 90, 270 y 180 por evidencia), prepara cada vista
 * con [VistaOcr], llama al OCR y consulta el bundle. Se detiene con un documento (CE, pasaporte) o con 4 dígitos de
 * control válidos; si no, entrega el mejor intento o, si solo hubo documentos no admitidos, sus líneas para que
 * `procesarMrz` dé el error. Presupuesto de LMI-13: llamadas al OCR y tiempo por lectura. Sin E/S ni logs.
 */
class LectorMrz(
    private val ocr: MotorOcr,
    private val evaluador: EvaluadorTexto,
    maxLlamadasOcr: Int = MAX_LLAMADAS_OCR,
    tiempoLimiteMs: Long = TIEMPO_LIMITE_MS,
    private val ahora: () -> Long = System::currentTimeMillis,
) {
    private val maxLlamadas = if (maxLlamadasOcr > 0) maxLlamadasOcr else MAX_LLAMADAS_OCR
    private val limiteMs = if (tiempoLimiteMs > 0) tiempoLimiteMs else TIEMPO_LIMITE_MS

    /** Pruebas y volcado del diferencial: cada intento con la vista que recibió el OCR (no se retiene). */
    @JvmField
    internal var observador: ((IntentoPlan, ImagenRgba) -> Unit)? = null

    /** Lee la MRZ de `imagen`. `maxLlamadasLectura` (OFF-27c) acota esta lectura sin ampliar el tope del lector. */
    fun leer(imagen: ImagenRgba, formato: FormatoMrz = FormatoMrz.TD1, maxLlamadasLectura: Int? = null): ResultadoMrz {
        val tope = if (maxLlamadasLectura != null && maxLlamadasLectura > 0) minOf(maxLlamadas, maxLlamadasLectura) else maxLlamadas
        val inicio = ahora()
        var llamadas = 0
        var mejor: Pair<EvaluacionTexto.Valida, String>? = null
        var noAdmitido: List<String>? = null
        val plan = PlanMrz.intentos(imagen, formato).iterator()
        while (llamadas < tope && ahora() - inicio < limiteMs && plan.hasNext()) {
            val intento = plan.next()
            llamadas++
            val vista = VistaOcr.paraOcr(intento)
            observador?.invoke(intento, vista)
            val texto = try {
                ocr.reconocer(vista)
            } catch (e: Exception) {
                ""
            }
            when (val e = evaluador.evaluar(texto, formato)) {
                is EvaluacionTexto.Invalida -> if (e.error == "documento-no-admitido" && noAdmitido == null) noAdmitido = e.lineas
                is EvaluacionTexto.Valida -> {
                    if (e.documento) return ResultadoMrz(e.lineas, intento.nombre, llamadas)
                    if (mejor == null || e.digitosValidos > mejor.first.digitosValidos) mejor = e to intento.nombre
                    if (e.digitosValidos == DIGITOS_TD1) return ResultadoMrz(e.lineas, intento.nombre, llamadas)
                }
            }
        }
        mejor?.let { return ResultadoMrz(it.first.lineas, it.second, llamadas) }
        return ResultadoMrz(noAdmitido, null, llamadas)
    }

    companion object {
        /** Presupuesto por defecto de LMI-13 (el de `crearLectorMrz`). */
        const val MAX_LLAMADAS_OCR = 40
        const val TIEMPO_LIMITE_MS = 60_000L

        /** Número de dígitos de control de la TD1 que comprueba el bundle: con todos válidos el bucle se detiene. */
        private const val DIGITOS_TD1 = 4
    }
}

/**
 * [Decodificador] MRZ del [io.github.jorgeluissanchez.lectorcedula.Lector]: TD3 si la presencia vio un par TD3 (OD-20),
 * TD1 en otro caso. Las líneas las interpreta `procesarMrz` del bundle.
 */
class DecodificadorMrz(private val lector: LectorMrz) : Decodificador {
    override fun leer(frame: FrameCamara, contenido: Contenido?): Lectura? {
        val formato = if (contenido == Contenido.MRZ_TD3) FormatoMrz.TD3 else FormatoMrz.TD1
        val lineas = lector.leer(ImagenRgba(frame.pixeles, frame.ancho, frame.alto), formato).lineas ?: return null
        return Lectura.Mrz(lineas)
    }
}
