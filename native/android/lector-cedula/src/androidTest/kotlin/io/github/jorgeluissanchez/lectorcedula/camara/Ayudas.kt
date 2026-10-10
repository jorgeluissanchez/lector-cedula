package io.github.jorgeluissanchez.lectorcedula.camara

import android.Manifest
import androidx.activity.ComponentActivity
import androidx.camera.core.CameraControl
import androidx.camera.core.FocusMeteringAction
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.LifecycleRegistry
import androidx.test.platform.app.InstrumentationRegistry
import io.github.jorgeluissanchez.lectorcedula.EstadoLector
import io.github.jorgeluissanchez.lectorcedula.Lector
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withTimeout
import java.util.Collections

/** Actividad vacía del APK de pruebas para montar `VistaCamara` (NAT-19). */
class ActividadPrueba : ComponentActivity()

/** Ciclo de vida propio, en `RESUMED` mientras dura la prueba (crear y destruir en el hilo principal). */
class CicloPrueba : LifecycleOwner {
    private val registro = LifecycleRegistry(this).also { it.currentState = Lifecycle.State.RESUMED }
    override val lifecycle: Lifecycle get() = registro

    fun destruir() {
        registro.currentState = Lifecycle.State.DESTROYED
    }
}

/**
 * `CameraControl` real envuelto: registra `enableTorch` y `startFocusAndMetering` (NAT-02 "Linterna" y "Enfoque
 * continuo") y delega todo en el control de CameraX.
 */
class ControlGrabador(private val real: CameraControl) : CameraControl by real {
    val linternas: MutableList<Boolean> = Collections.synchronizedList(mutableListOf())
    val acciones: MutableList<FocusMeteringAction> = Collections.synchronizedList(mutableListOf())

    override fun enableTorch(torch: Boolean) = real.enableTorch(torch).also { linternas += torch }

    override fun startFocusAndMetering(action: FocusMeteringAction) = real.startFocusAndMetering(action).also { acciones += action }
}

object Ayudas {
    private val instrumentacion get() = InstrumentationRegistry.getInstrumentation()

    fun concederCamara() {
        instrumentacion.uiAutomation.grantRuntimePermission(instrumentacion.targetContext.packageName, Manifest.permission.CAMERA)
    }

    fun <T> enPrincipal(bloque: () -> T): T {
        var r: Result<T>? = null
        instrumentacion.runOnMainSync { r = runCatching(bloque) }
        return r!!.getOrThrow()
    }

    /** Espera a que el hilo principal procese lo pendiente (CameraX desvincula en él). */
    fun esperarPrincipal() = instrumentacion.waitForIdleSync()

    suspend fun esperarFase(l: Lector, fase: EstadoLector.Fase, ms: Long = 30_000) {
        withTimeout(ms) { l.estado.first { it.fase == fase } }
    }

    fun limpiarLogcat() {
        Runtime.getRuntime().exec(arrayOf("logcat", "-c")).waitFor()
    }

    fun volcarLogcat(): String =
        Runtime.getRuntime().exec(arrayOf("logcat", "-d", "-v", "raw")).inputStream.bufferedReader().use { it.readText() }
}
