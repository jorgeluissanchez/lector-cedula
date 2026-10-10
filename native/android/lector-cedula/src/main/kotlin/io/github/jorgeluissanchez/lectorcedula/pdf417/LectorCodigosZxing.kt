package io.github.jorgeluissanchez.lectorcedula.pdf417

import android.graphics.Bitmap
import java.nio.ByteBuffer
import zxingcpp.BarcodeReader

/**
 * Binding de zxing-cpp para Android (sdk-nativo, NAT-05; wrapper oficial `io.github.zxing-cpp:android` 3.1.1,
 * Apache-2.0). Configurado solo con `PDF_417` (principio V: el QR de la digital nunca se decodifica) y con los valores de
 * [OpcionesPdf417]. La luminancia viaja en un `Bitmap` `ALPHA_8` (formato `Lum` del wrapper) que se borra y recicla al
 * terminar; nada se escribe en disco ni en logs (NAT-13).
 */
class LectorCodigosZxing internal constructor(private val lector: BarcodeReader) : LectorCodigosNativo {
    constructor() : this(BarcodeReader(opciones()))

    override val formatos: List<String>
        get() = lector.options.formats.map(::nombre).sorted()

    override fun leer(luma: ByteArray, ancho: Int, alto: Int): List<CodigoLeido> {
        require(ancho > 0 && alto > 0 && luma.size >= ancho * alto) { "luma-invalida" }
        val bitmap = Bitmap.createBitmap(ancho, alto, Bitmap.Config.ALPHA_8)
        val paso = bitmap.rowBytes
        val datos = if (paso == ancho) luma else ByteArray(paso * alto).also { d -> for (y in 0 until alto) System.arraycopy(luma, y * ancho, d, y * paso, ancho) }
        try {
            bitmap.copyPixelsFromBuffer(ByteBuffer.wrap(datos, 0, paso * alto))
            return lector.read(bitmap).map { CodigoLeido(nombre(it.format), it.bytes, it.error == null) }
        } finally {
            bitmap.eraseColor(0)
            bitmap.recycle()
            if (datos !== luma) datos.fill(0)
        }
    }

    companion object {
        /** Opciones del wrapper: un único formato, `PDF_417`. */
        fun opciones(): BarcodeReader.Options = BarcodeReader.Options(
            formats = setOf(BarcodeReader.Format.PDF_417),
            tryHarder = OpcionesPdf417.TRY_HARDER,
            tryRotate = OpcionesPdf417.TRY_ROTATE,
            tryInvert = OpcionesPdf417.TRY_INVERT,
            tryDownscale = OpcionesPdf417.TRY_DOWNSCALE,
            maxNumberOfSymbols = OpcionesPdf417.MAX_SIMBOLOS,
        )

        /** `PDF_417` del wrapper es `"PDF417"` del núcleo; cualquier otro formato conserva su nombre y se descarta. */
        internal fun nombre(f: BarcodeReader.Format): String = if (f == BarcodeReader.Format.PDF_417) "PDF417" else f.name
    }
}
