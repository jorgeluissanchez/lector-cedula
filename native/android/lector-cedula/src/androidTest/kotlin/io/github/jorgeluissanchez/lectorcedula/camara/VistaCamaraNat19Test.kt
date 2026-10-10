package io.github.jorgeluissanchez.lectorcedula.camara

import android.view.TextureView
import android.view.SurfaceView
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.ImageView
import android.widget.TextView
import androidx.activity.compose.setContent
import androidx.camera.view.PreviewView
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.layout
import androidx.compose.ui.unit.Constraints
import androidx.test.core.app.ActivityScenario
import androidx.test.espresso.Espresso.onView
import androidx.test.espresso.assertion.ViewAssertions.matches
import androidx.test.espresso.matcher.ViewMatchers.isAssignableFrom
import androidx.test.espresso.matcher.ViewMatchers.isDisplayed
import androidx.test.ext.junit.runners.AndroidJUnit4
import io.github.jorgeluissanchez.lectorcedula.EstadoLector
import io.github.jorgeluissanchez.lectorcedula.Lector
import io.github.jorgeluissanchez.lectorcedula.motor.MotorJs
import io.github.jorgeluissanchez.lectorcedula.pdf417.DecodificadorPdf417
import io.github.jorgeluissanchez.lectorcedula.pdf417.LectorCodigosZxing
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * NAT-19 "Android solo con la preview" (`KI`): `VistaCamara` montada con Compose y la cámara real en fase `activo`.
 * La jerarquía bajo el contenido de la actividad tiene exactamente una `PreviewView`, sin fondo, y ninguna `TextView`,
 * `Button`, `ImageView` ni vista visible con fondo propio. Dentro de la `PreviewView` solo están la superficie de la
 * cámara y la `ScreenFlashView` de CameraX (alfa 0: solo se ve durante el flash de pantalla de la cámara frontal).
 */
@RunWith(AndroidJUnit4::class)
class VistaCamaraNat19Test {
    /** Ocupa todo el espacio disponible sin depender de `foundation` (que la librería no usa). */
    private fun Modifier.llenar() = layout { medible, restricciones ->
        val p = medible.measure(Constraints.fixed(restricciones.maxWidth, restricciones.maxHeight))
        layout(p.width, p.height) { p.place(0, 0) }
    }

    private fun recorrer(v: View, visitar: (View) -> Unit) {
        visitar(v)
        if (v is ViewGroup) for (i in 0 until v.childCount) recorrer(v.getChildAt(i), visitar)
    }

    @Test
    fun nat19AndroidSoloConLaPreview() {
        Ayudas.concederCamara()
        val ambito = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        MotorJs.desdeRecurso().use { motor ->
            ActivityScenario.launch(ActividadPrueba::class.java).use { escenario ->
                lateinit var fuente: FuenteCamaraX
                val l = Lector(motor, decodificador = DecodificadorPdf417(LectorCodigosZxing()), analizar = { null })
                escenario.onActivity { actividad ->
                    fuente = FuenteCamaraX(actividad, actividad)
                    actividad.setContent { VistaCamara(fuente, Modifier.llenar()) }
                }
                ambito.launch { l.iniciar(fuente) }
                runBlocking { Ayudas.esperarFase(l, EstadoLector.Fase.ACTIVO) }

                onView(isAssignableFrom(PreviewView::class.java)).check(matches(isDisplayed()))
                escenario.onActivity { actividad ->
                    val raiz = actividad.findViewById<ViewGroup>(android.R.id.content)
                    val previas = mutableListOf<PreviewView>()
                    recorrer(raiz) { if (it is PreviewView) previas += it }
                    assertEquals("exactamente una PreviewView", 1, previas.size)
                    val previa = previas.single()
                    assertNull("la PreviewView no tiene fondo propio", previa.background)
                    val prohibidas = mutableListOf<String>()
                    recorrer(raiz) { v ->
                        if (v is TextView || v is Button || v is ImageView) prohibidas += v.javaClass.name
                        val visible = v.visibility == View.VISIBLE && v.alpha > 0f
                        if (visible && v.background != null && v !is TextureView && v !is SurfaceView) prohibidas += "${v.javaClass.name} con fondo"
                    }
                    assertEquals("vistas prohibidas en la jerarquía", emptyList<String>(), prohibidas)
                    val internas = (0 until previa.childCount).map { previa.getChildAt(it) }
                    assertTrue(
                        "dentro de la PreviewView solo la superficie y la ScreenFlashView (alfa 0): ${internas.map { it.javaClass.name }}",
                        internas.all { it is TextureView || it is SurfaceView || (it.javaClass.simpleName == "ScreenFlashView" && it.alpha == 0f) },
                    )
                    assertTrue("hay superficie de cámara", internas.any { it is TextureView || it is SurfaceView })
                }
                l.cancelar()
            }
        }
        ambito.cancel()
    }
}
