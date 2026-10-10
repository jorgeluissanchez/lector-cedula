package io.github.jorgeluissanchez.lectorcedula.camara

import io.github.jorgeluissanchez.lectorcedula.ErrorFuente
import kotlinx.coroutines.CompletableDeferred
import java.nio.ByteBuffer

/**
 * Plano Y sintético con relleno al final de cada fila (`pasoFila > ancho`) o con `pasoPixel` 2, como los que entrega
 * CameraX en YUV_420_888. Cuenta las lecturas del plano y los cierres para comprobar que solo se copia lo consumido.
 */
class ImagenFalsa(
    override val ancho: Int,
    override val alto: Int,
    private val luma: (x: Int, y: Int) -> Int,
    override val pasoFila: Int = ancho,
    override val pasoPixel: Int = 1,
    relleno: Byte = 0x55,
    tamano: Int? = null,
) : ImagenLuminancia {
    private val datos: ByteBuffer = ByteBuffer.allocate(tamano ?: ((alto - 1) * pasoFila + (ancho - 1) * pasoPixel + 1)).also { b ->
        for (i in 0 until b.capacity()) b.put(i, relleno)
        for (y in 0 until alto) for (x in 0 until ancho) {
            val i = y * pasoFila + x * pasoPixel
            if (i < b.capacity()) b.put(i, luma(x, y).toByte())
        }
    }
    var lecturas = 0
        private set
    var cierres = 0
        private set

    override val plano: ByteBuffer
        get() {
            lecturas++
            return datos
        }

    override fun cerrar() {
        cierres++
    }
}

/** `ControlCamara` falso: registra enfoques, linterna y cierres; `abrir` puede lanzar o esperar a `liberarApertura`. */
class CamaraFalsa(
    private val resolucion: Resolucion = Resolucion(1920, 1080),
    override val tieneFlash: Boolean = true,
    private val error: Exception? = null,
    private val esperarApertura: Boolean = false,
) : ControlCamara {
    val enfoques = mutableListOf<Enfoque>()
    val linternas = mutableListOf<Boolean>()
    var aperturas = 0
        private set
    var cierres = 0
        private set
    var abierta = false
        private set
    val apertura = CompletableDeferred<Unit>()
    private val liberarApertura = CompletableDeferred<Unit>()
    var receptor: ((ImagenLuminancia) -> Unit)? = null
        private set

    fun liberarApertura() = liberarApertura.complete(Unit)

    override suspend fun abrir(receptor: (ImagenLuminancia) -> Unit): Resolucion {
        aperturas++
        apertura.complete(Unit)
        if (esperarApertura) liberarApertura.await()
        error?.let { throw it }
        this.receptor = receptor
        abierta = true
        return resolucion
    }

    override fun enfocar(enfoque: Enfoque) {
        enfoques += enfoque
    }

    override fun linterna(encendida: Boolean) {
        linternas += encendida
    }

    override fun cerrar() {
        cierres++
        abierta = false
    }

    /** Entrega una imagen al último receptor, como el analizador de CameraX (también tras cerrar: carrera real). */
    fun entregar(imagen: ImagenLuminancia) {
        receptor!!(imagen)
    }

    companion object {
        fun denegada() = CamaraFalsa(error = ErrorFuente("camara-denegada"))
    }
}
