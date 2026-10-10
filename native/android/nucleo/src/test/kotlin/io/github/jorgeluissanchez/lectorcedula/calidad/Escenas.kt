package io.github.jorgeluissanchez.lectorcedula.calidad

import java.util.Random
import kotlin.math.PI
import kotlin.math.sqrt

/** Escenas sintéticas deterministas por semilla (fixture-sintetico: ninguna imagen real). */
object Escenas {
    private fun clamp(v: Int) = if (v < 0) 0 else if (v > 255) 255 else v

    private class Lienzo(val w: Int, val h: Int) {
        val p = ByteArray(w * h * 4)
        fun pon(x: Int, y: Int, v: Int) {
            if (x !in 0 until w || y !in 0 until h) return
            val o = (y * w + x) * 4
            p[o] = clamp(v).toByte()
            p[o + 1] = clamp(v).toByte()
            p[o + 2] = clamp(v + 10).toByte()
            p[o + 3] = 255.toByte()
        }
        fun rect(x0: Int, y0: Int, an: Int, al: Int, v: Int) {
            for (y in y0 until y0 + al) for (x in x0 until x0 + an) pon(x, y, v)
        }
        fun luma(x: Int, y: Int) = p[(y * w + x) * 4].toInt() and 0xFF
    }

    /** Barras verticales (u horizontales si `traspuestas`) de anchos 1..3 en el bloque. */
    private fun barras(c: Lienzo, r: Random, x0: Int, y0: Int, an: Int, al: Int, oscuro: Int, traspuestas: Boolean) {
        var t = 0
        val largo = if (traspuestas) al else an
        while (t < largo) {
            val grosor = 1 + r.nextInt(3)
            if (r.nextBoolean()) for (k in t until minOf(largo, t + grosor)) {
                if (traspuestas) c.rect(x0, y0 + k, an, 1, oscuro) else c.rect(x0 + k, y0, 1, al, oscuro)
            }
            t += grosor
        }
    }

    /** `filas` líneas de "caracteres" (bloques oscuros) de alto `hc` con separación ~1,7·hc, desde `yBase`. */
    private fun filasTexto(c: Lienzo, r: Random, x0: Int, ancho: Int, yBase: Int, filas: Int, hc: Int, oscuro: Int, caracteres: Int) {
        val paso = maxOf(2, ancho / caracteres)
        for (f in 0 until filas) {
            val y = yBase + f * (hc * 17 / 10 + 1)
            var x = x0
            while (x + paso <= x0 + ancho) {
                if (r.nextInt(5) != 0) c.rect(x, y, maxOf(1, paso - 1), hc - r.nextInt(2), oscuro)
                x += paso
            }
        }
    }

    private fun desenfocar(c: Lienzo, pasadas: Int) {
        repeat(pasadas) {
            val q = c.p.copyOf()
            for (y in 1 until c.h - 1) for (x in 1 until c.w - 1) for (k in 0 until 3) {
                var s = 0
                for (dy in -1..1) for (dx in -1..1) s += q[((y + dy) * c.w + x + dx) * 4 + k].toInt() and 0xFF
                c.p[(y * c.w + x) * 4 + k] = ((s + 4) / 9).toByte()
            }
        }
    }

    fun generar(semilla: Long): FrameAnalisis {
        val r = Random(semilla)
        var w = 40 + r.nextInt(200)
        var h = maxOf(16, (w * (0.45 + r.nextDouble() * 0.35)).toInt())
        val vertical = r.nextInt(4) == 0
        if (vertical) w = h.also { h = w }
        val escala = if (r.nextBoolean()) 1 else 2 + r.nextInt(3)
        val c = Lienzo(w, h)
        val fondo = r.nextInt(256)
        val ruido = r.nextInt(30)
        for (y in 0 until h) for (x in 0 until w) c.pon(x, y, fondo + if (ruido > 0) r.nextInt(2 * ruido + 1) - ruido else 0)
        val g = Guia.calcularGuia(w, h)
        if (r.nextInt(5) != 0) {
            val f = 0.75 + r.nextDouble() * 0.3
            val an = (g.ancho * f).toInt()
            val al = (g.alto * f).toInt()
            val x0 = (w - an) / 2 + r.nextInt(5) - 2
            val y0 = (h - al) / 2 + r.nextInt(5) - 2
            val claro = 120 + r.nextInt(136)
            c.rect(x0, y0, an, al, claro)
            val oscuro = r.nextInt(90)
            when (r.nextInt(5)) {
                1 -> if (vertical) barras(c, r, x0 + an / 8, y0 + al / 10, an * 3 / 4, al / 2, oscuro, true) else barras(c, r, x0 + an / 10, y0 + al / 3, an * 4 / 5, al / 2, oscuro, false)
                2 -> filasTexto(c, r, x0 + an / 20, an * 9 / 10, y0 + al * 2 / 3, 3, maxOf(2, al / 18), oscuro, 30)
                3 -> filasTexto(c, r, x0 + an / 20, an * 9 / 10, y0 + al * 3 / 4, 2, maxOf(2, al / 16), oscuro, 44)
                4 -> filasTexto(c, r, x0 + an / 20, an * 9 / 10, y0 + al / 5, 2 + r.nextInt(5), maxOf(2, al / 14), oscuro, 10 + r.nextInt(30))
                else -> Unit
            }
        }
        if (r.nextInt(6) == 0) {
            val radio = sqrt((0.02 + r.nextDouble() * 0.3) * g.ancho * g.alto / PI)
            for (y in 0 until h) for (x in 0 until w) {
                val dx = x - w / 2.0
                val dy = y - h / 2.0
                if (dx * dx + dy * dy <= radio * radio) c.pon(x, y, 255)
            }
        }
        desenfocar(c, r.nextInt(3))
        return FrameAnalisis(w, h, c.p, w * escala, h * escala)
    }

    /** Recorte (y giro de 0/90/180/270) de un frame reducido de un vídeo sintético. */
    fun recorte(p: ByteArray, w: Int, h: Int, r: Random): FrameAnalisis {
        val an = maxOf(32, (w * (0.5 + r.nextDouble() * 0.5)).toInt())
        val al = maxOf(24, (h * (0.5 + r.nextDouble() * 0.5)).toInt())
        val x0 = r.nextInt(w - an + 1)
        val y0 = r.nextInt(h - al + 1)
        val giro = r.nextInt(4)
        val (dw, dh) = if (giro % 2 == 0) an to al else al to an
        val d = ByteArray(dw * dh * 4)
        for (y in 0 until dh) for (x in 0 until dw) {
            val (sx, sy) = when (giro) {
                0 -> x to y
                1 -> y to (al - 1 - x)
                2 -> (an - 1 - x) to (al - 1 - y)
                else -> (an - 1 - y) to x
            }
            System.arraycopy(p, ((y0 + sy) * w + x0 + sx) * 4, d, (y * dw + x) * 4, 4)
        }
        return FrameAnalisis(dw, dh, d, dw, dh)
    }

    /** Tarjeta sola (RGBA) con filas tipo MRZ TD1 o TD3 en una posición y orientación aleatorias. */
    fun tarjetaMrz(semilla: Long): Triple<ByteArray, Int, Int> {
        val r = Random(semilla)
        val w = 90 + r.nextInt(130)
        val h = (w / Guia.PROPORCION_ID1).toInt()
        val c = Lienzo(w, h)
        val claro = 150 + r.nextInt(100)
        for (y in 0 until h) for (x in 0 until w) c.pon(x, y, claro - r.nextInt(8))
        val filas = if (r.nextBoolean()) 3 else 2
        val hc = maxOf(2, h / (14 + r.nextInt(8)))
        val yBase = if (r.nextInt(4) == 0) h / 8 else h - filas * (hc * 17 / 10 + 1) - h / 12
        filasTexto(c, r, w / 20, w * 9 / 10, yBase, filas, hc, r.nextInt(80), if (filas == 3) 30 else 44)
        if (r.nextInt(3) == 0) filasTexto(c, r, w / 3, w / 2, h / 6, 3, maxOf(2, hc - 1), r.nextInt(80), 12)
        desenfocar(c, r.nextInt(2))
        if (r.nextBoolean()) return Triple(c.p, w, h)
        // Vertical: traspuesta (la tarjeta de pie).
        val t = ByteArray(c.p.size)
        for (y in 0 until h) for (x in 0 until w) System.arraycopy(c.p, (y * w + x) * 4, t, (x * h + y) * 4, 4)
        return Triple(t, h, w)
    }

    /** Luminancias con un rectángulo de proporción variable (a veces ID-1) y barras o texto dentro. */
    fun luminanciaTarjeta(semilla: Long): Triple<IntArray, Int, Int> {
        val r = Random(semilla)
        val w = 24 + r.nextInt(180)
        val h = 24 + r.nextInt(140)
        val c = Lienzo(w, h)
        val fondo = r.nextInt(256)
        for (y in 0 until h) for (x in 0 until w) c.pon(x, y, fondo + r.nextInt(9) - 4)
        val proporcion = if (r.nextBoolean()) Guia.PROPORCION_ID1 else 0.6 + r.nextDouble() * 1.4
        val vertical = r.nextInt(3) == 0
        var an = (w * (0.4 + r.nextDouble() * 0.55)).toInt()
        var al = (an / proporcion).toInt()
        if (vertical) an = al.also { al = an }
        an = an.coerceIn(4, w - 2)
        al = al.coerceIn(4, h - 2)
        val x0 = r.nextInt(w - an)
        val y0 = r.nextInt(h - al)
        c.rect(x0, y0, an, al, if (fondo < 128) 200 + r.nextInt(56) else r.nextInt(60))
        val tinta = if (fondo < 128) r.nextInt(60) else 200 + r.nextInt(56)
        when (r.nextInt(3)) {
            0 -> barras(c, r, x0 + an / 10, y0 + al / 4, an * 4 / 5, al / 2, tinta, vertical)
            1 -> filasTexto(c, r, x0 + 2, an - 4, y0 + al / 3, 3, maxOf(2, al / 12), tinta, 20)
            else -> Unit
        }
        desenfocar(c, r.nextInt(2))
        return Triple(IntArray(w * h) { c.luma(it % w, it / w) }, w, h)
    }
}
