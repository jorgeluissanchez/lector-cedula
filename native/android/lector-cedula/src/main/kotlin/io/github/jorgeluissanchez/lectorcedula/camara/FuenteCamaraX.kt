package io.github.jorgeluissanchez.lectorcedula.camara

import android.content.Context
import androidx.annotation.MainThread
import androidx.camera.view.PreviewView
import androidx.lifecycle.LifecycleOwner
import io.github.jorgeluissanchez.lectorcedula.FuenteFrames

/**
 * Fuente de frames de la cámara trasera con CameraX para el `Lector` (sdk-nativo, NAT-02, NAT-13 y NAT-19). Headless:
 * no dibuja nada; el integrador pone la vista previa donde quiera con [VistaCamara] (Compose) o con [crearVistaPrevia] y
 * [conectar] (vistas). Uso: `lector.iniciar(FuenteCamaraX(contexto, ciclo))`; `lector.cancelar()`, `lector.destruir()`,
 * el paso a `error` o la cancelación de la corrutina de `iniciar` liberan la cámara.
 */
class FuenteCamaraX internal constructor(internal val camara: CamaraX, private val nucleo: FuenteCamara) : FuenteFrames by nucleo {
    internal constructor(camara: CamaraX) : this(camara, FuenteCamara(camara))

    /** Cámara trasera vinculada al ciclo de vida `ciclo` (actividad, fragmento o `LocalLifecycleOwner` de Compose). */
    constructor(contexto: Context, ciclo: LifecycleOwner) : this(CamaraX(contexto, ciclo))

    /** Muestra la vista previa en `vista` (hilo principal). Una sola vista a la vez. */
    @MainThread
    fun conectar(vista: PreviewView) = camara.conectar(vista)

    /** Deja de mostrar la vista previa en `vista` si era la conectada (hilo principal). */
    @MainThread
    fun desconectar(vista: PreviewView) = camara.desconectar(vista)
}
