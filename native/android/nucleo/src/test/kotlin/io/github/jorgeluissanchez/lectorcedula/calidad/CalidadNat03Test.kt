package io.github.jorgeluissanchez.lectorcedula.calidad

import io.kotest.core.spec.style.StringSpec
import io.kotest.matchers.collections.shouldBeIn
import io.kotest.matchers.ints.shouldBeGreaterThanOrEqual
import io.kotest.matchers.ints.shouldBeLessThan
import io.kotest.matchers.nulls.shouldNotBeNull
import io.kotest.matchers.shouldBe
import io.kotest.matchers.types.shouldBeInstanceOf
import java.io.File

/**
 * NAT-03 Calidad nativa con paridad web (fixture-sintetico: vídeos de e2e/videos/sinteticos). Los escenarios con vídeo
 * necesitan `npm run e2e:videos`; sin ellos se omiten (y `CT` falla en modo estricto).
 *
 * `evaluar` es la evaluación del Lector (CAL-07 con la presencia de OFF-22/OFF-25, como el Worker web: la presencia solo
 * se evalúa con score >= umbralListo y nunca lo eleva); `cal07` es solo el score de CAL-07.
 */
class CalidadNat03Test : StringSpec({
    val analizador = AnalizadorCalidad()
    fun evaluar(f: Fixtures.Rgba) = analizador.evaluarCompleto(f.pixeles, f.ancho, f.alto).shouldNotBeNull()
    fun cal07(f: Fixtures.Rgba): ResultadoCalidad {
        val (reducido, an, al) = Guia.reducir(f.pixeles, f.ancho, f.alto)
        val guia = Guia.guiaEnAnalisis(an, al, f.ancho, f.alto)
        val r = Calidad.analizarFrame(FrameAnalisis(an, al, reducido, f.ancho, f.alto), DeteccionDocumento(guia, DeteccionDocumento.Fuente.GUIA), Umbrales.POR_DEFECTO)
        return r.shouldBeInstanceOf<ResultadoAnalisis.Ok>().resultado
    }
    val amarilla by lazy { Fixtures.frame("amarilla-1080p") }

    "NAT-03 Imagen nítida: score >= 70 y motivo null".config(enabled = Fixtures.disponibles()) {
        val e = evaluar(amarilla)
        e.resultado.score shouldBeGreaterThanOrEqual 70
        e.resultado.motivo shouldBe null
        cal07(amarilla).motivo shouldBe null
    }

    "NAT-03 Imagen oscura: brillo x 0,1 da oscuro y score < 70".config(enabled = Fixtures.disponibles()) {
        val f = Fixtures.brillo(amarilla, 0.1)
        val e = evaluar(f)
        e.resultado.motivo shouldBe Motivo.OSCURO
        e.resultado.score shouldBeLessThan 70
        cal07(f).motivo shouldBe Motivo.OSCURO
    }

    "NAT-03 Reflejo: disco de luminancia 255 sobre el 15 % del cuadrilátero da reflejo".config(enabled = Fixtures.disponibles()) {
        val f = Fixtures.disco(amarilla, 0.15)
        evaluar(f).resultado.motivo shouldBe Motivo.REFLEJO
        cal07(f).motivo shouldBe Motivo.REFLEJO
    }

    "NAT-03 Desenfoque: gaussiano sigma 6 da desenfocado en el score de CAL-07".config(enabled = Fixtures.disponibles()) {
        val f = Fixtures.desenfoque(amarilla, 6.0)
        val r = cal07(f)
        r.motivo shouldBe Motivo.DESENFOCADO
        r.score shouldBeLessThan 70
        // Con el documento presente el Lector da lo mismo que CAL-07: la presencia no eleva el score (OFF-25 tras la
        // recalibración del 2026-10-10; paridad en el volcado de CT). La varianza (unos 19) queda bajo la de score 70 (27).
        val conPresencia = evaluar(f)
        conPresencia.resultado shouldBe r
        conPresencia.contenido shouldBe null
        evaluar(Fixtures.desenfoque(amarilla, 10.0)).resultado.motivo shouldBe Motivo.DESENFOCADO
    }

    // Sobre el score de CAL-07: la presencia (NAT-04, OFF-22) es otra relación. Con el fixture sintético, girar el frame
    // completo incluso 1° hace que la presencia de packages/capture no encuentre la tarjeta (igual en Kotlin y en TS).
    "NAT-03 Metamórfica: brillo ±20 %, JPEG 70 y rotación ±3° mantienen el motivo; distorsión fuerte < 70".config(enabled = Fixtures.disponibles()) {
        val base = cal07(amarilla).motivo
        for (f in listOf(Fixtures.brillo(amarilla, 0.8), Fixtures.jpeg(amarilla, 0.7f), Fixtures.rotar(amarilla, 3.0), Fixtures.rotar(amarilla, -3.0))) {
            cal07(f).motivo shouldBe base
        }
        // Brillo +20 %: relación condicionada. Si el aumento no satura la guía, el motivo no cambia; si la satura (la
        // amarilla sintética es clara: el 80 % de la tarjeta pasa de 250), el único motivo válido es de exceso de luz.
        // Mismo comportamiento que packages/capture (volcado `brillo-1.2` de CT).
        val clara = Fixtures.brillo(amarilla, 1.2)
        val saturada = cal07(clara).metricas!!.reflejo.fraccionSaturada > Umbrales.POR_DEFECTO.fraccionSaturadaMax
        if (saturada) cal07(clara).motivo shouldBeIn listOf(Motivo.REFLEJO, Motivo.SOBREEXPUESTO) else cal07(clara).motivo shouldBe base
        for (f in listOf(Fixtures.brillo(amarilla, 0.05), Fixtures.desenfoque(amarilla, 10.0), Fixtures.disco(amarilla, 0.4))) {
            cal07(f).score shouldBeLessThan 70
            evaluar(f).resultado.score shouldBeLessThan 70
        }
    }

    "NAT-03 Paridad con la web: volcado JSON de score, motivo y contenido de cada fixture y transformación para CT".config(enabled = Fixtures.disponibles()) {
        fun fila(nombre: String, e: AnalizadorCalidad.Evaluacion): String {
            val r = e.resultado
            val motivo = r.motivo?.codigo?.let { "\"$it\"" } ?: "null"
            val contenido = e.contenido?.codigo?.let { "\"$it\"" } ?: "null"
            return "{\"fixture\":\"$nombre\",\"score\":${r.score},\"motivo\":$motivo,\"contenido\":$contenido}"
        }
        val filas = Fixtures.nombres().map { nombre -> fila(nombre, evaluar(Fixtures.frame(nombre))) }
        // Transformaciones deterministas de los escenarios (la parte TS de CT las reproduce con la misma aritmética).
        val transformadas = listOf(
            "amarilla-1080p:brillo-0.1" to Fixtures.brillo(amarilla, 0.1),
            "amarilla-1080p:brillo-0.8" to Fixtures.brillo(amarilla, 0.8),
            "amarilla-1080p:brillo-1.2" to Fixtures.brillo(amarilla, 1.2),
            "amarilla-1080p:disco-0.15" to Fixtures.disco(amarilla, 0.15),
            "amarilla-1080p:desenfoque-6" to Fixtures.desenfoque(amarilla, 6.0),
        ).map { (nombre, f) -> fila(nombre, evaluar(f)) }
        // Bajo PIT (`-Dnat.iteraciones`) el código está mutado: su volcado no debe pisar el de `KJ` que lee `CT`.
        if (System.getProperty("nat.iteraciones") == null) {
            val salida = File("build/volcados/calidad.json")
            salida.parentFile.mkdirs()
            salida.writeText("[\n" + (filas + transformadas).joinToString(",\n") + "\n]\n")
        }
        filas.size shouldBe Fixtures.nombres().size
    }
})
