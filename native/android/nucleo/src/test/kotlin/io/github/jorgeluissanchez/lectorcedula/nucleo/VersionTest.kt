package io.github.jorgeluissanchez.lectorcedula.nucleo

import io.kotest.core.spec.style.StringSpec
import io.kotest.matchers.shouldBe
import java.io.File

/** Prueba trivial de la fase 0 (sdk-nativo, tarea 0.3): la versión nativa es la del bundle nucleo-js. */
class VersionTest : StringSpec({
    "NAT-07 la versión nativa coincide con la de packages/nucleo-js" {
        val paquete = File("../../../packages/nucleo-js/package.json").readText()
        val version = Regex("\"version\"\\s*:\\s*\"([^\"]+)\"").find(paquete)?.groupValues?.get(1)
        version shouldBe LectorCedulaVersion.VERSION
    }
})
