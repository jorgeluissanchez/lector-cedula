package io.github.jorgeluissanchez.lectorcedula.camara

import io.github.jorgeluissanchez.lectorcedula.FrameCamara
import io.github.jorgeluissanchez.lectorcedula.FuenteFrames
import io.github.jorgeluissanchez.lectorcedula.calidad.Guia
import kotlinx.coroutines.channels.Channel
import java.nio.ByteBuffer

/**
 * Plano de luminancia prestado por la cámara (el plano Y de un `ImageProxy` YUV_420_888 en Android). Lo posee la
 * cámara: la fuente lo lee una sola vez, durante la conversión, y lo devuelve con [cerrar]. Nunca se retiene ni se
 * escribe (NAT-13).
 */
interface ImagenLuminancia {
    val ancho: Int
    val alto: Int

    /** Plano Y desde su posición actual: el píxel (x, y) está en `posicion + y·pasoFila + x·pasoPixel`. */
    val plano: ByteBuffer
    val pasoFila: Int
    val pasoPixel: Int

    /** Devuelve la imagen a la cámara (`ImageProxy.close`). */
    fun cerrar()
}

/** Resolución del flujo de análisis, en la orientación del sensor. */
data class Resolucion(val ancho: Int, val alto: Int)

/**
 * Acción de enfoque y medición (NAT-02): punto `(x, y)` en píxeles de un frame de análisis `ancho`×`alto`, sin
 * cancelación automática. En Android es una `FocusMeteringAction` de medición (AE y AWB) que deja el autoenfoque en modo
 * continuo (ver `CamaraX`).
 */
data class Enfoque(val x: Double, val y: Double, val ancho: Int, val alto: Int)

/** Cámara de la plataforma vista desde el núcleo: CameraX en Android (`CamaraX`), una cámara falsa en `KJ`. */
interface ControlCamara {
    /**
     * Abre la cámara trasera a 1920x1080 o más y empieza a entregar imágenes a `receptor` desde su propio hilo. Devuelve
     * la resolución del análisis. Lanza `ErrorFuente` (`camara-denegada`, `camara-no-disponible`, `camara-error`).
     */
    suspend fun abrir(receptor: (ImagenLuminancia) -> Unit): Resolucion

    fun enfocar(enfoque: Enfoque)

    val tieneFlash: Boolean

    fun linterna(encendida: Boolean)

    /** Desvincula la cámara y deja de entregar imágenes. Puede llamarse desde cualquier hilo; la fuente lo llama una vez por apertura. */
    fun cerrar()
}

/**
 * Fuente de frames de cámara del núcleo (sdk-nativo, NAT-02 y NAT-13), independiente de CameraX:
 * - guarda solo la imagen más reciente (las anteriores se devuelven a la cámara sin leerlas) y copia el plano Y una
 *   única vez, cuando el [io.github.jorgeluissanchez.lectorcedula.Lector] pide el siguiente frame; U y V nunca se leen;
 * - entrega RGBA gris (R = G = B = Y, A = 255), en la orientación del sensor y a resolución completa: las luminancias de
 *   calidad, PDF417 y MRZ de ese RGBA son exactamente Y, sin una segunda copia de la luminancia;
 * - reutiliza el búfer de un frame liberado (ya a cero) y al cerrar suelta los búferes retenidos y devuelve la imagen
 *   pendiente;
 * - al abrir, envía el enfoque continuo al centro de la guía de CAM-08.
 */
class FuenteCamara(private val control: ControlCamara) : FuenteFrames {
    private val cerrojo = Any()
    private var abierta = false

    /** La cámara se abrió (o intentó abrirse) y aún no se cerró: `cerrar` la libera una sola vez. */
    private var camaraAbierta = false
    private var senal: Channel<Unit>? = null
    private var pendiente: ImagenLuminancia? = null
    private var retenido: ByteArray? = null

    override suspend fun abrir() {
        val s = Channel<Unit>(Channel.CONFLATED)
        synchronized(cerrojo) {
            senal?.close()
            senal = s
            abierta = true
            camaraAbierta = true
        }
        val resolucion = try {
            control.abrir { imagen -> recibir(s, imagen) }
        } catch (e: Throwable) {
            cerrar()
            throw e
        }
        val guia = Guia.calcularGuia(resolucion.ancho, resolucion.alto)
        control.enfocar(Enfoque(guia.x + guia.ancho / 2, guia.y + guia.alto / 2, resolucion.ancho, resolucion.alto))
    }

    /** Hilo de la cámara: deja `imagen` como pendiente y devuelve la anterior sin leerla. */
    private fun recibir(s: Channel<Unit>, imagen: ImagenLuminancia) {
        val descartada: ImagenLuminancia?
        synchronized(cerrojo) {
            if (!abierta || senal !== s) {
                descartada = imagen
            } else {
                descartada = pendiente
                pendiente = imagen
            }
        }
        descartada?.cerrar()
        s.trySend(Unit)
    }

    override suspend fun siguiente(): FrameCamara? {
        while (true) {
            val s: Channel<Unit>
            val imagen: ImagenLuminancia?
            synchronized(cerrojo) {
                s = senal?.takeIf { abierta } ?: return null
                imagen = pendiente
                pendiente = null
            }
            if (imagen == null) {
                if (s.receiveCatching().isClosed) return null
                continue
            }
            val frame = try {
                convertir(imagen)
            } finally {
                imagen.cerrar()
            }
            if (frame == null) continue
            if (synchronized(cerrojo) { abierta }) return frame
            frame.liberar()
            return null
        }
    }

    /** Copia el plano Y a RGBA gris; `null` si la imagen no cumple lo que declara. */
    private fun convertir(imagen: ImagenLuminancia): FrameCamara? {
        val ancho = imagen.ancho
        val alto = imagen.alto
        val pasoFila = imagen.pasoFila
        val pasoPixel = imagen.pasoPixel
        if (ancho <= 0 || alto <= 0 || pasoPixel <= 0 || pasoFila < (ancho - 1) * pasoPixel + 1) return null
        val plano = imagen.plano
        val base = plano.position()
        val ultimo = base.toLong() + (alto - 1).toLong() * pasoFila + (ancho - 1).toLong() * pasoPixel
        if (ultimo >= plano.limit()) return null
        val tamano = ancho * alto * 4
        val pixeles = synchronized(cerrojo) { retenido?.takeIf { it.size == tamano }?.also { retenido = null } } ?: ByteArray(tamano)
        val fila = ByteArray((ancho - 1) * pasoPixel + 1)
        val lectura = plano.duplicate()
        var o = 0
        for (y in 0 until alto) {
            lectura.position(base + y * pasoFila)
            lectura.get(fila)
            var x = 0
            while (x < fila.size) {
                val v = fila[x]
                pixeles[o] = v
                pixeles[o + 1] = v
                pixeles[o + 2] = v
                pixeles[o + 3] = OPACO
                o += 4
                x += pasoPixel
            }
        }
        fila.fill(0)
        return FrameCamara(pixeles, ancho, alto, ::retener)
    }

    /** `FrameCamara.liberar` (píxeles ya a cero): guarda el búfer para el siguiente frame si la fuente sigue abierta. */
    private fun retener(frame: FrameCamara) {
        synchronized(cerrojo) {
            if (abierta && retenido == null) retenido = frame.pixeles
        }
    }

    override fun linterna(encendida: Boolean) {
        if (!synchronized(cerrojo) { abierta }) return
        try {
            if (control.tieneFlash) control.linterna(encendida)
        } catch (e: Exception) {
            // Sin linterna disponible no hay error de lectura (NAT-02 "Linterna").
        }
    }

    override fun cerrar() {
        val imagen: ImagenLuminancia?
        val liberarCamara: Boolean
        synchronized(cerrojo) {
            liberarCamara = camaraAbierta
            camaraAbierta = false
            abierta = false
            senal?.close()
            imagen = pendiente
            pendiente = null
            retenido?.fill(0)
            retenido = null
        }
        imagen?.cerrar()
        if (liberarCamara) control.cerrar()
    }

    /** Pruebas (NAT-13): búferes de frames que la fuente retiene para reutilizarlos. */
    internal fun buferesRetenidos(): List<ByteArray> = synchronized(cerrojo) { listOfNotNull(retenido) }

    private companion object {
        const val OPACO: Byte = -1
    }
}
