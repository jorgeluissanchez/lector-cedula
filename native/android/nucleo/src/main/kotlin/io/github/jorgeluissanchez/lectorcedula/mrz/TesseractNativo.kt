package io.github.jorgeluissanchez.lectorcedula.mrz

import java.io.Closeable
import java.security.MessageDigest

/**
 * Modelo `mrz.traineddata` (BSD-3-Clause) empaquetado como recurso `lectorcedula/mrz.traineddata`: el mismo de la web
 * (`models/manifest.json`, NAT-06 "Mismo modelo"). Se verifica su SHA-256 antes de entregarlo a Tesseract.
 */
object ModeloMrz {
    const val RECURSO = "lectorcedula/mrz.traineddata"

    /** SHA-256 de `tesseract-mrz` en `models/manifest.json` (una prueba exige que coincidan). */
    const val SHA256 = "e44f5b7a6bdd3f382ef3bfa84ee0057f5897946a84a094c26910e0a124f3a9bd"

    fun sha256(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }

    /** `bytes` si su SHA-256 es [SHA256]; si no, `null` (el lector no arranca: `modelo-no-disponible`). */
    fun verificar(bytes: ByteArray): ByteArray? = if (sha256(bytes) == SHA256) bytes else null

    /** El modelo empaquetado y verificado, o `null` si falta o no coincide. */
    fun cargar(cargador: ClassLoader = ModeloMrz::class.java.classLoader): ByteArray? =
        cargador.getResourceAsStream(RECURSO)?.use { it.readBytes() }?.let(::verificar)
}

/**
 * Tesseract 5.5.1 nativo (Apache-2.0) con Leptonica 1.85.0 (BSD-2-Clause) compilado sin libjpeg ni libpng
 * (`native/android/tesseract4android`, JNI propio `lectorcedula_ocr`). El modelo se carga desde memoria (sin escribir
 * en disco, NAT-13) y cada vista entra como píxeles RGBA (`SetImage` de 4 bytes por píxel), nunca como archivo. Mismos
 * parámetros que la web (LMI-02): `mrz`, LSTM, lista blanca `A-Z0-9<` y segmentación 6. La biblioteca la carga el
 * llamador (`System.loadLibrary` en Android, `System.load` en las pruebas JVM). Un objeto por hilo; [close] libera.
 */
class TesseractNativo private constructor(private var api: Long) : MotorOcr, Closeable {
    @Synchronized
    override fun reconocer(vista: ImagenRgba): String {
        check(api != 0L) { "tesseract-cerrado" }
        return nativoReconocer(api, vista.datos, vista.ancho, vista.alto) ?: ""
    }

    @Synchronized
    override fun close() {
        if (api != 0L) nativoDestruir(api)
        api = 0L
    }

    companion object {
        const val BIBLIOTECA = "lectorcedula_ocr"
        const val IDIOMA = "mrz"
        const val LISTA_BLANCA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<"
        const val SEGMENTACION = "6"

        /** Crea el motor con el modelo verificado; `null` si el modelo no pasa [ModeloMrz.verificar] o Tesseract falla. */
        fun crear(modelo: ByteArray): TesseractNativo? {
            val verificado = ModeloMrz.verificar(modelo) ?: return null
            val api = nativoCrear(verificado, IDIOMA, LISTA_BLANCA, SEGMENTACION)
            return if (api == 0L) null else TesseractNativo(api)
        }

        @JvmStatic
        private external fun nativoCrear(modelo: ByteArray, idioma: String, listaBlanca: String, segmentacion: String): Long

        @JvmStatic
        private external fun nativoReconocer(api: Long, rgba: ByteArray, ancho: Int, alto: Int): String?

        @JvmStatic
        private external fun nativoDestruir(api: Long)
    }
}
