package io.github.jorgeluissanchez.lectorcedula.mrz

import io.github.jorgeluissanchez.lectorcedula.mrz.LocalizarMrz.CajaMrz
import io.github.jorgeluissanchez.lectorcedula.mrz.PlanMrz.EvidenciaVista
import io.kotest.assertions.throwables.shouldThrow
import io.kotest.core.spec.style.StringSpec
import io.kotest.matchers.collections.shouldContainAll
import io.kotest.matchers.shouldBe
import io.kotest.matchers.types.shouldBeSameInstanceAs

/**
 * NAT-06 (sdk-nativo, tarea 1.5), unitarias del plan de vistas y de la imagen que recibe el OCR con los literales de
 * las pruebas web (`packages/capture/test/mrz`: orientacion, enderezar, lector). fixture-sintetico: [EscenasMrz].
 */
class PlanMrzNat06Test : StringSpec({
    fun img(w: Int, h: Int, f: (Int) -> Int) = ImagenRgba(ByteArray(w * h * 4) { f(it).toByte() }, w, h)

    "NAT-06 Giros de 90, 180 y 270 grados en sentido horario (LMI-12, LMI-12c)" {
        // 2x1: píxel A (1) a la izquierda, B (2) a la derecha.
        val p = img(2, 1) { if (it < 4) 1 else 2 }
        PlanMrz.girar(p, 90).let { listOf(it.ancho, it.alto, it.datos[0].toInt(), it.datos[4].toInt()) } shouldBe listOf(1, 2, 1, 2)
        PlanMrz.girar(p, 270).let { listOf(it.ancho, it.alto, it.datos[0].toInt(), it.datos[4].toInt()) } shouldBe listOf(1, 2, 2, 1)
        PlanMrz.girar(p, 180).let { listOf(it.ancho, it.alto, it.datos[0].toInt(), it.datos[4].toInt()) } shouldBe listOf(2, 1, 2, 1)
        // 90 + 270 y 180 + 180 son la identidad, y no se modifica la entrada.
        val t = EscenasMrz.tarjeta(60, 38, 3, 30)
        val copia = t.datos.copyOf()
        PlanMrz.girar(PlanMrz.girar(t, 90), 270).datos.toList() shouldBe t.datos.toList()
        PlanMrz.girar(PlanMrz.girar(t, 180), 180).datos.toList() shouldBe t.datos.toList()
        t.datos.toList() shouldBe copia.toList()
        shouldThrow<IllegalArgumentException> { PlanMrz.girar(t, 45) }
    }

    "NAT-06 LMI-14c Vistas opuestas comparten el eje: una ventana de más en la opuesta no la adelanta" {
        fun n(g: Int) = EvidenciaVista(g, 0, null)
        PlanMrz.ordenVistasPorEvidencia(listOf(EvidenciaVista(0, 5, 0.86), n(90), n(270), EvidenciaVista(180, 6, 0.14))) shouldBe listOf(0, 180, 90, 270)
        PlanMrz.ordenVistasPorEvidencia(listOf(EvidenciaVista(0, 6, 0.14), n(90), n(270), EvidenciaVista(180, 5, 0.86))) shouldBe listOf(180, 0, 90, 270)
    }

    "NAT-06 LMI-14c El eje con más ventanas va primero; dentro del eje decide la evidencia" {
        PlanMrz.ordenVistasPorEvidencia(
            listOf(EvidenciaVista(0, 1, 0.41), EvidenciaVista(90, 6, 0.19), EvidenciaVista(270, 5, 0.81), EvidenciaVista(180, 1, 0.6)),
        ) shouldBe listOf(270, 90, 180, 0)
    }

    "NAT-06 LMI-14b Sin evidencia el orden es el de entrada (derecha, 90, 270, 180)" {
        PlanMrz.ordenVistasPorEvidencia(listOf(0, 90, 270, 180).map { EvidenciaVista(it, 0, null) }) shouldBe listOf(0, 90, 270, 180)
        PlanMrz.ordenVistasPorEvidencia(listOf(EvidenciaVista(0, 0, null), EvidenciaVista(90, 0, 0.3))) shouldBe listOf(90, 0)
    }

    "NAT-06 Redondeos de la web: Math.round hacia +infinito y Uint8ClampedArray a la mitad par" {
        listOf(2.5, -2.5, 0.49, -1.5, 3.0).map { PlanMrz.redondearJs(it) } shouldBe listOf(3.0, -2.0, 0.0, -1.0, 3.0)
        listOf(0.5, 1.5, 2.5, 254.5, -3.0, 300.0, Double.NaN, 7.4).map { VistaOcr.aUint8Clamp(it) } shouldBe listOf(0, 2, 2, 254, 0, 255, 0, 7)
    }

    "NAT-06 Ángulos del enderezado: 33, de menor a mayor giro (LMI-06)" {
        val a = VistaOcr.angulosProbados().toList()
        a.size shouldBe 33
        a.take(5) shouldBe listOf(0.0, 0.25, -0.25, 0.5, -0.5)
        a.takeLast(2) shouldBe listOf(4.0, -4.0)
    }

    "NAT-06 Enderezado: estima la inclinación con signo y paso de 0,25 grados" {
        listOf(2.0, -2.0, 0.0, 1.25, -3.75).map { VistaOcr.estimarInclinacion(EscenasMrz.barras(it)) } shouldBe listOf(2.0, -2.0, 0.0, 1.25, -3.75)
        VistaOcr.estimarInclinacion(img(10, 10) { 255.toByte().toInt() }) shouldBe 0.0
    }

    "NAT-06 Enderezado: no gira por debajo de 0,5 grados y gira en sentido contrario por encima" {
        val recta = EscenasMrz.barras(0.25)
        VistaOcr.enderezar(recta) shouldBeSameInstanceAs recta
        val inclinada = EscenasMrz.barras(2.0)
        val derecha = VistaOcr.enderezar(inclinada)
        VistaOcr.estimarInclinacion(derecha) shouldBe 0.0
        listOf(derecha.ancho, derecha.alto) shouldBe listOf(400, 200)
    }

    "NAT-06 Recorte ampliado: a 900 px de ancho si es más estrecho, sin ampliar si es más ancho (LMI-04)" {
        val t = EscenasMrz.tarjeta(400, 252, 3, 30)
        VistaOcr.recortarYAmpliar(t, CajaMrz(10, 150, 300, 60)).let { listOf(it.ancho, it.alto) } shouldBe listOf(900, 180)
        val r = VistaOcr.recortarYAmpliar(t, CajaMrz(0, 0, 400, 252))
        listOf(r.ancho, r.alto) shouldBe listOf(900, 567)
        val ancha = EscenasMrz.tarjeta(1000, 200, 3, 30)
        val copia = VistaOcr.recortarYAmpliar(ancha, CajaMrz(0, 100, 1000, 50))
        copia.datos.toList() shouldBe ancha.datos.copyOfRange(100 * 1000 * 4, 150 * 1000 * 4).toList()
    }

    "NAT-06 Plan TD1: cuatro vistas, candidatos de LMI-01 primero y ventanas literales después (LMI-12b)" {
        val t = EscenasMrz.tarjeta(600, 378, 3, 30, 12)
        val plan = PlanMrz.intentosTd1(t).toList()
        plan.map { it.giro }.toSet() shouldBe setOf(0, 90, 270, 180)
        // La tarjeta derecha tiene la MRZ abajo: la vista derecha va primero y empieza por la proyección.
        plan.first().giro shouldBe 0
        plan.first().candidato.metodo shouldBe MetodoMrz.PROYECCION
        plan.first().nombre shouldBe "proyeccion"
        plan.map { it.nombre }.toSet() shouldContainAll listOf("recorte-inferior", "imagen-completa", "franja", "franja@90", "franja@180", "franja@270")
        // Sin cajas repetidas dentro de una vista.
        for (g in listOf(0, 90, 270, 180)) plan.filter { it.giro == g }.map { it.candidato.caja }.let { it.size shouldBe it.toSet().size }
        // Las ventanas literales de LMI-11 van todas en la segunda pasada.
        val literal = { i: IntentoPlan -> i.candidato.metodo == MetodoMrz.FRANJA && i.candidato.caja in LocalizarMrz.ventanasFranja(i.imagen.ancho, i.imagen.alto) }
        val primera = plan.indexOfFirst(literal)
        plan.drop(primera).all(literal) shouldBe true
    }

    "NAT-06 Giro de 180 y de pie: la vista que pone la MRZ derecha y abajo va primero (LMI-14b)" {
        val t = EscenasMrz.tarjeta(600, 378, 3, 30, 12)
        for ((giro, primera) in listOf(180 to 180, 90 to 270, 270 to 90)) {
            PlanMrz.intentosTd1(PlanMrz.girar(t, giro)).first().giro shouldBe primera
        }
    }

    "NAT-06 Plan TD3: las cajas del par de 44 primero, en la vista con el par más bajo (OD-21)" {
        val t = EscenasMrz.tarjeta(600, 378, 2, 44, 12)
        for (giro in listOf(0, 90, 180, 270)) {
            val p = if (giro == 0) t else PlanMrz.girar(t, giro)
            val plan = PlanMrz.intentosTd3(p).toList()
            plan.first().giro shouldBe (360 - giro) % 360
            plan.first().candidato.metodo shouldBe MetodoMrz.FRANJA
            plan.map { it.giro }.toSet() shouldBe setOf(0, 90, 270, 180)
            PlanMrz.intentos(p, FormatoMrz.TD3).map { it.nombre }.toList() shouldBe plan.map { it.nombre }
        }
    }

    "NAT-06 Imagen inválida" {
        shouldThrow<IllegalArgumentException> { ImagenRgba(ByteArray(3), 1, 1) }
        shouldThrow<IllegalArgumentException> { ImagenRgba(ByteArray(0), 0, 0) }
    }
})
