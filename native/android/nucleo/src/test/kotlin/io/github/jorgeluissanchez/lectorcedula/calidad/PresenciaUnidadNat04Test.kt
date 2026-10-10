package io.github.jorgeluissanchez.lectorcedula.calidad

import io.kotest.core.spec.style.StringSpec
import io.kotest.matchers.shouldBe

/**
 * NAT-04 (tarea 1.3): presencia de OFF-22/OFF-25 con tarjetas generadas y valores literales. Los esperados son los de
 * `packages/capture` para las mismas entradas (oráculo `dist/oraculo-calidad.js`, funciones `tarjeta` y `analizar`).
 * fixture-sintetico: rectángulos y barras generados, ningún dato real.
 */
class PresenciaUnidadNat04Test : StringSpec({
    val u = Umbrales.POR_DEFECTO

    /** Luminancias: fondo, tarjeta [x0, x1] x [y0, y1] y patrón interior (1 barras verticales, 2 horizontales, 3 de 2 px) de ancho `ancho`. */
    fun tarjetaLuma(w: Int, h: Int, x0: Int, y0: Int, x1: Int, y1: Int, fondo: Int, carta: Int, patron: Int, amp: Int, ancho: Int = 100_000): IntArray =
        IntArray(w * h) { i ->
            val x = i % w
            val y = i / w
            val enTarjeta = x in x0..x1 && y in y0..y1
            val dentro = x >= x0 + 2 && x <= x1 - 2 && x < x0 + 2 + ancho && y >= y0 + 2 && y <= y1 - 2
            val marca = (patron == 1 && x % 2 == 0) || (patron == 2 && y % 2 == 0) || (patron == 3 && x % 4 < 2)
            if (!enTarjeta) fondo else if (dentro && marca) carta - amp else carta
        }

    /** RGBA con fondo y tarjeta de color; el patrón resta `amp` a cada canal (sin bajar de 0). */
    fun frameColor(w: Int, h: Int, fondo: IntArray, x0: Int, y0: Int, x1: Int, y1: Int, carta: IntArray, patron: Int, amp: Int): ByteArray {
        val p = ByteArray(w * h * 4)
        for (y in 0 until h) for (x in 0 until w) {
            var c = fondo
            if (x in x0..x1 && y in y0..y1) {
                c = carta
                val dentro = x >= x0 + 2 && x <= x1 - 2 && y >= y0 + 2 && y <= y1 - 2
                if (dentro && ((patron == 1 && x % 2 == 0) || (patron == 2 && y % 2 == 0))) c = IntArray(3) { maxOf(0, carta[it] - amp) }
            }
            val o = (y * w + x) * 4
            for (k in 0 until 3) p[o + k] = c[k].toByte()
            p[o + 3] = 255.toByte()
        }
        return p
    }

    fun tarjeta(c: List<Int>): String {
        val l = tarjetaLuma(c[0], c[1], c[2], c[3], c[4], c[5], c[6], c[7], c[8], c[9], c.getOrElse(10) { 100_000 })
        val t = Presencia.buscarTarjeta(l, c[0], c[1])
        val r = t ?: Presencia.Rect(0, 0, c[0], c[1])
        return listOf(t, Presencia.hayPdf417(l, c[0], r), Presencia.hayPdf417Suave(l, c[0], r)).toString()
    }

    "NAT-04 tarjeta ID-1: borde con salto >= 24, líneas >= 30 % del recorte, proporción ID-1 ±20 % en horizontal y vertical" {
        val casos = listOf(
            listOf(40, 30, 5, 5, 36, 24, 0, 255, 0, 0) to "[Rect(x=4, y=4, ancho=32, alto=20), true, true]",
            listOf(40, 30, 5, 5, 36, 24, 0, 24, 0, 0) to "[Rect(x=4, y=4, ancho=32, alto=20), false, true]",
            listOf(40, 30, 5, 5, 36, 24, 0, 23, 0, 0) to "[null, false, true]",
            listOf(40, 30, 0, 0, 31, 19, 0, 255, 0, 0) to "[null, true, true]",
            listOf(40, 30, 8, 10, 39, 29, 255, 0, 0, 0) to "[null, true, true]",
            listOf(30, 40, 5, 5, 24, 36, 0, 255, 0, 0) to "[Rect(x=4, y=4, ancho=20, alto=32), true, true]",
            listOf(50, 30, 5, 5, 42, 24, 0, 255, 0, 0) to "[Rect(x=4, y=4, ancho=38, alto=20), true, true]",
            listOf(50, 30, 5, 5, 43, 24, 0, 255, 0, 0) to "[null, true, true]",
            listOf(50, 30, 5, 5, 29, 24, 0, 255, 0, 0) to "[null, true, true]",
            listOf(50, 30, 5, 5, 30, 24, 0, 255, 0, 0) to "[Rect(x=4, y=4, ancho=26, alto=20), true, true]",
            listOf(40, 30, 5, 5, 18, 13, 0, 255, 0, 0) to "[Rect(x=4, y=4, ancho=14, alto=9), false, false]",
            listOf(40, 30, 5, 5, 18, 12, 0, 255, 0, 0) to "[null, false, false]",
            listOf(48, 64, 4, 4, 38, 59, 0, 200, 1, 150) to "[Rect(x=3, y=3, ancho=35, alto=56), true, true]",
        )
        for ((c, esperado) in casos) tarjeta(c) shouldBe esperado
    }

    "NAT-04 PDF417 estricto y suave: amplitud, orientación de las barras y fracción de bloques en sus umbrales" {
        val casos = listOf(
            listOf(200, 140, 10, 10, 189, 122, 0, 200, 1, 150) to "true, true]",
            listOf(200, 140, 10, 10, 189, 122, 0, 200, 2, 150) to "false, false]",
            listOf(200, 140, 10, 10, 189, 122, 0, 200, 1, 12) to "false, true]",
            listOf(200, 140, 10, 10, 189, 122, 0, 200, 1, 13) to "true, true]",
            listOf(200, 140, 10, 10, 189, 122, 0, 200, 3, 6) to "false, true]",
            listOf(200, 140, 10, 10, 189, 122, 0, 200, 1, 1) to "false, false]",
            listOf(200, 140, 10, 10, 189, 122, 0, 200, 1, 2) to "false, true]",
            listOf(200, 140, 10, 10, 189, 122, 0, 200, 1, 150, 6) to "false, false]",
            listOf(200, 140, 10, 10, 189, 122, 0, 200, 1, 150, 7) to "false, true]",
            listOf(200, 140, 10, 10, 189, 122, 0, 200, 1, 150, 14) to "false, true]",
            listOf(200, 140, 10, 10, 189, 122, 0, 200, 1, 150, 15) to "true, true]",
            listOf(200, 140, 10, 10, 189, 122, 0, 200, 1, 3, 10) to "false, false]",
            listOf(200, 140, 10, 10, 189, 122, 0, 200, 1, 3, 11) to "false, true]",
            listOf(140, 200, 10, 10, 122, 189, 0, 200, 1, 150) to "true, true]",
            listOf(140, 200, 10, 10, 122, 189, 0, 200, 2, 150) to "false, false]",
        )
        for ((c, esperado) in casos) {
            val rect = if (c[0] > c[1]) "Rect(x=9, y=9, ancho=180, alto=113)" else "Rect(x=9, y=9, ancho=113, alto=180)"
            tarjeta(c) shouldBe "[$rect, $esperado"
        }
    }

    "NAT-04 detectar: recorte de la guía, luminancia de color, tarjeta vertical traspuesta y PDF417 suave" {
        val rojo = intArrayOf(200, 0, 0)
        val azul = intArrayOf(0, 0, 200)
        val negro = intArrayOf(0, 0, 0)
        val gris = intArrayOf(200, 200, 200)
        fun det(w: Int, h: Int, fondo: IntArray, x0: Int, y0: Int, x1: Int, y1: Int, carta: IntArray, patron: Int, amp: Int, guia: Caja? = null): Presencia.Resultado {
            val f = FrameAnalisis(w, h, frameColor(w, h, fondo, x0, y0, x1, y1, carta, patron, amp), w, h, guia)
            return Presencia.detectar(f, Guia.guiaEnAnalisis(w, h, w, h, guia))
        }
        val horizontal = Presencia.Rect(39, 24, 240, 151)
        val vertical = Presencia.Rect(24, 39, 151, 240)
        // Rojo sobre azul: la luminancia de color (77 R + 150 G + 29 B) separa la tarjeta del fondo.
        det(320, 200, rojo, 40, 25, 279, 175, azul, 1, 150) shouldBe Presencia.Resultado(horizontal, Contenido.PDF417, true)
        det(320, 200, rojo, 40, 25, 279, 175, azul, 0, 0) shouldBe Presencia.Resultado(horizontal, null, false)
        det(320, 200, negro, 40, 25, 279, 175, intArrayOf(0, 200, 0), 2, 150) shouldBe Presencia.Resultado(horizontal, null, false)
        // De pie: barras horizontales en la imagen son verticales en la tarjeta (traspuesta); también las suaves.
        det(200, 320, negro, 25, 40, 175, 279, gris, 2, 150) shouldBe Presencia.Resultado(vertical, Contenido.PDF417, true)
        det(200, 320, negro, 25, 40, 175, 279, gris, 1, 150) shouldBe Presencia.Resultado(vertical, Contenido.PDF417, true)
        det(200, 320, negro, 25, 40, 175, 279, gris, 2, 3) shouldBe Presencia.Resultado(vertical, Contenido.PDF417, true)
        // Guía del integrador (SDK-61): fuera de ella no hay tarjeta; con ella alrededor, la misma tarjeta.
        det(320, 200, negro, 40, 25, 279, 175, gris, 1, 150, Caja(200.0, 0.0, 120.0, 75.0)) shouldBe Presencia.Resultado(null, null, false)
        det(320, 200, negro, 40, 25, 279, 175, gris, 1, 150, Caja(30.0, 20.0, 260.0, 164.0)) shouldBe Presencia.Resultado(horizontal, Contenido.PDF417, true)
        // Recorte menor de 8 px: sin tarjeta.
        det(16, 10, negro, 2, 2, 13, 8, gris, 0, 0) shouldBe Presencia.Resultado(null, null, false)
    }

    "NAT-04 aplicarPresencia: sin documento el score queda en umbral - 1 con acerca; con documento o bajo el umbral no cambia" {
        val m = MetricasCalidad(MetricaNitidez(500.0, 100), MetricaReflejo(0.0, 0.0, 100), MetricaExposicion(128.0, 0.0, 100, 100), null)
        Presencia.aplicarPresencia(ResultadoCalidad(90, null, m), false, 70) shouldBe ResultadoCalidad(69, Motivo.ACERCA, m)
        Presencia.aplicarPresencia(ResultadoCalidad(70, null, m), false, 70) shouldBe ResultadoCalidad(69, Motivo.ACERCA, m)
        Presencia.aplicarPresencia(ResultadoCalidad(90, null, m), true, 70) shouldBe ResultadoCalidad(90, null, m)
        Presencia.aplicarPresencia(ResultadoCalidad(69, Motivo.REFLEJO, m), false, 70) shouldBe ResultadoCalidad(69, Motivo.REFLEJO, m)
    }

    "NAT-04 evaluarConPresencia (OFF-25): la presencia solo se consulta con score >= umbral y nunca eleva el score" {
        fun met(varianza: Double, reflejo: Int = 100, oscuro: Int = 100, sobre: Int = 100, tamano: Int? = null) =
            MetricasCalidad(MetricaNitidez(varianza, 10), MetricaReflejo(0.0, 0.0, reflejo), MetricaExposicion(100.0, 0.0, oscuro, sobre), tamano?.let { MetricaTamano(0.5, it) })
        var llamadas = 0
        fun consulta(r: ResultadoCalidad, presente: Boolean): Pair<ResultadoCalidad, Int> {
            llamadas = 0
            return Presencia.evaluarConPresencia(r, { llamadas++; presente }, u.umbralListo) to llamadas
        }
        val listo = ResultadoCalidad(70, null, met(500.0))
        consulta(listo, false) shouldBe (ResultadoCalidad(69, Motivo.ACERCA, met(500.0)) to 1)
        consulta(listo, true) shouldBe (listo to 1)
        val nitido = ResultadoCalidad(90, null, met(500.0))
        consulta(nitido, true) shouldBe (nitido to 1)
        // Por debajo del umbral nunca se consulta ni cambia: desenfocado (aunque haya documento), reflejo, oscuro, sin métricas.
        for (r in listOf(
            ResultadoCalidad(69, Motivo.DESENFOCADO, met(26.0)),
            ResultadoCalidad(40, Motivo.DESENFOCADO, met(12.0)),
            ResultadoCalidad(10, Motivo.REFLEJO, met(500.0, reflejo = 10)),
            ResultadoCalidad(40, Motivo.OSCURO, met(500.0, oscuro = 40)),
            ResultadoCalidad(0, Motivo.DESENFOCADO, null),
        )) {
            consulta(r, true) shouldBe (r to 0)
            consulta(r, false) shouldBe (r to 0)
        }
    }
})
