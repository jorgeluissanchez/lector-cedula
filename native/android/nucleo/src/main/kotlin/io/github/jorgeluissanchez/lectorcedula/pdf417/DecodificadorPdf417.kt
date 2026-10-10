package io.github.jorgeluissanchez.lectorcedula.pdf417

import io.github.jorgeluissanchez.lectorcedula.Decodificador
import io.github.jorgeluissanchez.lectorcedula.FrameCamara
import io.github.jorgeluissanchez.lectorcedula.Lectura
import io.github.jorgeluissanchez.lectorcedula.calidad.Contenido

/**
 * Opciones de zxing-cpp para el PDF417 (sdk-nativo, NAT-05): los valores efectivos del intento `original` de la web
 * (`packages/capture/src/pdf417/decodificar.ts`, LPI-02, con los valores por omisión de zxing-wasm para inversión y
 * reducción). Un único formato: el QR de la cédula digital nunca se decodifica (principio V).
 */
object OpcionesPdf417 {
    /** Configuración de formatos del binding: exactamente `["PDF417"]`. */
    val FORMATOS: List<String> = listOf("PDF417")
    const val TRY_HARDER = true
    const val TRY_ROTATE = true
    const val TRY_INVERT = true
    const val TRY_DOWNSCALE = true
    const val MAX_SIMBOLOS = 1
}

/** Código que devuelve el binding. `bytes` es del decodificador, que lo pone a cero al terminar (NAT-13). */
class CodigoLeido(val formato: String, val bytes: ByteArray?, val valido: Boolean)

/**
 * Binding nativo del lector de códigos (zxing-cpp en Android). Lee una imagen de luminancia de 8 bits, fila a fila sin
 * relleno, y solo la usa durante la llamada.
 */
interface LectorCodigosNativo {
    /** Formatos con los que está configurado (nombres de [OpcionesPdf417.FORMATOS]). */
    val formatos: List<String>

    fun leer(luma: ByteArray, ancho: Int, alto: Int): List<CodigoLeido>
}

/** Luminancia BT.601 entera, igual que `aGris` de `packages/capture/src/pdf417/localizar.ts` (redondeo de `Math.round`). */
object Luminancia {
    fun deRgba(rgba: ByteArray, ancho: Int, alto: Int): ByteArray {
        return ByteArray(ancho * alto) // ROJO TDD: sin implementar
    }
}

/**
 * Decodificador PDF417 del núcleo (NAT-05): convierte el frame a resolución completa en luminancia, lo entrega al
 * binding configurado solo con `PDF417` y devuelve los bytes crudos del primer símbolo PDF417 válido, que interpreta
 * el bundle (`procesarPdf417`). Nunca interpreta campos ni escribe en logs; la luminancia y los bytes que no se
 * entregan quedan a cero (NAT-13). Un fallo del binding equivale a "sin lectura en este frame".
 */
class DecodificadorPdf417(private val nativo: LectorCodigosNativo) : Decodificador {
    override fun leer(frame: FrameCamara, contenido: Contenido?): Lectura? {
        if (frame.ancho > 0) return null // ROJO TDD: sin implementar
        val luma = Luminancia.deRgba(frame.pixeles, frame.ancho, frame.alto)
        val codigos = try {
            nativo.leer(luma, frame.ancho, frame.alto)
        } catch (e: Exception) {
            emptyList()
        } finally {
            luma.fill(0)
        }
        val elegido = codigos.firstOrNull { it.formato == FORMATO && it.valido && it.bytes != null && it.bytes.isNotEmpty() }
        val copia = elegido?.bytes?.copyOf()
        for (c in codigos) c.bytes?.fill(0)
        return copia?.let { Lectura.Pdf417(it) }
    }

    private companion object {
        const val FORMATO = "PDF417"
    }
}
