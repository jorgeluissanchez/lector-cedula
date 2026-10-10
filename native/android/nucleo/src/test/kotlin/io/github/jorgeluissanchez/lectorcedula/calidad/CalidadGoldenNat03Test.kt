package io.github.jorgeluissanchez.lectorcedula.calidad

import io.kotest.core.spec.style.StringSpec
import io.kotest.matchers.nulls.shouldNotBeNull
import io.kotest.matchers.shouldBe

/**
 * NAT-03 y NAT-04 "Paridad con la web" contra el golden del oráculo (tarea 1.3): las salidas de `packages/capture` para
 * semillas fijas de [CasosCalidad], comprometidas en `lectorcedula/goldens-calidad.json` y vigiladas por
 * [CalidadDiferencialNat03Test] (falla si el oráculo deja de producirlas). Sin QuickJS: es la versión rápida del
 * diferencial que corre bajo PIT (`KM`). fixture-sintetico: escenas generadas con semilla, ningún dato real.
 */
class CalidadGoldenNat03Test : StringSpec({
    val golden by lazy { CasosCalidad.golden().shouldNotBeNull() }

    for (familia in CasosCalidad.FAMILIAS) {
        "NAT-03 Golden ${familia.nombre}: el puerto Kotlin da exactamente la salida de packages/capture en ${familia.casosGolden} semillas fijas" {
            val esperado = golden[familia.nombre].shouldNotBeNull()
            esperado.size shouldBe familia.casosGolden
            for (i in 0 until familia.casosGolden) familia.kotlin(CasosCalidad.semilla(i)) shouldBe esperado[i]
        }
    }

    "NAT-03 Golden: las familias ejercitan presencia, contenido, MRZ, PDF417, cuadriláteros inválidos y guía propia" {
        val g = golden
        val escenas = g.getValue("escenas")
        // Proporción de casos útiles (estrategia-pruebas: sin propiedades vacías).
        (escenas.count { !it.startsWith("{tarjeta=null") } * 4 > escenas.size) shouldBe true
        listOf(
            "contenido=pdf417", "contenido=mrz-td1", "motivo=oscuro", "motivo=reflejo", "motivo=desenfocado", "motivo=sobreexpuesto",
            "motivo=null", "guiado=[69, acerca]",
        ).forEach { marca -> escenas.any { marca in it } shouldBe true }
        // OFF-25 (recalibración del 2026-10-10): con presencia, un frame sobre el umbral conserva su score y motivo null.
        escenas.any { Regex("guiado=\\[(7\\d|8\\d|9\\d|100), null\\]").containsMatchIn(it) } shouldBe true
        g.getValue("mrz").any { it.endsWith("true, false]") } shouldBe true
        g.getValue("mrz").any { it.endsWith("false, true]") } shouldBe true
        g.getValue("tarjeta").any { it.endsWith("true, true]") } shouldBe true
        g.getValue("tarjeta").any { it.endsWith("false, true]") } shouldBe true
        g.getValue("geometria").any { it.startsWith("[null") } shouldBe true
        (g.getValue("geometria").count { it.startsWith("[(") } * 2 >= g.getValue("geometria").size) shouldBe true
    }
})
