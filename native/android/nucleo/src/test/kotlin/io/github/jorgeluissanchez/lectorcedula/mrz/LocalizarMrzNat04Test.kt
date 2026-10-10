package io.github.jorgeluissanchez.lectorcedula.mrz

import io.github.jorgeluissanchez.lectorcedula.mrz.LocalizarMrz.Banda
import io.github.jorgeluissanchez.lectorcedula.mrz.LocalizarMrz.CajaMrz
import io.kotest.core.spec.style.StringSpec
import io.kotest.matchers.shouldBe

/**
 * NAT-04 (contenido MRZ de la presencia, tarea 1.3): piezas de la localización de LMI-11/LMI-14 con valores literales
 * de la spec y de `packages/capture/src/mrz/localizar.ts`. La localización completa se compara con el oráculo en el
 * golden ([io.github.jorgeluissanchez.lectorcedula.calidad.CalidadGoldenNat03Test]).
 */
class LocalizarMrzNat04Test : StringSpec({
    "NAT-04 luminancia LMI (306 R + 601 G + 117 B) >> 10 con bytes sin signo y sin alfa" {
        val p = byteArrayOf(-1, -1, -1, 0, 200.toByte(), 100, 50, -1, 0, 0, -1, 9, 1, 1, 1, 0, 0, 1, 0, 0)
        LocalizarMrz.luminancias(p, 5).toList() shouldBe listOf(255, 124, 29, 1, 0)
        LocalizarMrz.luminancias(p, 2).toList() shouldBe listOf(255, 124)
    }

    "NAT-04 giro de luminancias 90, 180 y 270 grados en sentido horario con sus dimensiones" {
        val l = intArrayOf(0, 1, 2, 3, 4, 5) // 3x2
        LocalizarMrz.girar(l, 3, 2, 90).let { (d, w, h) -> Triple(d.toList(), w, h) } shouldBe Triple(listOf(3, 0, 4, 1, 5, 2), 2, 3)
        LocalizarMrz.girar(l, 3, 2, 180).let { (d, w, h) -> Triple(d.toList(), w, h) } shouldBe Triple(listOf(5, 4, 3, 2, 1, 0), 3, 2)
        LocalizarMrz.girar(l, 3, 2, 270).let { (d, w, h) -> Triple(d.toList(), w, h) } shouldBe Triple(listOf(2, 5, 1, 4, 0, 3), 2, 3)
        l.toList() shouldBe listOf(0, 1, 2, 3, 4, 5)
    }

    "NAT-04 bandas regulares (LMI-01b): altos dentro del 35 % de la media y separaciones dentro del 25 %" {
        Banda(3, 7).alto shouldBe 5
        Banda(3, 7).dobleCentro shouldBe 10
        val a = Banda(0, 9)
        val b = Banda(20, 29)
        LocalizarMrz.bandasRegulares(a, b, Banda(40, 49)) shouldBe true
        LocalizarMrz.bandasRegulares(a, b, Banda(40, 52)) shouldBe true
        LocalizarMrz.bandasRegulares(a, b, Banda(40, 53)) shouldBe false
        LocalizarMrz.bandasRegulares(Banda(0, 6), Banda(20, 29), Banda(40, 49)) shouldBe true
        LocalizarMrz.bandasRegulares(Banda(0, 5), Banda(20, 29), Banda(40, 49)) shouldBe false
        LocalizarMrz.bandasRegulares(a, b, Banda(45, 54)) shouldBe true
        LocalizarMrz.bandasRegulares(a, b, Banda(46, 55)) shouldBe false
        LocalizarMrz.bandasRegulares(a, b, Banda(36, 45)) shouldBe true
        LocalizarMrz.bandasRegulares(a, b, Banda(35, 44)) shouldBe false
    }

    "NAT-04 trío MRZ horizontal (LMI-14): al menos 20 tramos y relación tramos x alto / ancho en [0,5; 2,5]" {
        LocalizarMrz.esTrioMrzHorizontal(intArrayOf(19, 30, 30), 10.0, 100) shouldBe false
        LocalizarMrz.esTrioMrzHorizontal(intArrayOf(30, 20, 30), 10.0, 100) shouldBe true
        LocalizarMrz.esTrioMrzHorizontal(intArrayOf(20, 30, 30), 10.0, 400) shouldBe true
        LocalizarMrz.esTrioMrzHorizontal(intArrayOf(20, 30, 30), 10.0, 401) shouldBe false
        LocalizarMrz.esTrioMrzHorizontal(intArrayOf(20, 30, 30), 10.0, 80) shouldBe true
        LocalizarMrz.esTrioMrzHorizontal(intArrayOf(20, 30, 30), 10.0, 79) shouldBe false
    }

    "NAT-04 ventanas de franja (LMI-11): 15 %, 30 % y 45 % del alto, de abajo arriba con paso del 5 %" {
        val v = LocalizarMrz.ventanasFranja(5, 20)
        v.size shouldBe 45
        v[0] shouldBe CajaMrz(0, 17, 5, 3)
        v[17] shouldBe CajaMrz(0, 0, 5, 3)
        v[18] shouldBe CajaMrz(0, 14, 5, 6)
        v[32] shouldBe CajaMrz(0, 0, 5, 6)
        v[33] shouldBe CajaMrz(0, 11, 5, 9)
        v.last() shouldBe CajaMrz(0, 0, 5, 9)
        // Paso 2 (redondeo de 1,5) y alto 5 (redondeo de 4,5): la última ventana se ajusta a y = 0.
        val w = LocalizarMrz.ventanasFranja(7, 30)
        w.size shouldBe 35
        w.take(14).map { it.y } shouldBe listOf(25, 23, 21, 19, 17, 15, 13, 11, 9, 7, 5, 3, 1, 0)
        w.take(14).all { it.alto == 5 && it.ancho == 7 && it.x == 0 } shouldBe true
        w.drop(26).map { it.y to it.alto } shouldBe listOf(16, 14, 12, 10, 8, 6, 4, 2, 0).map { it to 14 }
        LocalizarMrz.ventanasFranja(4, 1) shouldBe List(3) { CajaMrz(0, 0, 4, 1) }
    }

    "NAT-04 sin bordes no hay trío ni par: evidencia nula con 0 ventanas" {
        val plano = IntArray(60 * 40) { 128 }
        LocalizarMrz.evidenciaTd1(plano, 60, 40) shouldBe LocalizarMrz.Evidencia(null, 0)
        LocalizarMrz.evidenciaTd3(plano, 60, 40) shouldBe LocalizarMrz.Evidencia(null, 0)
        LocalizarMrz.analizarVentana(plano, 60, 40, CajaMrz(0, 0, 60, 40)) shouldBe null
        LocalizarMrz.parTd3(plano, 60, 40, CajaMrz(0, 0, 60, 40)) shouldBe null
    }
})
