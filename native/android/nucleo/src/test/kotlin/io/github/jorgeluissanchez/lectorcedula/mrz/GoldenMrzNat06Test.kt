package io.github.jorgeluissanchez.lectorcedula.mrz

import io.github.jorgeluissanchez.lectorcedula.mrz.LocalizarMrz.CajaMrz
import io.kotest.assertions.throwables.shouldThrow
import io.kotest.core.spec.style.StringSpec
import io.kotest.matchers.shouldBe
import io.kotest.matchers.types.shouldNotBeSameInstanceAs
import java.io.ByteArrayInputStream
import java.io.InputStream

/**
 * NAT-06 (tarea 1.5), golden del plan de vistas y de la imagen del OCR: valores literales calculados con
 * `packages/capture` (web, Node) sobre las mismas imágenes sintéticas de [EscenasMrz] (cuyas huellas también se fijan).
 * Es el oráculo independiente que las pruebas de mutación (`KM`) usan sin QuickJS ni Tesseract. Regenerar solo si la
 * web cambia, con el mismo cálculo en Node (huella FNV-1a de 32 bits de los bytes RGBA).
 */
class GoldenMrzNat06Test : StringSpec({
    fun h(p: ImagenRgba) = "${p.ancho}x${p.alto}:${huella(p.datos)}"
    fun caja(c: CajaMrz) = "${c.x},${c.y},${c.ancho},${c.alto}"
    fun cand(c: CandidatoMrz) = "${c.metodo.codigo}:${caja(c.caja)}"
    val t1 = EscenasMrz.tarjeta(600, 378, 3, 30, 12)
    val t3 = EscenasMrz.tarjeta(600, 378, 2, 44, 12)
    val b2 = EscenasMrz.barras(2.0, 400, 200)
    val b3 = EscenasMrz.barras(-3.3, 300, 160)

    "NAT-06 Golden: las entradas sintéticas son las mismas que en la web" {
        listOf(h(t1), h(t3), h(b2), h(b3)) shouldBe listOf("600x378:3090675333", "600x378:4112497989", "400x200:4284563381", "300x160:4241525685")
    }

    "NAT-06 Golden: umbral de Otsu" {
        listOf(PlanMrz.umbralOtsu(PlanMrz.luminancias(t1)), PlanMrz.umbralOtsu(PlanMrz.luminancias(b3)), PlanMrz.umbralOtsu(intArrayOf(10, 10, 200, 200, 90))) shouldBe listOf(30, 0, 90)
        PlanMrz.umbralOtsu(intArrayOf(7, 7, 7)) shouldBe null
    }

    "NAT-06 Golden: candidatos, proyección y evidencia TD1 (LMI-01, LMI-11, LMI-14a)" {
        val l = PlanMrz.localizarConEvidencia(t1)
        l.candidatos.size shouldBe 48
        l.candidatos.take(5).map { cand(it) } shouldBe listOf(
            "proyeccion:24,268,543,68",
            "recorte-inferior:0,227,600,151",
            "imagen-completa:0,0,600,378",
            "franja:0,321,600,57",
            "franja:0,302,600,57",
        )
        l.evidencia shouldBe 0.798941798941799
        l.ventanasMrz shouldBe 6
        val g = PlanMrz.localizarConEvidencia(PlanMrz.girar(t1, 90))
        g.candidatos.take(3).map { cand(it) } shouldBe listOf("proyeccion:43,511,66,55", "recorte-inferior:0,360,378,240", "imagen-completa:0,0,378,600")
        g.evidencia shouldBe null
        g.ventanasMrz shouldBe 0
    }

    "NAT-06 Golden: par TD3 (OD-20)" {
        val e = PlanMrz.evidenciaTd3(t3)
        e.evidencia shouldBe 0.8267195767195767
        e.ventanasMrz shouldBe 7
        e.candidatos.take(3).map { caja(it.caja) } shouldBe listOf("23,290,547,46", "23,290,547,46", "23,290,547,46")
    }

    "NAT-06 Golden: recorte ampliado (LMI-04), giro bilineal e inclinación (LMI-06)" {
        h(VistaOcr.recortarYAmpliar(t1, CajaMrz(37, 201, 173, 49))) shouldBe "900x255:1511255013"
        h(VistaOcr.recortarYAmpliar(t1, CajaMrz(3, 5, 599, 77))) shouldBe "900x116:1418689861"
        listOf(h(VistaOcr.girarGris(b2, -2.0)), h(VistaOcr.girarGris(b3, 3.3)), h(VistaOcr.girarGris(t1, 1.75))) shouldBe
            listOf("400x200:2954902040", "300x160:1977829073", "600x378:785008935")
        listOf(VistaOcr.estimarInclinacion(b2), VistaOcr.estimarInclinacion(b3), VistaOcr.estimarInclinacion(t1)) shouldBe listOf(2.0, -3.5, 0.0)
        listOf(h(VistaOcr.enderezar(b2)), h(VistaOcr.enderezar(b3))) shouldBe listOf("400x200:2954902040", "300x160:492630171")
        val media = EscenasMrz.barras(0.5)
        VistaOcr.enderezar(media) shouldNotBeSameInstanceAs media
    }

    "NAT-06 Golden: plan de la tarjeta de pie con las vistas que recibe el OCR (LMI-12b, LMI-14b)" {
        PlanMrz.intentosTd1(PlanMrz.girar(t1, 90)).take(6).map { "${it.giro}:${cand(it.candidato)}:${h(VistaOcr.paraOcr(it))}" }.toList() shouldBe listOf(
            "270:proyeccion:24,268,543,68:900x113:3265272197",
            "270:recorte-inferior:0,227,600,151:900x227:1973184717",
            "270:imagen-completa:0,0,600,378:900x567:1643419765",
            "270:franja:23,268,544,68:900x113:1964279021",
            "90:recorte-inferior:0,227,600,151:900x227:1460447077",
            "90:imagen-completa:0,0,600,378:900x567:63882229",
        )
        PlanMrz.intentosTd3(PlanMrz.girar(t3, 180)).take(3).map { "${it.giro}:${cand(it.candidato)}" }.toList() shouldBe
            listOf("180:franja:23,290,547,46", "0:franja:29,42,547,46", "180:recorte-inferior:0,227,600,151")
    }

    "NAT-06 Golden: empate de evidencia conserva el orden de entrada" {
        PlanMrz.ordenVistasPorEvidencia(listOf(PlanMrz.EvidenciaVista(0, 0, 0.5), PlanMrz.EvidenciaVista(90, 0, 0.5), PlanMrz.EvidenciaVista(270, 0, 0.7))) shouldBe listOf(270, 0, 90)
    }

    "NAT-06 Límites: imagen de un solo lado nulo, topes de 1 y modelo desde el cargador" {
        shouldThrow<IllegalArgumentException> { ImagenRgba(ByteArray(0), 0, 1) }
        shouldThrow<IllegalArgumentException> { ImagenRgba(ByteArray(0), 1, 0) }
        ImagenRgba(ByteArray(4), 1, 1).ancho shouldBe 1
        val falso = EvaluadorTexto { _, _ -> EvaluacionTexto.Invalida("mrz-no-encontrada", null) }
        LectorMrz({ "" }, falso, maxLlamadasOcr = 1).leer(t1).llamadas shouldBe 1
        LectorMrz({ "" }, falso, maxLlamadasOcr = 5).leer(t1, maxLlamadasLectura = 1).llamadas shouldBe 1
        var reloj = 0L
        LectorMrz({ reloj += 1; "" }, falso, tiempoLimiteMs = 1, ahora = { reloj }).leer(t1).llamadas shouldBe 1
        fun cargador(bytes: ByteArray?) = object : ClassLoader(null) {
            override fun getResourceAsStream(name: String): InputStream? = if (name == ModeloMrz.RECURSO && bytes != null) ByteArrayInputStream(bytes) else null
        }
        ModeloMrz.cargar(cargador("no es el modelo".toByteArray())) shouldBe null
        ModeloMrz.cargar(cargador(null)) shouldBe null
        ModeloMrz.cargar()?.let { m -> ModeloMrz.cargar(cargador(m))?.size shouldBe m.size }
    }
})
