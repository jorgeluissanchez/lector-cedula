package io.github.jorgeluissanchez.lectorcedula.mrz

import io.github.jorgeluissanchez.lectorcedula.FrameCamara
import io.github.jorgeluissanchez.lectorcedula.Lectura
import io.github.jorgeluissanchez.lectorcedula.calidad.Contenido
import io.github.jorgeluissanchez.lectorcedula.motor.MotorJs
import io.kotest.core.spec.style.StringSpec
import io.kotest.matchers.shouldBe
import io.kotest.matchers.types.shouldBeInstanceOf

/**
 * NAT-06 (sdk-nativo, tarea 1.5), unitarias del bucle de lectura MRZ con OCR falso: parada con 4 dígitos válidos o un
 * documento, mejor intento, documentos no admitidos, fallos del OCR, presupuesto de llamadas (LMI-13, OFF-27c) y de
 * tiempo, y las reglas del bundle real (`evaluarTextoMrz`). fixture-sintetico: líneas de PERSONA_BASE (NUIP
 * 9999123456, generarMrzTd1 semilla 1) y del pasaporte de OD-01.
 */
class LectorMrzNat06Test : StringSpec({
    val motor by lazy { MotorJs.desdeRecurso() }
    afterSpec { motor.close() }
    val digital = listOf("ICCOL999912345516001<<<<<<<<<<", "8503149F3503144COL9999123456<5", "PRUEBA<EJEMPLO<<FICTICIA<LUZ<<")
    val pasaporte = listOf("P<COLPEREZ<NUNEZ<<ANA<MARIA<<<<<<<<<<<<<<<<<", "AZ12345673COL9002155F31021451234567890<<<<78")
    val tarjeta = EscenasMrz.tarjeta(600, 378, 3, 30, 12)
    val bundle by lazy { EvaluadorBundle(motor) { "2026-10-09" } }

    /** OCR falso que devuelve `textos[i]` en la llamada i (vacío después) y cuenta las llamadas. */
    class OcrFalso(private val textos: List<String>) : MotorOcr {
        var llamadas = 0
        override fun reconocer(vista: ImagenRgba): String = textos.getOrElse(llamadas++) { "" }
    }

    /** Evaluador falso: "<n>" da n dígitos válidos, "doc" un documento, "no" un documento no admitido. */
    val falso = EvaluadorTexto { t, _ ->
        when {
            t == "doc" -> EvaluacionTexto.Valida(listOf("D"), 5, true)
            t == "no" -> EvaluacionTexto.Invalida("documento-no-admitido", listOf("N"))
            t.toIntOrNull() != null -> EvaluacionTexto.Valida(listOf("L$t"), t.toInt(), false)
            else -> EvaluacionTexto.Invalida("mrz-no-encontrada", null)
        }
    }

    "NAT-06 Se detiene en la primera vista con 4 dígitos válidos" {
        val ocr = OcrFalso(listOf("", "2", "4", "4"))
        LectorMrz(ocr, falso).leer(tarjeta) shouldBe ResultadoMrz(listOf("L4"), "imagen-completa", 3)
        ocr.llamadas shouldBe 3
    }

    "NAT-06 Un documento (CE o pasaporte) se entrega en cuanto aparece" {
        LectorMrz(OcrFalso(listOf("3", "doc")), falso).leer(tarjeta).let { listOf(it.lineas, it.llamadas) } shouldBe listOf(listOf("D"), 2)
    }

    "NAT-06 Sin lectura completa entrega el mejor intento (el primero ante empate)" {
        val r = LectorMrz(OcrFalso(listOf("2", "3", "1", "3")), falso, maxLlamadasOcr = 5).leer(tarjeta)
        r shouldBe ResultadoMrz(listOf("L3"), "recorte-inferior", 5)
    }

    "NAT-06 Solo documentos no admitidos: entrega las líneas del primero para que procesarMrz dé el error" {
        LectorMrz(OcrFalso(listOf("no", "x")), falso, maxLlamadasOcr = 3).leer(tarjeta) shouldBe ResultadoMrz(listOf("N"), null, 3)
        LectorMrz(OcrFalso(listOf("no", "1")), falso, maxLlamadasOcr = 3).leer(tarjeta).lineas shouldBe listOf("L1")
    }

    "NAT-06 Sin MRZ en ninguna vista: sin líneas tras el tope de llamadas (LMI-13)" {
        val ocr = OcrFalso(emptyList())
        LectorMrz(ocr, falso, maxLlamadasOcr = 7).leer(tarjeta) shouldBe ResultadoMrz(null, null, 7)
        ocr.llamadas shouldBe 7
    }

    "NAT-06 El tope por lectura (OFF-27c) acota pero nunca amplía el del lector; valores no positivos no cuentan" {
        LectorMrz(OcrFalso(emptyList()), falso, maxLlamadasOcr = 7).leer(tarjeta, maxLlamadasLectura = 3).llamadas shouldBe 3
        LectorMrz(OcrFalso(emptyList()), falso, maxLlamadasOcr = 7).leer(tarjeta, maxLlamadasLectura = 30).llamadas shouldBe 7
        LectorMrz(OcrFalso(emptyList()), falso, maxLlamadasOcr = 7).leer(tarjeta, maxLlamadasLectura = 0).llamadas shouldBe 7
        LectorMrz(OcrFalso(emptyList()), falso, maxLlamadasOcr = 0).leer(tarjeta).llamadas shouldBe LectorMrz.MAX_LLAMADAS_OCR
    }

    "NAT-06 Presupuesto de tiempo (LMI-13): se para cuando el reloj alcanza el límite" {
        var reloj = 0L
        val ocr = MotorOcr { reloj += 400; "" }
        LectorMrz(ocr, falso, tiempoLimiteMs = 1_000, ahora = { reloj }).leer(tarjeta).llamadas shouldBe 3
        reloj = 0L
        LectorMrz(ocr, falso, tiempoLimiteMs = -5, ahora = { reloj }).leer(tarjeta).llamadas shouldBe LectorMrz.MAX_LLAMADAS_OCR
    }

    "NAT-06 Un fallo del OCR cuenta como texto vacío y el bucle sigue" {
        var n = 0
        val ocr = MotorOcr { if (n++ == 0) error("ocr") else "4" }
        LectorMrz(ocr, falso).leer(tarjeta) shouldBe ResultadoMrz(listOf("L4"), "recorte-inferior", 2)
    }

    "NAT-06 El plan se recorre en el orden de PlanMrz con la vista preparada por VistaOcr" {
        val vistas = ArrayList<Pair<String, ImagenRgba>>()
        val l = LectorMrz(OcrFalso(emptyList()), falso, maxLlamadasOcr = 4)
        l.observador = { i, v -> vistas.add(i.nombre to v) }
        l.leer(tarjeta)
        val plan = PlanMrz.intentosTd1(tarjeta).take(4).toList()
        vistas.map { it.first } shouldBe plan.map { it.nombre }
        vistas.map { it.second.datos.toList() } shouldBe plan.map { VistaOcr.paraOcr(it).datos.toList() }
        vistas.first().second.ancho shouldBe 900
    }

    "NAT-06 Digital TD1 con las reglas del bundle: texto con ruido, dígito dañado y 4 válidos" {
        val roto = "8503148F3503144COL9999123456<5"
        val textos = listOf("RUIDO", "${digital[0]}\n$roto\n${digital[2]}", " ${digital[0].lowercase()}\n\n${digital[1]}\n${digital[2]}\n")
        LectorMrz(OcrFalso(textos), bundle).leer(tarjeta) shouldBe ResultadoMrz(digital, "imagen-completa", 3)
        LectorMrz(OcrFalso(textos.take(2)), bundle, maxLlamadasOcr = 4).leer(tarjeta).lineas shouldBe listOf(digital[0], roto, digital[2])
    }

    "NAT-06 Pasaporte TD3 con las reglas del bundle: 2 líneas de 44" {
        val r = LectorMrz(OcrFalso(listOf(pasaporte.joinToString("\n"))), bundle).leer(EscenasMrz.tarjeta(600, 378, 2, 44, 12), FormatoMrz.TD3)
        r.lineas shouldBe pasaporte
        r.lineas!!.map { it.length } shouldBe listOf(44, 44)
        r.intento shouldBe "franja"
        bundle.evaluar(pasaporte.joinToString("\n"), FormatoMrz.TD1) shouldBe EvaluacionTexto.Invalida("mrz-no-encontrada", null)
    }

    "NAT-06 Decodificador del Lector: TD3 con pista de pasaporte, TD1 en otro caso, null sin lectura" {
        val formatos = ArrayList<FormatoMrz>()
        val ev = EvaluadorTexto { t, f -> formatos.add(f); falso.evaluar(t, f) }
        val frame = FrameCamara(tarjeta.datos.copyOf(), tarjeta.ancho, tarjeta.alto)
        DecodificadorMrz(LectorMrz(OcrFalso(listOf("4")), ev)).leer(frame, Contenido.MRZ_TD3).shouldBeInstanceOf<Lectura.Mrz>().lineas shouldBe listOf("L4")
        DecodificadorMrz(LectorMrz(OcrFalso(listOf("4")), ev)).leer(frame, Contenido.MRZ_TD1)
        DecodificadorMrz(LectorMrz(OcrFalso(listOf("4")), ev)).leer(frame, null)
        formatos shouldBe listOf(FormatoMrz.TD3, FormatoMrz.TD1, FormatoMrz.TD1)
        DecodificadorMrz(LectorMrz(OcrFalso(emptyList()), falso, maxLlamadasOcr = 2)).leer(frame, null) shouldBe null
    }
})
