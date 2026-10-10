package io.github.jorgeluissanchez.lectorcedula.calidad

import io.kotest.core.spec.style.StringSpec
import io.kotest.matchers.doubles.plusOrMinus
import io.kotest.matchers.nulls.shouldNotBeNull
import io.kotest.matchers.shouldBe
import io.kotest.matchers.types.shouldBeInstanceOf

/**
 * NAT-03 (tarea 1.3): piezas de CAL-01 a CAL-07 con frames diminutos y valores literales. Los valores esperados son
 * los de `packages/capture` para las mismas entradas (comprobados con el oráculo `dist/oraculo-calidad.js`), no una
 * copia de la fórmula. fixture-sintetico: frames generados, ningún dato real.
 */
class CalidadUnidadNat03Test : StringSpec({
    val u = Umbrales.POR_DEFECTO

    /** RGBA gris (R = G = B = v, alfa 255) de luminancias dadas. */
    fun gris(vararg v: Int): ByteArray = ByteArray(v.size * 4) { i -> if (i % 4 == 3) 255.toByte() else v[i / 4].toByte() }

    fun rect(x0: Double, y0: Double, x1: Double, y1: Double): Cuadrilatero = listOf(Punto(x0, y0), Punto(x1, y0), Punto(x1, y1), Punto(x0, y1))

    fun indices(m: ByteArray) = m.withIndex().filter { it.value.toInt() == 1 }.map { it.index }

    fun ok(r: ResultadoAnalisis) = r.shouldBeInstanceOf<ResultadoAnalisis.Ok>().resultado

    "NAT-03 rampa: 0 en a o antes, 100 en b o después, redondeo de Math.round (0,5 sube)" {
        Calidad.rampa(10.0, 10.0, 20.0) shouldBe 0
        Calidad.rampa(9.0, 10.0, 20.0) shouldBe 0
        Calidad.rampa(20.0, 10.0, 20.0) shouldBe 100
        Calidad.rampa(25.0, 10.0, 20.0) shouldBe 100
        Calidad.rampa(15.0, 10.0, 20.0) shouldBe 50
        Calidad.rampa(1.0, 0.0, 200.0) shouldBe 1
        Calidad.rampa(3.0, 0.0, 200.0) shouldBe 2
        Calidad.rampa(0.98, 0.0, 200.0) shouldBe 0
        Calidad.rampa(199.0, 0.0, 200.0) shouldBe 100
        Calidad.rampa(198.9, 0.0, 200.0) shouldBe 99
    }

    "NAT-03 luminancia entera de CAL-01 y por píxel RGBA sin alfa ni signo de byte" {
        Calidad.luminancia(255, 255, 255) shouldBe 255
        Calidad.luminancia(0, 0, 0) shouldBe 0
        Calidad.luminancia(1, 0, 0) shouldBe 0
        Calidad.luminancia(0, 1, 0) shouldBe 1
        Calidad.luminancia(0, 0, 4) shouldBe 0
        Calidad.luminancia(0, 0, 5) shouldBe 1
        Calidad.luminancia(100, 50, 25) shouldBe 62
        val p = byteArrayOf(200.toByte(), 100, 50, 7, 0, 0, 0, 255.toByte(), 0, 0, 255.toByte(), 0)
        Calidad.luminanciasFrame(p, 3, 1).toList() shouldBe listOf(124, 0, 29)
    }

    "NAT-03 área con signo: positiva en sentido horario de pantalla y negativa al invertir" {
        Calidad.areaConSigno(rect(0.0, 0.0, 2.0, 3.0)) shouldBe 6.0
        Calidad.areaConSigno(rect(0.0, 0.0, 2.0, 3.0).reversed()) shouldBe -6.0
        Calidad.areaConSigno(listOf(Punto(1.0, 1.0), Punto(4.0, 1.0), Punto(4.0, 1.0), Punto(1.0, 3.0))) shouldBe 3.0
    }

    "NAT-03 región M (CAL-02): centros de píxel dentro, bordes inclusivos, recorte al frame y medios píxeles" {
        val (m1, n1) = Calidad.calcularRegion(rect(1.0, 1.0, 3.0, 2.0), 4, 3).shouldNotBeNull()
        n1 shouldBe 2
        indices(m1) shouldBe listOf(5, 6)
        // Medio píxel: los centros 0,5 y 3,5 caen en el borde y cuentan (tolerancia >= -1e-9).
        val (m2, n2) = Calidad.calcularRegion(rect(0.5, 0.5, 3.5, 2.5), 4, 3).shouldNotBeNull()
        n2 shouldBe 12
        indices(m2).sum() shouldBe 66
        // Fuera del frame por arriba y por la izquierda: solo la parte visible.
        val (m3, n3) = Calidad.calcularRegion(rect(-10.0, -10.0, 2.0, 1.0), 4, 3).shouldNotBeNull()
        n3 shouldBe 2
        indices(m3) shouldBe listOf(0, 1)
        // Fuera por abajo y por la derecha.
        val (m4, n4) = Calidad.calcularRegion(rect(2.5, 1.5, 9.0, 9.0), 4, 3).shouldNotBeNull()
        n4 shouldBe 4
        indices(m4) shouldBe listOf(6, 7, 10, 11)
        // El orden de los vértices (signo del área) no cambia M.
        indices(Calidad.calcularRegion(rect(1.0, 1.0, 3.0, 2.0).reversed(), 4, 3).shouldNotBeNull().first) shouldBe listOf(5, 6)
        // Un solo píxel: el centro (2,5; 1,5) dentro de [2,3]x[1,2].
        indices(Calidad.calcularRegion(rect(2.0, 1.0, 3.0, 2.0), 4, 3).shouldNotBeNull().first) shouldBe listOf(6)
    }

    "NAT-03 región M inválida: sin 4 vértices finitos, cóncava, de área 0 o sin ningún centro de píxel" {
        Calidad.calcularRegion(rect(0.0, 0.0, 4.0, 3.0).take(3), 4, 3) shouldBe null
        Calidad.calcularRegion(rect(0.0, 0.0, 4.0, 3.0) + Punto(1.0, 1.0), 4, 3) shouldBe null
        Calidad.calcularRegion(listOf(Punto(0.0, 0.0), Punto(4.0, 0.0), Punto(4.0, Double.NaN), Punto(0.0, 3.0)), 4, 3) shouldBe null
        Calidad.calcularRegion(listOf(Punto(0.0, 0.0), Punto(Double.POSITIVE_INFINITY, 0.0), Punto(4.0, 3.0), Punto(0.0, 3.0)), 4, 3) shouldBe null
        Calidad.calcularRegion(listOf(Punto(0.0, 0.0), Punto(4.0, 0.0), Punto(1.0, 1.0), Punto(0.0, 4.0)), 4, 4) shouldBe null
        Calidad.calcularRegion(listOf(Punto(0.0, 0.0), Punto(1.0, 0.0), Punto(2.0, 0.0), Punto(3.0, 0.0)), 4, 3) shouldBe null
        Calidad.calcularRegion(rect(0.6, 0.6, 1.4, 1.4), 4, 3) shouldBe null
        Calidad.calcularRegion(rect(10.0, 10.0, 20.0, 20.0), 4, 3) shouldBe null
    }

    "NAT-03 nitidez (CAL-03): varianza poblacional del Laplaciano de 4 vecinos solo en M y sin el borde del frame" {
        // Damero 60/190 de 4x4: Laplaciano +-520 en los 4 píxeles interiores.
        val l = IntArray(16) { i -> if ((i % 4 + i / 4) % 2 == 1) 190 else 60 }
        val todo = ByteArray(16) { 1 }
        Calidad.medirNitidez(l, todo, 4, 4, u) shouldBe MetricaNitidez(270400.0, 100)
        // Solo dos interiores de M (5 y 6): media 0 y la misma varianza; solo el 5: varianza 0.
        val m = ByteArray(16).also { it[5] = 1; it[6] = 1; it[0] = 1; it[15] = 1 }
        Calidad.medirNitidez(l, m, 4, 4, u) shouldBe MetricaNitidez(270400.0, 100)
        Calidad.medirNitidez(l, ByteArray(16).also { it[5] = 1 }, 4, 4, u) shouldBe MetricaNitidez(0.0, 0)
        // Sin interiores en M (solo borde): varianza 0.
        Calidad.medirNitidez(l, ByteArray(16).also { it[0] = 1; it[3] = 1; it[12] = 1 }, 4, 4, u) shouldBe MetricaNitidez(0.0, 0)
        val lin = intArrayOf(0, 0, 0, 0, 0, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)
        Calidad.medirNitidez(lin, todo, 4, 4, u.copy(laplacianoDesenfocado = 0.0, laplacianoNitido = 10_000.0)).let { (v, s) ->
            // Interiores 5, 6, 9, 10: -40, 10, 10, 0 -> media -5, varianza (1225 + 225 + 225 + 25) / 4 = 425.
            v shouldBe 425.0
            s shouldBe 4
        }
    }

    "NAT-03 reflejo (CAL-04): componentes 4-conexos sin saltar de fila ni por diagonal, solo dentro de M" {
        val uu = u.copy(fraccionSaturadaMax = 1.0, componenteSaturadoMax = 0.5)
        fun l(vararg sat: Int) = IntArray(6) { if (it in sat) 255 else 0 }
        val todo = ByteArray(6) { 1 }
        // 3x2: 2 (x=2, y=0) y 3 (x=0, y=1) son consecutivos en memoria pero no vecinos.
        Calidad.medirReflejo(l(2, 3), todo, 3, 2, 6, uu) shouldBe MetricaReflejo(2.0 / 6, 1.0 / 6, 67)
        Calidad.medirReflejo(l(0, 4), todo, 3, 2, 6, uu) shouldBe MetricaReflejo(2.0 / 6, 1.0 / 6, 67)
        Calidad.medirReflejo(l(0, 1), todo, 3, 2, 6, uu) shouldBe MetricaReflejo(2.0 / 6, 2.0 / 6, 33)
        Calidad.medirReflejo(l(1, 4), todo, 3, 2, 6, uu) shouldBe MetricaReflejo(2.0 / 6, 2.0 / 6, 33)
        Calidad.medirReflejo(l(0, 1, 2, 5), todo, 3, 2, 6, uu) shouldBe MetricaReflejo(4.0 / 6, 4.0 / 6, 0)
        // Fuera de M no cuenta ni conecta; el tamaño de M es el denominador.
        val m = byteArrayOf(1, 0, 1, 1, 1, 1)
        Calidad.medirReflejo(l(0, 1, 2), m, 3, 2, 5, uu) shouldBe MetricaReflejo(2.0 / 5, 1.0 / 5, 60)
        // Umbral de saturación inclusivo (250) con los umbrales por omisión: 1 de 6 ya rebasa fraccionSaturadaMax.
        Calidad.medirReflejo(IntArray(6) { if (it == 0) 250 else 249 }, todo, 3, 2, 6, u) shouldBe MetricaReflejo(1.0 / 6, 1.0 / 6, 0)
        Calidad.medirReflejo(IntArray(6) { 249 }, todo, 3, 2, 6, u) shouldBe MetricaReflejo(0.0, 0.0, 100)
    }

    "NAT-03 exposición (CAL-05): media y fracción oscura sobre M (oscuro inclusivo) y subscores de rampa" {
        val uu = u.copy(fraccionOscuraMax = 1.0)
        Calidad.medirExposicion(intArrayOf(5, 6, 109, 255), byteArrayOf(1, 1, 1, 0), 3, uu) shouldBe MetricaExposicion(40.0, 1.0 / 3, 50, 100)
        Calidad.medirExposicion(intArrayOf(220, 220), byteArrayOf(1, 1), 2, u) shouldBe MetricaExposicion(220.0, 0.0, 100, 50)
        Calidad.medirExposicion(intArrayOf(4, 100), byteArrayOf(1, 1), 2, u) shouldBe MetricaExposicion(52.0, 0.5, 0, 100)
    }

    "NAT-03 tamaño (CAL-06): área relativa del cuadrilátero y rampa entre ratioMinimo y ratioOk" {
        Calidad.medirTamano(rect(0.0, 0.0, 2.0, 3.0), 4, 3, u) shouldBe MetricaTamano(0.5, 100)
        Calidad.medirTamano(rect(0.0, 0.0, 2.0, 3.0).reversed(), 4, 3, u) shouldBe MetricaTamano(0.5, 100)
        Calidad.medirTamano(rect(0.0, 0.0, 2.0, 1.2), 4, 3, u).let { (ratio, s) ->
            ratio shouldBe (0.2 plusOrMinus 1e-12)
            s shouldBe 50
        }
    }

    "NAT-03 frame inválido: dimensiones no positivas o búfer de otro tamaño" {
        val det = DeteccionDocumento(rect(0.0, 0.0, 2.0, 2.0), DeteccionDocumento.Fuente.GUIA)
        for (f in listOf(FrameAnalisis(0, 2, ByteArray(0), 2, 2), FrameAnalisis(2, 0, ByteArray(0), 2, 2), FrameAnalisis(-2, -2, ByteArray(16), 2, 2), FrameAnalisis(2, 2, ByteArray(15), 2, 2), FrameAnalisis(2, 2, ByteArray(17), 2, 2))) {
            Calidad.analizarFrame(f, det, u) shouldBe ResultadoAnalisis.Error("frame-invalido")
        }
        ok(Calidad.analizarFrame(FrameAnalisis(2, 2, gris(9, 9, 9, 9), 2, 2), det, u)).metricas.shouldNotBeNull()
    }

    "NAT-03 sin documento: cuadrilátero null da score 0 y acerca sin métricas; inválido da cuadrilatero-invalido" {
        val f = FrameAnalisis(4, 4, gris(*IntArray(16) { 128 }), 4, 4)
        Calidad.analizarFrame(f, DeteccionDocumento(null, DeteccionDocumento.Fuente.MODELO), u) shouldBe ResultadoAnalisis.Ok(ResultadoCalidad(0, Motivo.ACERCA, null))
        Calidad.analizarFrame(f, DeteccionDocumento(rect(0.6, 0.6, 1.4, 1.4), DeteccionDocumento.Fuente.GUIA), u) shouldBe ResultadoAnalisis.Error("cuadrilatero-invalido")
    }

    "NAT-03 score (CAL-07): mínimo de subscores y empates por el orden de Motivo (acerca, oscuro, sobreexpuesto, reflejo, desenfocado)" {
        val todo = rect(0.0, 0.0, 4.0, 4.0)
        fun cal(v: IntArray, fuente: DeteccionDocumento.Fuente = DeteccionDocumento.Fuente.GUIA, c: Cuadrilatero = todo) =
            ok(Calidad.analizarFrame(FrameAnalisis(4, 4, gris(*v), 4, 4), DeteccionDocumento(c, fuente), u))
        // Gris uniforme: solo la nitidez limita.
        cal(IntArray(16) { 128 }) shouldBe ResultadoCalidad(0, Motivo.DESENFOCADO, MetricasCalidad(MetricaNitidez(0.0, 0), MetricaReflejo(0.0, 0.0, 100), MetricaExposicion(128.0, 0.0, 100, 100), null))
        // Negro: empate nitidez-oscuro (0 y 0) lo gana oscuro; con fuente modelo y tamaño 100, igual.
        cal(IntArray(16)).motivo shouldBe Motivo.OSCURO
        cal(IntArray(16), DeteccionDocumento.Fuente.MODELO).let {
            it.motivo shouldBe Motivo.OSCURO
            it.metricas!!.tamano shouldBe MetricaTamano(1.0, 100)
        }
        // Negro con un cuadrilátero de 1 píxel y fuente modelo: todo 0 salvo reflejo y sobreexpuesto; gana acerca.
        cal(IntArray(16), DeteccionDocumento.Fuente.MODELO, rect(0.0, 0.0, 1.0, 1.0)) shouldBe
            ResultadoCalidad(0, Motivo.ACERCA, MetricasCalidad(MetricaNitidez(0.0, 0), MetricaReflejo(0.0, 0.0, 100), MetricaExposicion(0.0, 1.0, 0, 100), MetricaTamano(0.0625, 0)))
        // Blanco: empate nitidez-reflejo-sobreexpuesto en 0; gana sobreexpuesto.
        cal(IntArray(16) { 255 }).let {
            it.motivo shouldBe Motivo.SOBREEXPUESTO
            it.metricas!!.reflejo shouldBe MetricaReflejo(1.0, 1.0, 0)
        }
        // Damero 60/190: todo en 100, sin motivo.
        cal(IntArray(16) { i -> if ((i % 4 + i / 4) % 2 == 1) 190 else 60 }) shouldBe
            ResultadoCalidad(100, null, MetricasCalidad(MetricaNitidez(270400.0, 100), MetricaReflejo(0.0, 0.0, 100), MetricaExposicion(125.0, 0.0, 100, 100), null))
    }

    "NAT-03 AnalizadorCalidad: frame o guía inválidos dan null; sin documento en la guía nunca llega al umbral; no toca los píxeles" {
        val a = AnalizadorCalidad()
        a.evaluar(FrameAnalisis(2, 2, ByteArray(3), 2, 2)) shouldBe null
        a.evaluar(FrameAnalisis(4, 4, gris(*IntArray(16) { 128 }), 4, 4, Caja(0.6, 0.6, 0.8, 0.8))) shouldBe null
        val d = gris(*IntArray(16) { i -> if ((i % 4 + i / 4) % 2 == 1) 190 else 60 })
        val copia = d.copyOf()
        val metricas = MetricasCalidad(MetricaNitidez(270400.0, 100), MetricaReflejo(0.0, 0.0, 100), MetricaExposicion(125.0, 0.0, 100, 100), null)
        val esperado = AnalizadorCalidad.Evaluacion(ResultadoCalidad(69, Motivo.ACERCA, metricas), null, rect(0.0, 0.0, 4.0, 4.0))
        a.evaluar(FrameAnalisis(4, 4, d, 4, 4, Caja(0.0, 0.0, 4.0, 4.0))) shouldBe esperado
        a.evaluarCompleto(d, 4, 4, Caja(0.0, 0.0, 4.0, 4.0)) shouldBe esperado
        d.toList() shouldBe copia.toList()
    }

    "NAT-03 score en el umbral: score == umbralListo no tiene motivo; uno menos sí" {
        val d = IntArray(16) { i -> if ((i % 4 + i / 4) % 2 == 1) 190 else 60 }
        val det = DeteccionDocumento(rect(0.0, 0.0, 4.0, 4.0), DeteccionDocumento.Fuente.GUIA)
        // Media 125: con mediaClaraOk 25 y mediaBlanca 225 el subscore sobreexpuesto es 100 - 50 = 50.
        val uu = u.copy(mediaClaraOk = 25.0, mediaBlanca = 225.0)
        ok(Calidad.analizarFrame(FrameAnalisis(4, 4, gris(*d), 4, 4), det, uu.copy(umbralListo = 50))).let {
            it.score shouldBe 50
            it.motivo shouldBe null
        }
        ok(Calidad.analizarFrame(FrameAnalisis(4, 4, gris(*d), 4, 4), det, uu.copy(umbralListo = 51))).let {
            it.score shouldBe 50
            it.motivo shouldBe Motivo.SOBREEXPUESTO
        }
    }
})
