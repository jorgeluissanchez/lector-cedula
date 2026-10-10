package io.github.jorgeluissanchez.lectorcedula.calidad

import java.io.File
import java.io.RandomAccessFile
import kotlin.math.PI
import kotlin.math.exp
import kotlin.math.sqrt

/**
 * fixture-sintetico: vídeos `.y4m` de `e2e/videos/sinteticos` (generados con `npm run e2e:videos`, sin datos reales).
 * Conversión del frame 0 a RGBA con BT.601 entero de rango limitado; `CT` (Vitest) hace exactamente la misma.
 */
object Fixtures {
    val DIR = File("../../../e2e/videos/sinteticos")

    fun disponibles(): Boolean = File(DIR, "amarilla-1080p.y4m").isFile

    fun nombres(): List<String> = DIR.listFiles { f -> f.name.endsWith(".y4m") }.orEmpty().map { it.name.removeSuffix(".y4m") }.sorted()

    class Rgba(val pixeles: ByteArray, val ancho: Int, val alto: Int)

    private fun clamp(v: Int) = if (v < 0) 0 else if (v > 255) 255 else v

    /** Frame `indice` del vídeo en RGBA. */
    fun frame(nombre: String, indice: Int = 0): Rgba {
        RandomAccessFile(File(DIR, "$nombre.y4m"), "r").use { f ->
            val cabecera = StringBuilder()
            while (true) {
                val c = f.read()
                if (c == '\n'.code) break
                cabecera.append(c.toChar())
            }
            val campos = cabecera.split(" ")
            val w = campos.first { it.startsWith("W") }.drop(1).toInt()
            val h = campos.first { it.startsWith("H") }.drop(1).toInt()
            val tamFrame = w * h + 2 * ((w / 2) * (h / 2))
            var i = 0
            while (true) {
                while (f.read() != '\n'.code) Unit
                if (i == indice) break
                f.seek(f.filePointer + tamFrame)
                i++
            }
            val datos = ByteArray(tamFrame)
            f.readFully(datos)
            val cw = w / 2
            val u0 = w * h
            val v0 = u0 + cw * (h / 2)
            val rgba = ByteArray(w * h * 4)
            for (y in 0 until h) {
                for (x in 0 until w) {
                    val c = (datos[y * w + x].toInt() and 0xFF) - 16
                    val d = (datos[u0 + (y / 2) * cw + x / 2].toInt() and 0xFF) - 128
                    val e = (datos[v0 + (y / 2) * cw + x / 2].toInt() and 0xFF) - 128
                    val o = (y * w + x) * 4
                    rgba[o] = clamp((298 * c + 409 * e + 128) shr 8).toByte()
                    rgba[o + 1] = clamp((298 * c - 100 * d - 208 * e + 128) shr 8).toByte()
                    rgba[o + 2] = clamp((298 * c + 516 * d + 128) shr 8).toByte()
                    rgba[o + 3] = 255.toByte()
                }
            }
            return Rgba(rgba, w, h)
        }
    }

    /** Brillo multiplicado por `factor` (RGB, recortado a 0..255). */
    fun brillo(f: Rgba, factor: Double): Rgba {
        val p = f.pixeles.copyOf()
        for (i in p.indices) if (i % 4 != 3) p[i] = clamp(Math.round((p[i].toInt() and 0xFF) * factor).toInt()).toByte()
        return Rgba(p, f.ancho, f.alto)
    }

    /** Disco blanco (luminancia 255) centrado en la guía que cubre `fraccion` del área de la guía. */
    fun disco(f: Rgba, fraccion: Double): Rgba {
        val g = Guia.calcularGuia(f.ancho, f.alto)
        val r = sqrt(fraccion * g.ancho * g.alto / PI)
        val cx = g.x + g.ancho / 2
        val cy = g.y + g.alto / 2
        val p = f.pixeles.copyOf()
        for (y in 0 until f.alto) for (x in 0 until f.ancho) {
            val dx = x + 0.5 - cx
            val dy = y + 0.5 - cy
            if (dx * dx + dy * dy <= r * r) for (k in 0 until 3) p[(y * f.ancho + x) * 4 + k] = 255.toByte()
        }
        return Rgba(p, f.ancho, f.alto)
    }

    /** Desenfoque gaussiano separable de desviación `sigma` (bordes replicados). */
    fun desenfoque(f: Rgba, sigma: Double): Rgba {
        val radio = Math.ceil(3 * sigma).toInt()
        val k = DoubleArray(2 * radio + 1) { exp(-((it - radio) * (it - radio)) / (2 * sigma * sigma)) }
        val s = k.sum()
        for (i in k.indices) k[i] /= s
        val w = f.ancho
        val h = f.alto
        val tmp = DoubleArray(w * h * 4)
        for (y in 0 until h) for (x in 0 until w) for (c in 0 until 4) {
            var a = 0.0
            for (j in -radio..radio) a += k[j + radio] * (f.pixeles[(y * w + (x + j).coerceIn(0, w - 1)) * 4 + c].toInt() and 0xFF)
            tmp[(y * w + x) * 4 + c] = a
        }
        val p = ByteArray(w * h * 4)
        for (y in 0 until h) for (x in 0 until w) for (c in 0 until 4) {
            var a = 0.0
            for (j in -radio..radio) a += k[j + radio] * tmp[((y + j).coerceIn(0, h - 1) * w + x) * 4 + c]
            p[(y * w + x) * 4 + c] = clamp(Math.round(a).toInt()).toByte()
        }
        return Rgba(p, w, h)
    }

    /** Rotación de `grados` alrededor del centro (vecino más cercano, fondo negro). */
    fun rotar(f: Rgba, grados: Double): Rgba {
        val a = Math.toRadians(grados)
        val cos = Math.cos(a)
        val sin = Math.sin(a)
        val cx = f.ancho / 2.0
        val cy = f.alto / 2.0
        val p = ByteArray(f.pixeles.size)
        for (y in 0 until f.alto) for (x in 0 until f.ancho) {
            val dx = x + 0.5 - cx
            val dy = y + 0.5 - cy
            val xs = Math.floor(cos * dx + sin * dy + cx).toInt()
            val ys = Math.floor(-sin * dx + cos * dy + cy).toInt()
            val o = (y * f.ancho + x) * 4
            if (xs in 0 until f.ancho && ys in 0 until f.alto) System.arraycopy(f.pixeles, (ys * f.ancho + xs) * 4, p, o, 4) else p[o + 3] = 255.toByte()
        }
        return Rgba(p, f.ancho, f.alto)
    }

    /** Recompresión JPEG con `calidad` (0..1) con javax.imageio. */
    fun jpeg(f: Rgba, calidad: Float): Rgba {
        val img = java.awt.image.BufferedImage(f.ancho, f.alto, java.awt.image.BufferedImage.TYPE_INT_RGB)
        for (y in 0 until f.alto) for (x in 0 until f.ancho) {
            val o = (y * f.ancho + x) * 4
            img.setRGB(x, y, ((f.pixeles[o].toInt() and 0xFF) shl 16) or ((f.pixeles[o + 1].toInt() and 0xFF) shl 8) or (f.pixeles[o + 2].toInt() and 0xFF))
        }
        val escritor = javax.imageio.ImageIO.getImageWritersByFormatName("jpeg").next()
        val param = escritor.defaultWriteParam
        param.compressionMode = javax.imageio.ImageWriteParam.MODE_EXPLICIT
        param.compressionQuality = calidad
        val bytes = java.io.ByteArrayOutputStream()
        javax.imageio.ImageIO.createImageOutputStream(bytes).use { s ->
            escritor.output = s
            escritor.write(null, javax.imageio.IIOImage(img, null, null), param)
        }
        escritor.dispose()
        val leida = javax.imageio.ImageIO.read(java.io.ByteArrayInputStream(bytes.toByteArray()))
        val p = ByteArray(f.pixeles.size)
        for (y in 0 until f.alto) for (x in 0 until f.ancho) {
            val rgb = leida.getRGB(x, y)
            val o = (y * f.ancho + x) * 4
            p[o] = (rgb shr 16).toByte()
            p[o + 1] = (rgb shr 8).toByte()
            p[o + 2] = rgb.toByte()
            p[o + 3] = 255.toByte()
        }
        return Rgba(p, f.ancho, f.alto)
    }
}
