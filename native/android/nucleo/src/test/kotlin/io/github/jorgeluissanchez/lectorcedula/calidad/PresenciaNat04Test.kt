package io.github.jorgeluissanchez.lectorcedula.calidad

import io.kotest.core.spec.style.StringSpec
import io.kotest.matchers.ints.shouldBeLessThan
import io.kotest.matchers.nulls.shouldNotBeNull
import io.kotest.matchers.shouldBe

/** NAT-04 Presencia de documento y guía (fixture-sintetico). Las transiciones de fase se prueban en el Lector (1.2). */
class PresenciaNat04Test : StringSpec({
    val analizador = AnalizadorCalidad()

    "NAT-04 Guía normalizada: 1920x1080 con { 192, 216, 1536, 648 } da { 0.1, 0.2, 0.8, 0.6 }" {
        Guia.normalizada(Caja(192.0, 216.0, 1536.0, 648.0), 1920, 1080) shouldBe Caja(0.1, 0.2, 0.8, 0.6)
    }

    "NAT-04 Guía de CAM-08 en 1920x1080: centrada, ID-1 y 90 % del alto" {
        Guia.calcularGuia(1920, 1080) shouldBe Caja(190.0, 54.0, 1541.0, 972.0)
        Guia.calcularGuia(1080, 1920) shouldBe Caja(54.0, 190.0, 972.0, 1541.0)
        Guia.calcularGuia(1920, 1080, horizontalForzada = false, margen = 0.05) shouldBe Caja(654.0, 54.0, 613.0, 972.0)
    }

    "NAT-04 Sin documento: 30 frames de sin-documento-1080p nunca llegan al umbral y el motivo es acerca".config(enabled = Fixtures.disponibles()) {
        repeat(30) { i ->
            val f = Fixtures.frame("sin-documento-1080p", i % 10)
            val e = analizador.evaluarCompleto(f.pixeles, f.ancho, f.alto).shouldNotBeNull()
            e.resultado.score shouldBeLessThan 70
            e.resultado.motivo shouldBe Motivo.ACERCA
        }
    }

    "NAT-04 Documento presente: amarilla con PDF417, digital con MRZ TD1 y pasaporte con TD3".config(enabled = Fixtures.disponibles()) {
        for ((nombre, contenido) in listOf("amarilla-1080p" to Contenido.PDF417, "digital-1080p" to Contenido.MRZ_TD1, "pasaporte-col-1080p" to Contenido.MRZ_TD3)) {
            val f = Fixtures.frame(nombre)
            val e = analizador.evaluarCompleto(f.pixeles, f.ancho, f.alto).shouldNotBeNull()
            e.contenido shouldBe contenido
            e.resultado.motivo shouldBe null
        }
    }
})
