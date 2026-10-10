package io.github.jorgeluissanchez.lectorcedula.camara

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Handler
import android.os.Looper
import android.util.Size
import androidx.camera.core.Camera
import androidx.camera.core.CameraControl
import androidx.camera.core.CameraSelector
import androidx.camera.core.FocusMeteringAction
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.core.SurfaceOrientedMeteringPointFactory
import androidx.camera.core.UseCase
import androidx.camera.core.resolutionselector.AspectRatioStrategy
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.lifecycle.awaitInstance
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import io.github.jorgeluissanchez.lectorcedula.ErrorFuente
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.nio.ByteBuffer
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Cámara trasera con CameraX (sdk-nativo, NAT-02): `Preview` para la [PreviewView] del integrador e `ImageAnalysis`
 * YUV_420_888 con `STRATEGY_KEEP_ONLY_LATEST` a 1920x1080 o la más cercana por encima (16:9). Solo expone el plano Y de
 * cada `ImageProxy`, que [FuenteCamara] copia una vez y devuelve al instante. Se vincula al `LifecycleOwner` del
 * integrador y se desvincula en [cerrar] (también si ese ciclo se destruye). No guarda imágenes, no escribe en disco ni
 * en logs (NAT-13).
 *
 * `envolverControl` existe para las instrumentadas (`KI`): envuelve el `CameraControl` real para registrar
 * `enableTorch` y `startFocusAndMetering` sin sustituirlo.
 */
class CamaraX internal constructor(
    contexto: Context,
    private val ciclo: LifecycleOwner,
    private val envolverControl: (CameraControl) -> CameraControl,
) : ControlCamara {
    constructor(contexto: Context, ciclo: LifecycleOwner) : this(contexto, ciclo, { it })

    private val contexto: Context = contexto.applicationContext
    private val principal = Handler(Looper.getMainLooper())

    // Estado del hilo principal (CameraX vincula y desvincula en él); `control` e `info` se leen desde cualquier hilo.
    private var proveedor: ProcessCameraProvider? = null
    private var casos: List<UseCase> = emptyList()
    private var previa: Preview? = null
    private var vista: PreviewView? = null
    private var ejecutor: ExecutorService? = null

    @Volatile
    private var control: CameraControl? = null

    @Volatile
    private var camara: Camera? = null

    /** Pruebas (`KI`): los casos de uso de la última apertura, para comprobar que quedaron desvinculados. */
    @Volatile
    internal var ultimosCasos: List<UseCase> = emptyList()
        private set

    override suspend fun abrir(receptor: (ImagenLuminancia) -> Unit): Resolucion {
        if (ContextCompat.checkSelfPermission(contexto, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            throw ErrorFuente("camara-denegada")
        }
        val p = try {
            ProcessCameraProvider.awaitInstance(contexto)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            throw ErrorFuente("camara-no-disponible")
        }
        return withContext(Dispatchers.Main.immediate) { vincular(p, receptor) }
    }

    private fun vincular(p: ProcessCameraProvider, receptor: (ImagenLuminancia) -> Unit): Resolucion {
        val trasera = try {
            p.hasCamera(CameraSelector.DEFAULT_BACK_CAMERA)
        } catch (e: Exception) {
            false
        }
        if (!trasera) throw ErrorFuente("camara-no-disponible")
        if (ciclo.lifecycle.currentState == Lifecycle.State.DESTROYED) throw ErrorFuente("camara-error")
        desvincular()
        val seleccion = ResolutionSelector.Builder()
            .setAspectRatioStrategy(AspectRatioStrategy.RATIO_16_9_FALLBACK_AUTO_STRATEGY)
            .setResolutionStrategy(ResolutionStrategy(RESOLUCION_MINIMA, ResolutionStrategy.FALLBACK_RULE_CLOSEST_HIGHER_THEN_LOWER))
            .build()
        val hilo = Executors.newSingleThreadExecutor()
        val analisis = ImageAnalysis.Builder()
            .setResolutionSelector(seleccion)
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
            .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_YUV_420_888)
            .build()
        analisis.setAnalyzer(hilo) { proxy -> receptor(PlanoY(proxy)) }
        val vistaPrevia = Preview.Builder().setResolutionSelector(seleccion).build()
        vista?.let { vistaPrevia.setSurfaceProvider(it.surfaceProvider) }
        val vinculada = try {
            p.bindToLifecycle(ciclo, CameraSelector.DEFAULT_BACK_CAMERA, vistaPrevia, analisis)
        } catch (e: Exception) {
            analisis.clearAnalyzer()
            hilo.shutdown()
            throw ErrorFuente("camara-error")
        }
        proveedor = p
        casos = listOf(vistaPrevia, analisis)
        ultimosCasos = casos
        previa = vistaPrevia
        ejecutor = hilo
        camara = vinculada
        control = envolverControl(vinculada.cameraControl)
        ciclo.lifecycle.addObserver(observador)
        val r = analisis.resolutionInfo?.resolution ?: RESOLUCION_MINIMA
        return Resolucion(r.width, r.height)
    }

    /** Si el ciclo del integrador se destruye, CameraX desvincula los casos; aquí se sueltan el hilo y la vista. */
    private val observador = object : androidx.lifecycle.DefaultLifecycleObserver {
        override fun onDestroy(owner: LifecycleOwner) = desvincular()
    }

    /**
     * Enfoque y medición en el centro de la guía, sin cancelación automática (NAT-02). Solo AE y AWB: con `FLAG_AF`,
     * CameraX pasa el autoenfoque a `AUTO` (un barrido y bloqueo) y, sin cancelación automática, la cámara quedaría
     * enfocada a la primera distancia; sin él, el autoenfoque sigue en `CONTINUOUS_PICTURE`.
     */
    override fun enfocar(enfoque: Enfoque) {
        val c = control ?: return
        val punto = SurfaceOrientedMeteringPointFactory(enfoque.ancho.toFloat(), enfoque.alto.toFloat())
            .createPoint(enfoque.x.toFloat(), enfoque.y.toFloat())
        c.startFocusAndMetering(accionEnfoque(punto))
    }

    override val tieneFlash: Boolean
        get() = camara?.cameraInfo?.hasFlashUnit() == true

    override fun linterna(encendida: Boolean) {
        control?.enableTorch(encendida)
    }

    /** Conecta la vista previa del integrador (hilo principal). Solo una a la vez; la anterior queda sin imagen. */
    fun conectar(nueva: PreviewView) {
        vista = nueva
        previa?.setSurfaceProvider(nueva.surfaceProvider)
    }

    /** Desconecta `anterior` si es la vista conectada (hilo principal). */
    fun desconectar(anterior: PreviewView) {
        if (vista !== anterior) return
        vista = null
        previa?.setSurfaceProvider(null)
    }

    override fun cerrar() {
        if (Looper.myLooper() == Looper.getMainLooper()) desvincular() else principal.post { desvincular() }
    }

    private fun desvincular() {
        val c = casos
        casos = emptyList()
        control = null
        camara = null
        if (c.isNotEmpty()) proveedor?.unbind(*c.toTypedArray())
        c.filterIsInstance<ImageAnalysis>().forEach { it.clearAnalyzer() }
        previa?.setSurfaceProvider(null)
        previa = null
        ejecutor?.shutdown()
        ejecutor = null
        ciclo.lifecycle.removeObserver(observador)
    }

    /** Plano Y del `ImageProxy`; cerrarlo devuelve la imagen a CameraX una sola vez. */
    private class PlanoY(private val proxy: ImageProxy) : ImagenLuminancia {
        private val y = proxy.planes[0]
        private val cerrada = AtomicBoolean(false)
        override val ancho: Int = proxy.width
        override val alto: Int = proxy.height
        override val plano: ByteBuffer get() = y.buffer
        override val pasoFila: Int = y.rowStride
        override val pasoPixel: Int = y.pixelStride

        override fun cerrar() {
            if (cerrada.compareAndSet(false, true)) proxy.close()
        }
    }

    internal companion object {
        val RESOLUCION_MINIMA = Size(1920, 1080)

        /** Acción de NAT-02: medición AE y AWB en `punto`, sin cancelación automática y sin barrido de AF. */
        fun accionEnfoque(punto: androidx.camera.core.MeteringPoint): FocusMeteringAction =
            FocusMeteringAction.Builder(punto, FocusMeteringAction.FLAG_AE or FocusMeteringAction.FLAG_AWB)
                .disableAutoCancel()
                .build()
    }
}
