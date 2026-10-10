package io.github.jorgeluissanchez.lectorcedula.camara

import android.annotation.SuppressLint
import android.util.Log
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import io.github.jorgeluissanchez.lectorcedula.EstadoLector
import io.github.jorgeluissanchez.lectorcedula.FrameCamara
import io.github.jorgeluissanchez.lectorcedula.Lector
import io.github.jorgeluissanchez.lectorcedula.calidad.AnalizadorCalidad
import io.github.jorgeluissanchez.lectorcedula.motor.MotorJs
import io.github.jorgeluissanchez.lectorcedula.pdf417.DecodificadorPdf417
import io.github.jorgeluissanchez.lectorcedula.pdf417.LectorCodigosZxing
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/**
 * NAT-02 con CameraX real en el emulador API 34 (`KI`, cámara trasera virtual del emulador): resolución mínima, enfoque
 * continuo, linterna, liberación (cancelar, destruir, error y cancelación de la corrutina) y ausencia de datos en
 * Logcat mientras el Lector procesa frames de la cámara. No se guarda ninguna imagen.
 */
@RunWith(AndroidJUnit4::class)
class CamaraXNat02Test {
    private val contexto = InstrumentationRegistry.getInstrumentation().targetContext
    private lateinit var ciclo: CicloPrueba
    private lateinit var motor: MotorJs
    private val ambito = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val grabadores = mutableListOf<ControlGrabador>()

    @Before
    fun preparar() {
        Ayudas.concederCamara()
        ciclo = Ayudas.enPrincipal { CicloPrueba() }
        motor = MotorJs.desdeRecurso()
    }

    @After
    fun limpiar() {
        ambito.cancel()
        Ayudas.enPrincipal { ciclo.destruir() }
        motor.close()
    }

    private fun camara() = CamaraX(contexto, ciclo) { real -> ControlGrabador(real).also { grabadores += it } }

    private fun lector(analizar: ((FrameCamara) -> AnalizadorCalidad.Evaluacion?)? = null): Lector {
        val dec = DecodificadorPdf417(LectorCodigosZxing())
        return if (analizar == null) Lector(motor, decodificador = dec) else Lector(motor, decodificador = dec, analizar = analizar)
    }

    /** Lanza `iniciar` con la cámara real y espera la fase `activo`. */
    private fun activo(l: Lector, c: CamaraX): Job = runBlocking {
        val job = ambito.launch { l.iniciar(FuenteCamara(c)) }
        Ayudas.esperarFase(l, EstadoLector.Fase.ACTIVO)
        job
    }

    /** CameraX sin casos de uso vinculados de la última apertura de `c` (NAT-02 "Liberación"). */
    private fun assertLiberada(c: CamaraX) {
        Ayudas.esperarPrincipal()
        val casos = c.ultimosCasos
        assertEquals("la apertura vinculó Preview e ImageAnalysis", 2, casos.size)
        val proveedor = ProcessCameraProvider.getInstance(contexto).get()
        val vinculados = Ayudas.enPrincipal { casos.filter { proveedor.isBound(it) } }
        assertEquals("casos de uso aún vinculados", emptyList<Any>(), vinculados)
    }

    @Test
    fun nat02ResolucionMinima() = runBlocking {
        val fuente = FuenteCamara(camara())
        withTimeout(30_000) { fuente.abrir() }
        val frame = withTimeout(30_000) { fuente.siguiente() }
        assertNotNull("la cámara no entregó ningún frame", frame)
        val (ancho, alto) = frame!!.ancho to frame.alto
        frame.liberar()
        fuente.cerrar()
        Log.i(ETIQUETA, "primer frame de análisis: ${ancho}x$alto")
        assertTrue("primer frame de análisis ${ancho}x$alto, se exige >= 1920x1080", ancho >= 1920 && alto >= 1080)
    }

    @SuppressLint("RestrictedApi")
    @Test
    fun nat02EnfoqueContinuo() {
        val l = lector(analizar = { null })
        val job = activo(l, camara())
        val accion = grabadores.single().acciones.single()
        assertFalse("la acción no debe cancelarse sola", accion.isAutoCancelEnabled)
        assertTrue("sin barrido de AF: el autoenfoque sigue en continuo", accion.meteringPointsAf.isEmpty())
        val punto = accion.meteringPointsAe.single()
        assertEquals(1, accion.meteringPointsAwb.size)
        // Guía de CAM-08 centrada: su centro normalizado es (0,5; 0,5).
        assertEquals(0.5f, punto.x, 1e-3f)
        assertEquals(0.5f, punto.y, 1e-3f)
        l.cancelar()
        runBlocking { job.join() }
    }

    @Test
    fun nat02Linterna() {
        val l = lector(analizar = { null })
        val c = camara()
        val job = activo(l, c)
        l.linterna(true)
        l.linterna(false)
        val linternas = grabadores.single().linternas.toList()
        Log.i(ETIQUETA, "flash: ${c.tieneFlash}, enableTorch: $linternas")
        if (c.tieneFlash) assertEquals(listOf(true, false), linternas) else assertEquals(emptyList<Boolean>(), linternas)
        assertEquals(EstadoLector.Fase.ACTIVO, l.estado.value.fase)
        l.cancelar()
        runBlocking { job.join() }
    }

    @Test
    fun nat02LiberacionAlCancelar() {
        val l = lector(analizar = { null })
        val c = camara()
        val job = activo(l, c)
        l.cancelar()
        assertEquals(EstadoLector.Fase.INICIO, l.estado.value.fase)
        runBlocking { withTimeout(10_000) { job.join() } }
        assertLiberada(c)
    }

    @Test
    fun nat02LiberacionAlCancelarLaCorrutina() {
        val l = lector(analizar = { null })
        val c = camara()
        val job = activo(l, c)
        runBlocking { withTimeout(10_000) { job.cancel(); job.join() } }
        assertEquals(EstadoLector.Fase.INICIO, l.estado.value.fase)
        assertLiberada(c)
    }

    @Test
    fun nat02LiberacionAlDestruirYEnError() {
        val l1 = lector(analizar = { null })
        val c1 = camara()
        val j1 = activo(l1, c1)
        l1.destruir()
        runBlocking { withTimeout(10_000) { j1.join() } }
        assertLiberada(c1)

        val l2 = lector(analizar = { throw IllegalStateException("analizador") })
        val c2 = camara()
        ambito.launch { l2.iniciar(FuenteCamara(c2)) }
        runBlocking { Ayudas.esperarFase(l2, EstadoLector.Fase.ERROR) }
        assertEquals("calidad-error", l2.estado.value.error!!.codigo)
        assertLiberada(c2)
    }

    @Test
    fun nat02ReintentarReabreLaCamara() {
        val l = lector(analizar = { throw IllegalStateException("analizador") })
        val c = camara()
        runBlocking { withTimeout(30_000) { ambito.launch { l.iniciar(FuenteCamara(c)) }.join() } }
        assertEquals(EstadoLector.Fase.ERROR, l.estado.value.fase)
        runBlocking { withTimeout(30_000) { ambito.launch { l.reintentar() }.join() } }
        assertEquals(EstadoLector.Fase.ERROR, l.estado.value.fase)
        assertEquals(2, l.estado.value.intento)
        assertEquals(2, grabadores.size)
        assertLiberada(c)
    }

    @Test
    fun nat13SinDatosEnLogcatConLaCamara() {
        Ayudas.limpiarLogcat()
        Log.i(ETIQUETA, MARCADOR)
        val analizador = AnalizadorCalidad()
        val analizados = java.util.concurrent.CountDownLatch(FRAMES_ANALIZADOS)
        val l = lector(analizar = { f -> analizador.evaluarCompleto(f.pixeles, f.ancho, f.alto).also { analizados.countDown() } })
        val c = camara()
        val job = activo(l, c)
        // El Lector analiza frames reales de la cámara (calidad, presencia y, si toca, zxing-cpp) antes de cancelar.
        assertTrue("el Lector no analizó $FRAMES_ANALIZADOS frames", analizados.await(60, java.util.concurrent.TimeUnit.SECONDS))
        l.cancelar()
        runBlocking { job.join() }
        val volcado = Ayudas.volcarLogcat()
        assertTrue("logcat sin el marcador: la captura no sirve", volcado.contains(MARCADOR))
        assertFalse("logcat contiene el NUIP", volcado.contains("9999123456"))
        assertFalse("logcat contiene un apellido", volcado.contains("PRUEBA"))
    }

    private companion object {
        const val ETIQUETA = "NAT02"
        const val MARCADOR = "nat02-marcador-de-captura"
        const val FRAMES_ANALIZADOS = 10
    }
}
