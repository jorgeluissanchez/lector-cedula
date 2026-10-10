package io.github.jorgeluissanchez.lectorcedula.pdf417

import io.github.jorgeluissanchez.lectorcedula.Falsos
import io.github.jorgeluissanchez.lectorcedula.FrameCamara
import io.github.jorgeluissanchez.lectorcedula.Lectura
import io.github.jorgeluissanchez.lectorcedula.calidad.Contenido
import io.github.jorgeluissanchez.lectorcedula.calidad.Oraculo
import io.github.jorgeluissanchez.lectorcedula.motor.MotorJs
import io.kotest.assertions.throwables.shouldThrow
import io.kotest.core.spec.style.StringSpec
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.shouldBe
import io.kotest.matchers.shouldNotBe
import io.kotest.matchers.types.shouldBeInstanceOf
import io.kotest.matchers.types.shouldNotBeSameInstanceAs
import io.kotest.property.Arb
import io.kotest.property.arbitrary.int
import io.kotest.property.arbitrary.long
import io.kotest.property.checkAll
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.ByteArrayOutputStream
import java.io.PrintStream
import java.util.Base64
import java.util.Random

/**
 * NAT-05 en la JVM (sdk-nativo, tarea 1.4): orquestación del decodificador PDF417 con un binding falso. La lectura con
 * el binario real de zxing-cpp (solo ABIs de Android) corre en el emulador (`KI`, Pdf417ZxingNat05Test).
 * fixture-sintetico: payload `completa-base` de `PERSONA_BASE` (NUIP 9999123456); píxeles generados.
 */
class DecodificadorPdf417Nat05Test : StringSpec({
    val oraculo by lazy { Oraculo() }
    val motor by lazy { MotorJs.desdeRecurso() }
    afterSpec {
        oraculo.close()
        motor.close()
    }

    /** Binding falso: devuelve `codigos` y guarda la luminancia recibida (la referencia, para ver que queda a cero). */
    class BindingFalso(
        override val formatos: List<String> = listOf("PDF417"),
        private val codigos: () -> List<CodigoLeido> = { emptyList() },
        private val error: Exception? = null,
    ) : LectorCodigosNativo {
        val recibidas = mutableListOf<ByteArray>()
        val copias = mutableListOf<ByteArray>()

        override fun leer(luma: ByteArray, ancho: Int, alto: Int): List<CodigoLeido> {
            recibidas += luma
            copias += luma.copyOf()
            error?.let { throw it }
            return codigos()
        }
    }

    fun frame(ancho: Int = 4, alto: Int = 2, valor: Int = 200) = FrameCamara(ByteArray(ancho * alto * 4) { valor.toByte() }, ancho, alto)

    "NAT-05 QR de la digital ignorado: la configuración de formatos es exactamente [\"PDF417\"]" {
        OpcionesPdf417.FORMATOS shouldBe listOf("PDF417")
        DecodificadorPdf417(BindingFalso(listOf("PDF417")))
        for (otros in listOf(listOf("PDF417", "QR_CODE"), listOf("QR_CODE"), emptyList(), listOf("QR_CODE", "PDF417"))) {
            shouldThrow<IllegalArgumentException> { DecodificadorPdf417(BindingFalso(otros)) }.message shouldBe "formatos-no-admitidos"
        }
    }

    "NAT-05 QR de la digital ignorado: un QR que devolviera el binding se descarta y queda a cero" {
        val qr = byteArrayOf(1, 2, 3)
        val d = DecodificadorPdf417(BindingFalso(codigos = { listOf(CodigoLeido("QR_CODE", qr, true)) }))
        d.leer(frame(), null).shouldBeNull()
        qr.toList() shouldBe listOf<Byte>(0, 0, 0)
    }

    "NAT-05 Amarilla sintética: entrega una copia del primer PDF417 válido y no vacío; el resto queda a cero" {
        val invalido = byteArrayOf(9, 9)
        val vacio = ByteArray(0)
        val qr = byteArrayOf(7, 7)
        val bueno = Falsos.bytesPersonaBase.copyOf()
        val segundo = byteArrayOf(5, 5)
        val codigos = listOf(
            CodigoLeido("PDF417", invalido, false),
            CodigoLeido("PDF417", null, true),
            CodigoLeido("PDF417", vacio, true),
            CodigoLeido("QR_CODE", qr, true),
            CodigoLeido("PDF417", bueno, true),
            CodigoLeido("PDF417", segundo, true),
        )
        val l = DecodificadorPdf417(BindingFalso(codigos = { codigos })).leer(frame(), Contenido.PDF417)
        l.shouldBeInstanceOf<Lectura.Pdf417>()
        l.bytes.toList() shouldBe Falsos.bytesPersonaBase.toList()
        l.bytes shouldNotBeSameInstanceAs bueno
        for (b in listOf(invalido, qr, bueno, segundo)) b.all { it == 0.toByte() } shouldBe true
    }

    "NAT-05 Amarilla sintética: los bytes del decodificador dan nuip 9999123456 en procesarPdf417 del bundle" {
        val l = DecodificadorPdf417(BindingFalso(codigos = { listOf(CodigoLeido("PDF417", Falsos.bytesPersonaBase.copyOf(), true)) }))
            .leer(frame(), null) as Lectura.Pdf417
        val salida = motor.llamar(
            "procesarPdf417",
            JsonPrimitive(Base64.getEncoder().encodeToString(l.bytes)),
            JsonObject(mapOf("fechaReferencia" to JsonPrimitive("2026-10-09"))),
        ).jsonObject
        salida["ok"] shouldBe JsonPrimitive(true)
        salida["resultado"]!!.jsonObject["campos"]!!.jsonObject["nuip"]!!.jsonPrimitive.content shouldBe "9999123456"
    }

    "NAT-05 sin resultado, con binding que falla o con contenido MRZ no hay lectura" {
        DecodificadorPdf417(BindingFalso()).leer(frame(), null).shouldBeNull()
        val falla = BindingFalso(error = IllegalStateException("zxing"))
        DecodificadorPdf417(falla).leer(frame(), Contenido.PDF417).shouldBeNull()
        falla.recibidas.single().all { it == 0.toByte() } shouldBe true
        for (c in listOf(Contenido.MRZ_TD1, Contenido.MRZ_TD3)) {
            val b = BindingFalso(codigos = { listOf(CodigoLeido("PDF417", byteArrayOf(1), true)) })
            DecodificadorPdf417(b).leer(frame(), c).shouldBeNull()
            b.recibidas.size shouldBe 0
        }
    }

    "NAT-05 luminancia a resolución completa: tabla de BT.601 con el redondeo de Math.round" {
        val casos = listOf(
            intArrayOf(0, 0, 0) to 0,
            intArrayOf(255, 255, 255) to 255,
            intArrayOf(255, 0, 0) to 76,
            intArrayOf(0, 255, 0) to 150,
            intArrayOf(0, 0, 255) to 29,
            // 28,5 sube a 29 (Math.round); truncar daría 28.
            intArrayOf(0, 0, 250) to 29,
        )
        val rgba = ByteArray(casos.size * 4)
        casos.forEachIndexed { i, (c, _) ->
            rgba[i * 4] = c[0].toByte(); rgba[i * 4 + 1] = c[1].toByte(); rgba[i * 4 + 2] = c[2].toByte(); rgba[i * 4 + 3] = 0
        }
        Luminancia.deRgba(rgba, casos.size, 1).map { it.toInt() and 0xFF } shouldBe casos.map { it.second }
        shouldThrow<IllegalArgumentException> { Luminancia.deRgba(ByteArray(7), 2, 1) }
        shouldThrow<IllegalArgumentException> { Luminancia.deRgba(ByteArray(0), 0, 1) }
    }

    "NAT-05 luminancia: diferencial con aGris de packages/capture (oráculo TS en QuickJS)" {
        val casos = System.getProperty("nat.iteraciones")?.toIntOrNull()?.coerceAtMost(100) ?: 1000
        checkAll(casos, Arb.int(1..9), Arb.int(1..7), Arb.long()) { w, h, semilla ->
            val rgba = ByteArray(w * h * 4).also { Random(semilla).nextBytes(it) }
            val ts = oraculo.json("OraculoCalidad.gris('${Oraculo.b64(rgba)}', $w, $h)").jsonArray.map { it.jsonPrimitive.content.toInt() }
            Luminancia.deRgba(rgba, w, h).map { it.toInt() and 0xFF } shouldBe ts
        }
    }

    "NAT-05 la luminancia que recibe el binding es la del frame y queda a cero tras leer" {
        val f = frame(3, 1, 0).also { p -> p.pixeles[0] = 255.toByte(); p.pixeles[5] = 255.toByte(); p.pixeles[10] = 255.toByte() }
        val b = BindingFalso()
        DecodificadorPdf417(b).leer(f, null)
        b.copias.single().map { it.toInt() and 0xFF } shouldBe listOf(76, 150, 29)
        b.recibidas.single().all { it == 0.toByte() } shouldBe true
    }

    "NAT-05 Sin datos en logs: decodificar no escribe en stdout ni stderr" {
        val salidaOriginal = System.out
        val errorOriginal = System.err
        val capturado = ByteArrayOutputStream()
        val impresora = PrintStream(capturado, true, "UTF-8")
        val l = try {
            System.setOut(impresora)
            System.setErr(impresora)
            DecodificadorPdf417(BindingFalso(codigos = { listOf(CodigoLeido("PDF417", Falsos.bytesPersonaBase.copyOf(), true)) })).leer(frame(), null)
        } finally {
            System.setOut(salidaOriginal)
            System.setErr(errorOriginal)
        }
        l shouldNotBe null
        capturado.size() shouldBe 0
    }
})
