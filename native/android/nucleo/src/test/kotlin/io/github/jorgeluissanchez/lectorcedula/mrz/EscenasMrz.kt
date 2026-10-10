package io.github.jorgeluissanchez.lectorcedula.mrz

import java.util.Random
import kotlin.math.roundToInt

/**
 * fixture-sintetico: imágenes MRZ generadas sin caracteres ni datos de personas (filas de barras cortas con la forma de
 * una MRZ, barras inclinadas para el enderezado). Las mismas formas que las pruebas web de `packages/capture/test/mrz`.
 */
object EscenasMrz {
    private fun clamp(v: Int) = if (v < 0) 0 else if (v > 255) 255 else v

    class Lienzo(val w: Int, val h: Int, fondo: Int) {
        val p = ByteArray(w * h * 4).also { a ->
            for (i in 0 until w * h) {
                a[i * 4] = fondo.toByte(); a[i * 4 + 1] = fondo.toByte(); a[i * 4 + 2] = fondo.toByte(); a[i * 4 + 3] = 255.toByte()
            }
        }

        fun pon(x: Int, y: Int, v: Int) {
            if (x !in 0 until w || y !in 0 until h) return
            val o = (y * w + x) * 4
            p[o] = clamp(v).toByte(); p[o + 1] = clamp(v).toByte(); p[o + 2] = clamp(v).toByte()
        }

        fun imagen() = ImagenRgba(p, w, h)
    }

    /** Tarjeta clara con `filas` líneas de `porLinea` barras en la parte baja (la del oráculo de nucleo-js). */
    fun tarjeta(w: Int, h: Int, filas: Int, porLinea: Int, altoLinea: Int? = null): ImagenRgba {
        val c = Lienzo(w, h, 220)
        val alto = altoLinea ?: maxOf(3, Math.round(h / 16.0).toInt())
        val paso = Math.round(alto * 1.8).toInt()
        val y0 = h - Math.round(h / 10.0).toInt() - filas * paso
        for (f in 0 until filas) {
            for (k in 0 until porLinea) {
                val x0 = Math.round(w * 0.05 + k * w * 0.9 / porLinea).toInt()
                val ancho = maxOf(1, Math.round(w * 0.9 / porLinea / 2).toInt())
                for (y in y0 + f * paso until y0 + f * paso + alto) for (x in x0 until x0 + ancho) c.pon(x, y, 30)
            }
        }
        return c.imagen()
    }

    /** Lienzo blanco con 3 barras negras de 2 px inclinadas `grados` (la de `enderezar.test.ts`). */
    fun barras(grados: Double, w: Int = 400, h: Int = 200): ImagenRgba {
        val c = Lienzo(w, h, 255)
        val tan = Math.tan(grados * Math.PI / 180)
        for (y0 in intArrayOf(60, 100, 140)) {
            for (x in 20 until w - 20) {
                val y = PlanMrz.redondearJs(y0 + (x - w / 2.0) * tan).toInt()
                c.pon(x, y, 0); c.pon(x, y + 1, 0)
            }
        }
        return c.imagen()
    }

    /** Tarjeta aleatoria con filas TD1 o TD3, ruido, texto de relleno, inclinación leve y a veces de pie o al revés. */
    fun aleatoria(semilla: Long): ImagenRgba {
        val r = Random(semilla)
        val w = 120 + r.nextInt(100)
        val h = (w / 1.585).roundToInt()
        val claro = 150 + r.nextInt(100)
        val c = Lienzo(w, h, claro)
        for (y in 0 until h) for (x in 0 until w) c.pon(x, y, claro - r.nextInt(10))
        val filas = if (r.nextBoolean()) 3 else 2
        val por = if (filas == 3) 30 else 44
        val hc = maxOf(2, h / (14 + r.nextInt(8)))
        val tan = (r.nextDouble() - 0.5) * 0.06
        val yBase = h - filas * (hc * 17 / 10 + 1) - h / 12
        val paso = maxOf(2, w * 9 / 10 / por)
        for (f in 0 until filas) {
            var x = w / 20
            while (x + paso <= w / 20 + w * 9 / 10) {
                if (r.nextInt(5) != 0) {
                    for (dx in 0 until maxOf(1, paso - 1)) for (dy in 0 until hc) {
                        val xx = x + dx
                        c.pon(xx, yBase + f * (hc * 17 / 10 + 1) + dy + (xx * tan).roundToInt(), r.nextInt(60))
                    }
                }
                x += paso
            }
        }
        if (r.nextInt(3) == 0) for (y in h / 6 until h / 6 + hc) for (x in w / 3 until w / 2) if (r.nextInt(3) == 0) c.pon(x, y, 40)
        val img = c.imagen()
        return when (r.nextInt(4)) {
            0 -> img
            1 -> PlanMrz.girar(img, 90)
            2 -> PlanMrz.girar(img, 180)
            else -> PlanMrz.girar(img, 270)
        }
    }
}
