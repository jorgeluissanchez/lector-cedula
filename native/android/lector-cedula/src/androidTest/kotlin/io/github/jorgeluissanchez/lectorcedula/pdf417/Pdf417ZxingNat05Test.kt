package io.github.jorgeluissanchez.lectorcedula.pdf417

import android.util.Log
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import io.github.jorgeluissanchez.lectorcedula.FrameCamara
import io.github.jorgeluissanchez.lectorcedula.Lectura
import io.github.jorgeluissanchez.lectorcedula.motor.MotorJs
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.util.Base64

/**
 * NAT-05 con el binario real de zxing-cpp (wrapper oficial 3.1.1) en el emulador (`KI`). fixture-sintetico: frames 0 de
 * `amarilla-1080p` y de `digital-1080p` con un QR sintético sin datos, y los bytes que devuelve `decodificarPdf417Imagen`
 * de `packages/capture` sobre el mismo frame (oráculo de la web), generados en CI por
 * `packages/nucleo-js/scripts/generar-fixtures-pdf417.mjs` en `build/generated/sinteticos` (nunca en el repositorio).
 */
@RunWith(AndroidJUnit4::class)
class Pdf417ZxingNat05Test {
    private val oraculo: JsonObject by lazy { Json.parseToJsonElement(String(Imagenes.asset("oraculo.json"), Charsets.UTF_8)).jsonObject }
    private val ancho by lazy { oraculo["ancho"]!!.jsonPrimitive.int }
    private val alto by lazy { oraculo["alto"]!!.jsonPrimitive.int }

    private fun frame(nombre: String) = FrameCamara(Imagenes.asset("$nombre.rgba"), ancho, alto)

    private val bytesWeb: ByteArray by lazy {
        Base64.getDecoder().decode(oraculo["amarilla"]!!.jsonObject["bytes"]!!.jsonPrimitive.content)
    }

    private fun decodificar(f: FrameCamara): ByteArray? = (DecodificadorPdf417(LectorCodigosZxing()).leer(f, null) as Lectura.Pdf417?)?.bytes

    @Test
    fun nat05AmarillaSintetica() {
        val bytes = decodificar(frame("amarilla-1080p"))
        assertNotNull("zxing-cpp no leyó el PDF417 de amarilla-1080p", bytes)
        assertArrayEquals("bytes distintos de decodificarPdf417Imagen (web)", bytesWeb, bytes)
        MotorJs.desdeRecurso().use { motor ->
            val salida = motor.llamar(
                "procesarPdf417",
                JsonPrimitive(Base64.getEncoder().encodeToString(bytes)),
                JsonObject(mapOf("fechaReferencia" to JsonPrimitive("2026-10-09"))),
            ).jsonObject
            assertEquals(JsonPrimitive(true), salida["ok"])
            assertEquals("9999123456", salida["resultado"]!!.jsonObject["campos"]!!.jsonObject["nuip"]!!.jsonPrimitive.content)
        }
    }

    @Test
    fun nat05QrDeLaDigitalIgnorado() {
        assertEquals(listOf("PDF417"), LectorCodigosZxing().formatos)
        // El generador comprobó con zxing-wasm que la imagen contiene un QR legible (la prueba no es vacía).
        assertEquals(true, oraculo["qr"]!!.jsonObject["qrLegible"]!!.jsonPrimitive.content.toBoolean())
        val binding = LectorCodigosZxing()
        val luma = Luminancia.deRgba(Imagenes.asset("digital-qr-1080p.rgba"), ancho, alto)
        assertEquals(emptyList<CodigoLeido>(), binding.leer(luma, ancho, alto))
        assertNull(decodificar(frame("digital-qr-1080p")))
    }

    @Test
    fun nat05RobustezMetamorfica() {
        val original = frame("amarilla-1080p")
        val transformaciones = mapOf(
            "rotacion+3" to { Imagenes.rotar(original, 3.0) },
            "rotacion-3" to { Imagenes.rotar(original, -3.0) },
            "blur-sigma-1" to { Imagenes.desenfocar(original, 1.0) },
            "brillo+20" to { Imagenes.brillo(original, 1.2) },
            "brillo-20" to { Imagenes.brillo(original, 0.8) },
        )
        val leidas = mutableListOf<String>()
        for ((nombre, transformar) in transformaciones) {
            val bytes = decodificar(transformar()) ?: continue
            assertArrayEquals("$nombre: bytes distintos de los de la imagen original", bytesWeb, bytes)
            leidas += nombre
        }
        Log.i(ETIQUETA, "metamórficas leídas: ${leidas.size}/${transformaciones.size} $leidas")
    }

    @Test
    fun nat05SinDatosEnLogs() {
        Runtime.getRuntime().exec(arrayOf("logcat", "-c")).waitFor()
        Log.i(ETIQUETA, MARCADOR)
        val bytes = decodificar(frame("amarilla-1080p"))
        assertNotNull(bytes)
        MotorJs.desdeRecurso().use { motor ->
            motor.llamar("procesarPdf417", JsonPrimitive(Base64.getEncoder().encodeToString(bytes)), JsonObject(emptyMap()))
        }
        val volcado = Runtime.getRuntime().exec(arrayOf("logcat", "-d", "-v", "raw")).inputStream.bufferedReader().use { it.readText() }
        assertTrue("logcat sin el marcador: la captura no sirve", volcado.contains(MARCADOR))
        assertFalse("logcat contiene el NUIP", volcado.contains("9999123456"))
        assertFalse("logcat contiene un apellido", volcado.contains("PRUEBA"))
    }

    private companion object {
        const val ETIQUETA = "NAT05"
        const val MARCADOR = "nat05-marcador-de-captura"
    }
}

/** Lectura de los fixtures sintéticos y transformaciones metamórficas sobre RGBA (solo pruebas). */
internal object Imagenes {
    fun asset(nombre: String): ByteArray =
        InstrumentationRegistry.getInstrumentation().context.assets.open("sinteticos/pdf417/$nombre").use { it.readBytes() }

    private fun clamp(v: Int) = if (v < 0) 0 else if (v > 255) 255 else v

    fun brillo(f: FrameCamara, factor: Double): FrameCamara {
        val p = f.pixeles.copyOf()
        for (i in p.indices) if (i % 4 != 3) p[i] = clamp(Math.round((p[i].toInt() and 0xFF) * factor).toInt()).toByte()
        return FrameCamara(p, f.ancho, f.alto)
    }

    /** Giro de `grados` alrededor del centro con interpolación bilineal; fuera del frame, el gris del fondo (0x30). */
    fun rotar(f: FrameCamara, grados: Double): FrameCamara {
        val w = f.ancho
        val h = f.alto
        val src = f.pixeles
        val dst = ByteArray(src.size)
        val rad = Math.toRadians(grados)
        val c = Math.cos(rad)
        val s = Math.sin(rad)
        val cx = (w - 1) / 2.0
        val cy = (h - 1) / 2.0
        for (y in 0 until h) for (x in 0 until w) {
            val dx = x - cx
            val dy = y - cy
            val sx = c * dx + s * dy + cx
            val sy = -s * dx + c * dy + cy
            val o = (y * w + x) * 4
            val x0 = Math.floor(sx).toInt()
            val y0 = Math.floor(sy).toInt()
            if (x0 < 0 || y0 < 0 || x0 + 1 >= w || y0 + 1 >= h) {
                dst[o] = 0x30; dst[o + 1] = 0x30; dst[o + 2] = 0x30; dst[o + 3] = 255.toByte()
                continue
            }
            val fx = sx - x0
            val fy = sy - y0
            for (k in 0 until 3) {
                fun v(xx: Int, yy: Int) = src[(yy * w + xx) * 4 + k].toInt() and 0xFF
                val arriba = v(x0, y0) * (1 - fx) + v(x0 + 1, y0) * fx
                val abajo = v(x0, y0 + 1) * (1 - fx) + v(x0 + 1, y0 + 1) * fx
                dst[o + k] = clamp(Math.round(arriba * (1 - fy) + abajo * fy).toInt()).toByte()
            }
            dst[o + 3] = 255.toByte()
        }
        return FrameCamara(dst, w, h)
    }

    /** Desenfoque gaussiano separable de `sigma` (radio 3 sigma), bordes replicados. */
    fun desenfocar(f: FrameCamara, sigma: Double): FrameCamara {
        val w = f.ancho
        val h = f.alto
        val r = Math.ceil(3 * sigma).toInt()
        val nucleo = DoubleArray(2 * r + 1) { i -> Math.exp(-((i - r) * (i - r)) / (2 * sigma * sigma)) }
        val suma = nucleo.sum()
        for (i in nucleo.indices) nucleo[i] /= suma
        val tmp = FloatArray(w * h * 3)
        for (y in 0 until h) for (x in 0 until w) for (k in 0 until 3) {
            var acc = 0.0
            for (i in -r..r) acc += nucleo[i + r] * (f.pixeles[(y * w + (x + i).coerceIn(0, w - 1)) * 4 + k].toInt() and 0xFF)
            tmp[(y * w + x) * 3 + k] = acc.toFloat()
        }
        val dst = ByteArray(f.pixeles.size)
        for (y in 0 until h) for (x in 0 until w) {
            for (k in 0 until 3) {
                var acc = 0.0
                for (i in -r..r) acc += nucleo[i + r] * tmp[((y + i).coerceIn(0, h - 1) * w + x) * 3 + k]
                dst[(y * w + x) * 4 + k] = clamp(Math.round(acc).toInt()).toByte()
            }
            dst[(y * w + x) * 4 + 3] = 255.toByte()
        }
        return FrameCamara(dst, w, h)
    }
}
