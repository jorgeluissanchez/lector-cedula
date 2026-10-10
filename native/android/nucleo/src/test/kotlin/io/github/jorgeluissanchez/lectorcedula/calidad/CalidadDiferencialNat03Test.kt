package io.github.jorgeluissanchez.lectorcedula.calidad

import io.github.jorgeluissanchez.lectorcedula.calidad.CasosCalidad.FAMILIAS
import io.kotest.core.spec.style.StringSpec
import io.kotest.matchers.shouldBe
import io.kotest.property.Arb
import io.kotest.property.arbitrary.long
import io.kotest.property.checkAll
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.io.File
import java.util.Random

/**
 * NAT-03 y NAT-04 "Paridad con la web", en proceso (tarea 1.3): el puerto Kotlin de calidad, presencia, guía y
 * localización MRZ frente a `packages/capture` evaluado en QuickJS ([Oraculo]) sobre escenas generadas (tarjeta ID-1,
 * barras tipo PDF417, filas tipo MRZ TD1/TD3, reflejo, desenfoque, ruido) y recortes de los vídeos sintéticos. Igualdad
 * exacta de score, motivo, métricas, tarjeta y contenido: la aritmética es la misma. fixture-sintetico: escenas
 * generadas con semilla y vídeos de e2e/videos/sinteticos; ningún dato real.
 *
 * Además fija el golden de [CalidadGoldenNat03Test]: las salidas del oráculo para las semillas fijas se vuelcan en
 * `build/goldens/goldens-calidad.json` y deben coincidir con el comprometido en `src/test/resources`; si `packages/capture`
 * cambia, esta prueba falla hasta copiar el volcado nuevo. Bajo PIT no corre (QuickJS es lento): el golden la sustituye.
 */
class CalidadDiferencialNat03Test : StringSpec({
    val oraculo by lazy { Oraculo() }
    afterSpec { oraculo.close() }
    val casos = System.getProperty("nat.iteraciones")?.toIntOrNull()?.coerceAtMost(40) ?: 300

    "NAT-03 Diferencial en proceso: CAL-07, presencia y evaluación guiada iguales a packages/capture en escenas generadas" {
        var conTarjeta = 0
        var conContenido = 0
        checkAll(casos, Arb.long()) { semilla ->
            val (f, modelo) = CasosCalidad.escena(semilla)
            val k = CasosCalidad.kotlinFrame(f, modelo)
            k shouldBe CasosCalidad.tsFrame(oraculo, f, modelo)
            if (k["tarjeta"] != null) conTarjeta++
            if (k["contenido"] != null) conContenido++
        }
        // Las escenas deben ejercitar la presencia, no solo el score.
        (conTarjeta > 0 && conContenido > 0) shouldBe true
    }

    "NAT-04 Diferencial en proceso: recortes y giros de los vídeos sintéticos dan la misma presencia y calidad".config(enabled = Fixtures.disponibles()) {
        val nombres = listOf("amarilla-1080p", "digital-1080p", "pasaporte-col-1080p", "amarilla-de-pie-vertical", "reflejo-1080p", "sin-documento-1080p")
        val reducidos = nombres.map { n -> Fixtures.frame(n).let { Guia.reducir(it.pixeles, it.ancho, it.alto) } }
        for ((p, w, h) in reducidos) CasosCalidad.kotlinFrame(FrameAnalisis(w, h, p, w, h)) shouldBe CasosCalidad.tsFrame(oraculo, FrameAnalisis(w, h, p, w, h))
        val r = Random(7)
        repeat(minOf(casos / 10, 12)) {
            val (p, w, h) = reducidos[r.nextInt(reducidos.size)]
            val f = Escenas.recorte(p, w, h, r)
            CasosCalidad.kotlinFrame(f) shouldBe CasosCalidad.tsFrame(oraculo, f)
        }
    }

    "NAT-04 Diferencial en proceso: localización MRZ (evidencia TD1 y TD3, cuatro orientaciones) en tarjetas generadas" {
        // La localización MRZ en QuickJS es lenta (cuatro orientaciones por tarjeta): una quinta parte de los casos.
        checkAll(maxOf(8, casos / 5), Arb.long()) { semilla -> CasosCalidad.kotlinMrz(semilla) shouldBe CasosCalidad.tsMrz(oraculo, semilla) }
    }

    "NAT-04 Diferencial en proceso: tarjeta ID-1 y PDF417 (estricto y suave) sobre luminancias generadas" {
        checkAll(casos, Arb.long()) { semilla -> CasosCalidad.kotlinTarjeta(semilla) shouldBe CasosCalidad.tsTarjeta(oraculo, semilla) }
    }

    "NAT-03 Diferencial en proceso: región M (CAL-02) con cuadriláteros arbitrarios, rampa, guía y dimensiones" {
        checkAll(casos, Arb.long()) { semilla -> CasosCalidad.kotlinGeometria(semilla) shouldBe CasosCalidad.tsGeometria(oraculo, semilla) }
    }

    "NAT-03 Golden del oráculo: semillas fijas, volcado en build/goldens e igual al comprometido".config(enabled = System.getProperty("nat.iteraciones") == null) {
        val salidas = FAMILIAS.associate { fam -> fam.nombre to List(fam.casosGolden) { i -> fam.ts(oraculo, CasosCalidad.semilla(i)) } }
        val volcado = File("build/goldens/goldens-calidad.json")
        volcado.parentFile.mkdirs()
        val json = Json { prettyPrint = true }
        volcado.writeText(json.encodeToString(JsonObject.serializer(), JsonObject(salidas.mapValues { (_, v) -> JsonArray(v.map { JsonPrimitive(it) }) })) + "\n")
        // El oráculo y el puerto coinciden en las semillas fijas (también lo comprueba el golden, sin QuickJS).
        for (fam in FAMILIAS) for (i in 0 until fam.casosGolden) fam.kotlin(CasosCalidad.semilla(i)) shouldBe salidas.getValue(fam.nombre)[i]
        // Si packages/capture cambió, el golden comprometido está desfasado: copiar build/goldens/goldens-calidad.json.
        CasosCalidad.golden() shouldBe salidas
    }
})
