package io.github.jorgeluissanchez.lectorcedula.camara

import android.util.Log
import androidx.test.ext.junit.runners.AndroidJUnit4
import io.github.jorgeluissanchez.lectorcedula.EstadoLector
import io.github.jorgeluissanchez.lectorcedula.Lector
import io.github.jorgeluissanchez.lectorcedula.motor.MotorJs
import io.github.jorgeluissanchez.lectorcedula.pdf417.DecodificadorPdf417
import io.github.jorgeluissanchez.lectorcedula.pdf417.Imagenes
import io.github.jorgeluissanchez.lectorcedula.pdf417.LectorCodigosZxing
import io.github.jorgeluissanchez.lectorcedula.pdf417.Luminancia
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.nio.ByteBuffer
import java.util.concurrent.atomic.AtomicInteger

/**
 * Cámara sintética que reproduce el frame 0 de `amarilla-1080p` (e2e/videos, fixture-sintetico: PERSONA_BASE, NUIP
 * 9999123456) como lo entrega CameraX: plano Y con relleno de fila, desde su propio hilo y a ~30 fps. Recorre el mismo
 * camino que la cámara real (FuenteCamara, calidad, zxing-cpp real y el bundle) hasta `resultado` (`KI`).
 */
private class CamaraSintetica(private val luma: ByteArray, private val ancho: Int, private val alto: Int) : ControlCamara {
    val entregadas = AtomicInteger()
    val cerradas = AtomicInteger()

    @Volatile
    private var activa = false
    private var hilo: Thread? = null
    override val tieneFlash = false

    override suspend fun abrir(receptor: (ImagenLuminancia) -> Unit): Resolucion {
        activa = true
        hilo = Thread {
            while (activa) {
                entregadas.incrementAndGet()
                receptor(imagen())
                // Cadencia de una cámara a 30 fps (simulación del productor, no una espera de la prueba).
                Thread.sleep(33)
            }
        }.also { it.start() }
        return Resolucion(ancho, alto)
    }

    private fun imagen(): ImagenLuminancia {
        val paso = ancho + RELLENO
        val datos = ByteBuffer.allocate(paso * alto)
        for (y in 0 until alto) {
            datos.position(y * paso)
            datos.put(luma, y * ancho, ancho)
        }
        datos.position(0)
        return object : ImagenLuminancia {
            private var cerrada = false
            override val ancho = this@CamaraSintetica.ancho
            override val alto = this@CamaraSintetica.alto
            override val plano: ByteBuffer = datos
            override val pasoFila = paso
            override val pasoPixel = 1

            override fun cerrar() {
                if (cerrada) return
                cerrada = true
                datos.array().fill(0)
                cerradas.incrementAndGet()
            }
        }
    }

    override fun enfocar(enfoque: Enfoque) = Unit

    override fun linterna(encendida: Boolean) = Unit

    override fun cerrar() {
        activa = false
    }

    fun esperarHilo() = hilo?.join(10_000)

    private companion object {
        const val RELLENO = 64
    }
}

@RunWith(AndroidJUnit4::class)
class FuenteSinteticaNat13Test {
    @Test
    fun nat13LecturaDesdeLaFuenteDeCamaraSinDatosEnLogcat() {
        val rgba = Imagenes.asset("amarilla-1080p.rgba")
        val luma = Luminancia.deRgba(rgba, 1920, 1080)
        rgba.fill(0)
        val camara = CamaraSintetica(luma, 1920, 1080)
        Ayudas.limpiarLogcat()
        Log.i(ETIQUETA, MARCADOR)
        MotorJs.desdeRecurso().use { motor ->
            val l = Lector(motor, decodificador = DecodificadorPdf417(LectorCodigosZxing()), fechaReferencia = { "2026-10-09" })
            runBlocking { withTimeout(120_000) { l.iniciar(FuenteCamara(camara)) } }
            assertEquals(EstadoLector.Fase.RESULTADO, l.estado.value.fase)
            assertEquals("9999123456", l.estado.value.resultado!!.campos["nuip"])
        }
        camara.esperarHilo()
        luma.fill(0)
        // NAT-13: cada imagen de la cámara volvió a ella (y quedó a cero en este doble).
        assertEquals(camara.entregadas.get(), camara.cerradas.get())
        val volcado = Ayudas.volcarLogcat()
        assertTrue("logcat sin el marcador: la captura no sirve", volcado.contains(MARCADOR))
        assertFalse("logcat contiene el NUIP", volcado.contains("9999123456"))
        assertFalse("logcat contiene un apellido", volcado.contains("PRUEBA"))
    }

    private companion object {
        const val ETIQUETA = "NAT13"
        const val MARCADOR = "nat13-marcador-de-captura"
    }
}
