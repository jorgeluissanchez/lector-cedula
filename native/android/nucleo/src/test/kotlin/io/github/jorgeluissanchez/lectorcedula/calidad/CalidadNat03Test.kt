package io.github.jorgeluissanchez.lectorcedula.calidad

import io.kotest.core.spec.style.StringSpec
import io.kotest.matchers.ints.shouldBeGreaterThanOrEqual
import io.kotest.matchers.ints.shouldBeLessThan
import io.kotest.matchers.nulls.shouldNotBeNull
import io.kotest.matchers.shouldBe
import java.io.File

/**
 * NAT-03 Calidad nativa con paridad web (fixture-sintetico: vídeos de e2e/videos/sinteticos). Los escenarios con vídeo
 * necesitan `npm run e2e:videos`; sin ellos se omiten (y `CT` falla en modo estricto).
 */
class CalidadNat03Test : StringSpec({
    val analizador = AnalizadorCalidad()
    fun evaluar(f: Fixtures.Rgba) = analizador.evaluarCompleto(f.pixeles, f.ancho, f.alto).shouldNotBeNull()
    val amarilla by lazy { Fixtures.frame("amarilla-1080p") }

    "NAT-03 Imagen nítida: score >= 70 y motivo null".config(enabled = Fixtures.disponibles()) {
        val e = evaluar(amarilla)
        e.resultado.score shouldBeGreaterThanOrEqual 70
        e.resultado.motivo shouldBe null
    }

    "NAT-03 Imagen oscura: brillo x 0,1 da oscuro y score < 70".config(enabled = Fixtures.disponibles()) {
        val e = evaluar(Fixtures.brillo(amarilla, 0.1))
        e.resultado.motivo shouldBe Motivo.OSCURO
        e.resultado.score shouldBeLessThan 70
    }

    "NAT-03 Reflejo: disco de luminancia 255 sobre el 15 % del cuadrilátero da reflejo".config(enabled = Fixtures.disponibles()) {
        evaluar(Fixtures.disco(amarilla, 0.15)).resultado.motivo shouldBe Motivo.REFLEJO
    }

    "NAT-03 Desenfoque: gaussiano sigma 6 da desenfocado".config(enabled = Fixtures.disponibles()) {
        evaluar(Fixtures.desenfoque(amarilla, 6.0)).resultado.motivo shouldBe Motivo.DESENFOCADO
    }

    "NAT-03 Metamórfica: brillo ±20 %, JPEG 70 y rotación ±3° mantienen el motivo; distorsión fuerte < 70".config(enabled = Fixtures.disponibles()) {
        val base = evaluar(amarilla).resultado.motivo
        for (f in listOf(Fixtures.brillo(amarilla, 0.8), Fixtures.brillo(amarilla, 1.2), Fixtures.jpeg(amarilla, 0.7), Fixtures.rotar(amarilla, 3.0), Fixtures.rotar(amarilla, -3.0))) {
            evaluar(f).resultado.motivo shouldBe base
        }
        for (f in listOf(Fixtures.brillo(amarilla, 0.05), Fixtures.desenfoque(amarilla, 10.0), Fixtures.disco(amarilla, 0.4))) {
            evaluar(f).resultado.score shouldBeLessThan 70
        }
    }

    "NAT-03 Paridad con la web: volcado JSON de score, motivo y contenido de cada fixture para CT".config(enabled = Fixtures.disponibles()) {
        val filas = Fixtures.nombres().map { nombre ->
            val f = Fixtures.frame(nombre)
            val e = evaluar(f)
            val r = e.resultado
            val motivo = r.motivo?.codigo?.let { "\"$it\"" } ?: "null"
            val contenido = e.contenido?.codigo?.let { "\"$it\"" } ?: "null"
            "{\"fixture\":\"$nombre\",\"score\":${r.score},\"motivo\":$motivo,\"contenido\":$contenido}"
        }
        val salida = File("build/volcados/calidad.json")
        salida.parentFile.mkdirs()
        salida.writeText("[\n" + filas.joinToString(",\n") + "\n]\n")
        filas.size shouldBe Fixtures.nombres().size
    }
})
