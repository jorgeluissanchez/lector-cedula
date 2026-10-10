package io.github.jorgeluissanchez.lectorcedula.calidad

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.core.spec.style.StringSpec
import io.kotest.matchers.shouldBe
import io.kotest.matchers.string.shouldContain

/**
 * NAT-03: los umbrales de CAL-08 se leen del JSON generado desde `umbrales.ts` (la prueba de Vitest
 * `nat-03-umbrales.test.ts` exige que esté al día) y nunca se completan con valores inventados.
 */
class UmbralesNat03Test : StringSpec({
    val json = Umbrales::class.java.getResourceAsStream("/lectorcedula/umbrales-calidad.json")!!.use { it.readBytes().toString(Charsets.UTF_8) }

    "NAT-03 Umbrales por omisión: los del JSON generado, campo a campo" {
        val u = Umbrales.POR_DEFECTO
        u shouldBe Umbrales.desdeJson(json)
        listOf(u.laplacianoDesenfocado, u.laplacianoNitido, u.luminanciaSaturada, u.fraccionSaturadaMax, u.componenteSaturadoMax) shouldBe listOf(40.0, 200.0, 250.0, 0.05, 0.02)
        listOf(u.luminanciaOscura, u.fraccionOscuraMax, u.mediaNegra, u.mediaOscuraOk, u.mediaClaraOk, u.mediaBlanca) shouldBe listOf(5.0, 0.25, 20.0, 60.0, 200.0, 240.0)
        listOf(u.ratioMinimo, u.ratioOk, u.intervaloMinimoMs, u.laplacianoMinimoGuiado) shouldBe listOf(0.1, 0.3, 100.0, 12.0)
        listOf(u.umbralListo, u.framesConsecutivos) shouldBe listOf(70, 3)
    }

    "NAT-03 Umbrales: sin bloque o con un campo ausente, falla en vez de inventar el valor" {
        shouldThrow<IllegalStateException> { Umbrales.desdeJson("{}") }.message shouldBe "umbrales-invalidos"
        val sinCampo = json.replace(Regex("\"umbralListo\"\\s*:\\s*70,?"), "")
        shouldThrow<IllegalStateException> { Umbrales.desdeJson(sinCampo) }.message!! shouldContain "umbralListo"
        Umbrales.desdeJson(json.replace("\"umbralListo\": 70", "\"umbralListo\": 65")).umbralListo shouldBe 65
    }
})
