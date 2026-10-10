package io.github.jorgeluissanchez.lectorcedula.camara

import android.content.Context
import androidx.camera.view.PreviewView
import androidx.compose.runtime.Composable
import androidx.compose.runtime.key
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView

/**
 * Vista previa de la cámara sin decoración (sdk-nativo, NAT-19): una [PreviewView] sin fondo propio, sin guía, texto,
 * botones ni colores. El integrador la posiciona y dimensiona con `modifier` y dibuja encima toda su UI.
 * Compose es `compileOnly` en la librería: lo aporta la app del integrador.
 */
@Composable
fun VistaCamara(fuente: FuenteCamaraX, modifier: Modifier = Modifier) {
    key(fuente) {
        AndroidView(
            factory = { contexto -> crearVistaPrevia(contexto).also(fuente::conectar) },
            modifier = modifier,
            onRelease = fuente::desconectar,
        )
    }
}

/**
 * [PreviewView] sin decoración para integradores con vistas: sin fondo (CameraX la crea negra), escalado `FILL_CENTER`
 * y `COMPATIBLE` (TextureView), que respeta el orden de dibujo de las vistas que el integrador ponga encima.
 * Se conecta con [FuenteCamaraX.conectar].
 */
fun crearVistaPrevia(contexto: Context): PreviewView = PreviewView(contexto).apply {
    background = null
    scaleType = PreviewView.ScaleType.FILL_CENTER
    implementationMode = PreviewView.ImplementationMode.COMPATIBLE
}
