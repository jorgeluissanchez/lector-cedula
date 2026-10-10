package io.github.jorgeluissanchez.lectorcedula.calidad

import io.kotest.core.spec.style.StringSpec
import io.kotest.matchers.nulls.shouldNotBeNull
import io.kotest.matchers.shouldBe
import io.kotest.matchers.types.shouldNotBeSameInstanceAs

/**
 * NAT-03 y NAT-04 (tarea 1.3): guía de CAM-08/SDK-61 en el frame de análisis, dimensiones de CAL-01 y reducción por
 * área con tamaños arbitrarios. Las dimensiones y la guía son las de `packages/capture` (oráculo); la reducción es
 * propia del núcleo nativo y sus esperados se calculan a mano (media redondeada de los píxeles fuente).
 */
class GuiaNat04Test : StringSpec({
    "NAT-04 Guía de CAM-08 con margen 0, orientación forzada y margen 0,5 (guía vacía)" {
        Guia.calcularGuia(1920, 1080, null, 0.0) shouldBe Caja(104.0, 0.0, 1713.0, 1080.0)
        Guia.calcularGuia(1000, 1000, false, null) shouldBe Caja(216.0, 50.0, 568.0, 900.0)
        Guia.calcularGuia(1000, 1000, true, 0.5) shouldBe Caja(500.0, 500.0, 0.0, 0.0)
    }

    "NAT-04 Guía en el frame de análisis: escalada sin redondear; la del integrador puede cubrir el frame completo" {
        Guia.guiaEnAnalisis(640, 360, 1920, 1080) shouldBe listOf(Punto(190.0 * 640 / 1920, 18.0), Punto(577.0, 18.0), Punto(577.0, 342.0), Punto(190.0 * 640 / 1920, 342.0))
        Guia.guiaEnAnalisis(4, 4, 4, 4) shouldBe listOf(Punto(0.0, 1.0), Punto(4.0, 1.0), Punto(4.0, 3.0), Punto(0.0, 3.0))
        Guia.guiaEnAnalisis(640, 360, 1920, 1080, Caja(0.0, 0.0, 1920.0, 1080.0)) shouldBe listOf(Punto(0.0, 0.0), Punto(640.0, 0.0), Punto(640.0, 360.0), Punto(0.0, 360.0))
        Guia.guiaEnAnalisis(100, 50, 200, 100, Caja(20.0, 10.0, 60.0, 30.0)) shouldBe listOf(Punto(10.0, 5.0), Punto(40.0, 5.0), Punto(40.0, 20.0), Punto(10.0, 20.0))
    }

    "NAT-03 Guía completa: con la guía que cubre todo el frame, M es el frame entero" {
        val c = Guia.guiaEnAnalisis(5, 3, 5, 3, Caja(0.0, 0.0, 5.0, 3.0))
        Calidad.calcularRegion(c, 5, 3).shouldNotBeNull().second shouldBe 15
    }

    "NAT-03 Dimensiones de CAL-01: lado largo 640 o el original si es menor" {
        listOf(640 to 480, 641 to 100, 1920 to 1080, 1080 to 1920, 640 to 700, 641 to 641, 100 to 641, 1281 to 3, 1 to 1).map { (a, b) -> Guia.dimensionesAnalisis(a, b) } shouldBe
            listOf(640 to 480, 640 to 100, 640 to 360, 360 to 640, 585 to 640, 640 to 640, 100 to 640, 640 to 1, 1 to 1)
    }

    "NAT-03 Reducción por área: copia si ya cabe, media redondeada con bytes sin signo y tamaños no múltiplos" {
        // Ya cabe: copia con el mismo contenido, nunca el mismo arreglo del llamador.
        val p = ByteArray(4 * 2 * 4) { it.toByte() }
        val (c, w0, h0) = Guia.reducir(p, 4, 2)
        (w0 to h0) shouldBe (4 to 2)
        c.toList() shouldBe p.toList()
        c shouldNotBeSameInstanceAs p

        // 1280x2 -> 640x1: cada destino promedia 2x2. Canal 0 con sumas 1, 2, 4x255, 3, 3 y 6; canal 1 constante; alfa 200.
        val ancho = 1280
        val src = ByteArray(ancho * 2 * 4)
        for (i in 0 until ancho * 2) {
            src[i * 4 + 1] = 7
            src[i * 4 + 3] = 200.toByte()
        }
        fun pon(x: Int, y: Int, v: Int) { src[(y * ancho + x) * 4] = v.toByte() }
        pon(0, 0, 1)
        pon(2, 0, 1); pon(3, 0, 1)
        pon(4, 0, 255); pon(5, 0, 255); pon(4, 1, 255); pon(5, 1, 255)
        pon(6, 0, 1); pon(7, 0, 1); pon(6, 1, 1)
        pon(8, 0, 2); pon(9, 0, 1)
        pon(10, 0, 3); pon(11, 1, 3)
        pon(1279, 1, 9)
        val (r, w, h) = Guia.reducir(src, ancho, 2)
        (w to h) shouldBe (640 to 1)
        (0 until 6).map { r[it * 4].toInt() and 0xFF } shouldBe listOf(0, 1, 255, 1, 1, 2)
        (r[639 * 4].toInt() and 0xFF) shouldBe 2
        (0 until 640).all { r[it * 4 + 1].toInt() == 7 && (r[it * 4 + 3].toInt() and 0xFF) == 200 && r[it * 4 + 2].toInt() == 0 } shouldBe true

        // 641x1 -> 640x1: el primer destino toma 1 píxel y el último 2 (639 y 640).
        val fila = ByteArray(641 * 4)
        fila[0] = 50
        fila[1 * 4] = 90
        fila[639 * 4] = 10
        fila[640 * 4] = 21
        val (rf, wf, hf) = Guia.reducir(fila, 641, 1)
        (wf to hf) shouldBe (640 to 1)
        listOf(rf[0].toInt(), rf[4].toInt(), rf[638 * 4].toInt(), rf[639 * 4].toInt()) shouldBe listOf(50, 90, 0, 16)

        // Vertical 2x1280 -> 1x640: cada destino promedia 2 columnas y 2 filas.
        val col = ByteArray(2 * 1280 * 4)
        col[(0 * 2 + 1) * 4] = 4 // (x=1, y=0)
        col[(1 * 2 + 0) * 4] = 4 // (x=0, y=1)
        col[(1279 * 2 + 1) * 4] = 100 // (x=1, y=1279)
        val (rc, wc, hc) = Guia.reducir(col, 2, 1280)
        (wc to hc) shouldBe (1 to 640)
        listOf(rc[0].toInt(), rc[4].toInt(), rc[639 * 4].toInt()) shouldBe listOf(2, 0, 25)

        // 1281x3 -> 640x1: tres filas y 2 o 3 columnas por destino (el último, 1278 a 1280: (270 + 4) / 9 = 30).
        val raro = ByteArray(1281 * 3 * 4)
        for (y in 0 until 3) {
            raro[(y * 1281 + 1279) * 4] = 30
            raro[(y * 1281 + 1280) * 4] = 60
        }
        raro[0] = 9
        val (rr, wr, hr) = Guia.reducir(raro, 1281, 3)
        (wr to hr) shouldBe (640 to 1)
        listOf(rr[0].toInt(), rr[639 * 4].toInt()) shouldBe listOf(2, 30)
    }
})
