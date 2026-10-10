package io.github.jorgeluissanchez.lectorcedula

import io.github.jorgeluissanchez.lectorcedula.calidad.AnalizadorCalidad
import io.github.jorgeluissanchez.lectorcedula.calidad.Contenido
import io.github.jorgeluissanchez.lectorcedula.calidad.ResultadoCalidad
import io.github.jorgeluissanchez.lectorcedula.motor.MotorJs
import io.kotest.core.spec.style.StringSpec
import io.kotest.matchers.shouldBe
import io.kotest.matchers.shouldNotBe
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import java.util.Base64

/**
 * NAT-01 y NAT-12 en el Lector con calidad falsa (frames de 1x1 marcados): umbral de `listo`, opciones que llegan al
 * bundle, ruta MRZ, fallos del decodificador, regla de menores y cancelación durante la apertura. fixture-sintetico:
 * payload y líneas MRZ de `PERSONA_BASE` (casos-motor.json, NUIP 9999123456).
 */
class LectorLecturaNat01Test : StringSpec({
    val motor by lazy { MotorJs.desdeRecurso() }
    afterSpec { motor.close() }

    /** Calidad falsa: el primer byte del frame es el score. */
    val analizar: (FrameCamara) -> AnalizadorCalidad.Evaluacion? = { f ->
        AnalizadorCalidad.Evaluacion(ResultadoCalidad(f.pixeles[0].toInt(), null, null), Contenido.PDF417, emptyList())
    }

    fun frames(vararg scores: Int) = scores.map { s -> { FrameCamara(byteArrayOf(s.toByte(), 0, 0, 0), 1, 1) } }

    fun opciones(vararg pares: Pair<String, JsonElement>) = JsonObject(mapOf(*pares))

    fun lector(dec: Decodificador, o: JsonObject = JsonObject(emptyMap()), fecha: String = "2026-10-09") =
        Lector(motor, o, dec, analizar = analizar, fechaReferencia = { fecha })

    val pdf417 = Decodificador { _, _ -> Lectura.Pdf417(Falsos.bytesPersonaBase.copyOf()) }

    "NAT-01 Umbral de listo: score 70 es apto y 69 no (CAL-08 umbralListo)" {
        val l = lector(Decodificador { _, _ -> null })
        val s = Secuencia(l)
        l.iniciar(FuenteFramesFalsa(frames(69)))
        s.fases shouldBe listOf("permiso", "activo")
        val m = lector(Decodificador { _, _ -> null })
        val t = Secuencia(m)
        m.iniciar(FuenteFramesFalsa(frames(70)))
        t.fases shouldBe listOf("permiso", "activo", "listo")
    }

    "NAT-01 Autocaptura: un frame no apto reinicia la racha de framesConsecutivos" {
        var lecturas = 0
        val l = lector(Decodificador { _, _ -> lecturas++; null })
        l.iniciar(FuenteFramesFalsa(frames(90, 90, 10, 90, 90)))
        lecturas shouldBe 0
        l.iniciar(FuenteFramesFalsa(frames(90, 90, 90)))
        lecturas shouldBe 0 // ya no está en inicio: iniciar no aplica
        val m = lector(Decodificador { _, _ -> lecturas++; null })
        m.iniciar(FuenteFramesFalsa(frames(90, 90, 10, 90, 90, 90)))
        lecturas shouldBe 1
    }

    "NAT-01 Opciones al bundle: enmascarar, documentos y admitirTi dan la misma salida que procesarPdf417 directo" {
        val casos = listOf(
            opciones("enmascarar" to JsonPrimitive(true)) to "2026-10-09",
            opciones("admitirTi" to JsonPrimitive(true)) to "2000-01-01",
        )
        for ((o, fecha) in casos) {
            val l = lector(pdf417, o, fecha)
            l.iniciar(FuenteFramesFalsa(frames(90, 90, 90)))
            val directo = motor.llamar(
                "procesarPdf417",
                JsonPrimitive(Base64.getEncoder().encodeToString(Falsos.bytesPersonaBase)),
                JsonObject(o + ("fechaReferencia" to JsonPrimitive(fecha))),
            ).jsonObject
            l.estado.value.fase shouldBe EstadoLector.Fase.RESULTADO
            l.estado.value.resultado!!.json shouldBe directo["resultado"]
        }
        val enmascarado = lector(pdf417, opciones("enmascarar" to JsonPrimitive(true)))
        enmascarado.iniciar(FuenteFramesFalsa(frames(90, 90, 90)))
        enmascarado.estado.value.resultado!!.campos["nuip"] shouldNotBe "9999123456"
        val soloPasaporte = lector(pdf417, opciones("documentos" to JsonArray(listOf(JsonPrimitive("pasaporte")))))
        soloPasaporte.iniciar(FuenteFramesFalsa(frames(90, 90, 90)))
        soloPasaporte.estado.value.fase shouldBe EstadoLector.Fase.ERROR
        soloPasaporte.estado.value.error!!.codigo shouldBe "documento-no-admitido"
    }

    "NAT-01 Ruta MRZ: las líneas crudas van a procesarMrz y el contenido es mrz-td1" {
        val lineas = listOf("ICCOL999912345516001<<<<<<<<<<", "8503149F3503144COL9999123456<5", "PRUEBA<EJEMPLO<<FICTICIA<LUZ<<")
        val l = lector(Decodificador { _, _ -> Lectura.Mrz(lineas) })
        l.iniciar(FuenteFramesFalsa(frames(90, 90, 90)))
        l.estado.value.fase shouldBe EstadoLector.Fase.RESULTADO
        l.estado.value.contenido shouldBe "mrz-td1"
        l.estado.value.resultado!!.campos["nuip"] shouldBe "9999123456"
    }

    "NAT-01 Decodificador que lanza: reintento automático, sin error" {
        val l = lector(Decodificador { _, _ -> throw IllegalStateException("zxing") })
        val s = Secuencia(l)
        l.iniciar(FuenteFramesFalsa(frames(90, 90, 90)))
        s.fases shouldBe listOf("permiso", "activo", "listo", "leyendo", "activo")
    }

    "NAT-12 Menor sin envío: TI sin enviarMenores da envio fallido menor-no-enviado y ninguna petición" {
        val o = opciones(
            "servidor" to JsonPrimitive("https://api.lector-cedula.example"),
            "sesion" to JsonPrimitive("ses_sintetica_01"),
            "admitirTi" to JsonPrimitive(true),
        )
        val l = lector(pdf417, o, "2000-01-01")
        l.iniciar(FuenteFramesFalsa(frames(90, 90, 90)))
        l.estado.value.fase shouldBe EstadoLector.Fase.RESULTADO
        l.estado.value.resultado!!.tipo shouldBe "tarjeta-identidad"
        l.estado.value.envio shouldBe JsonObject(mapOf("estado" to JsonPrimitive("fallido"), "codigo" to JsonPrimitive("menor-no-enviado")))
        l.estado.value.resultado!!.validacionId shouldBe null
    }

    "NAT-01 Fecha de referencia por omisión: hoy en America/Bogota (AAAA-MM-DD válida para el bundle)" {
        val l = Lector(motor, decodificador = pdf417, analizar = analizar)
        l.iniciar(FuenteFramesFalsa(frames(90, 90, 90)))
        l.estado.value.fase shouldBe EstadoLector.Fase.RESULTADO
    }

    "NAT-02 Liberación: cancelar mientras se abre la fuente la cierra aunque la cámara termine de abrir después" {
        lateinit var l: Lector
        var abierta = false
        val fuente = object : FuenteFrames {
            override suspend fun abrir() {
                l.cancelar()
                abierta = true // la cámara real termina de abrir después de la cancelación
            }
            override suspend fun siguiente(): FrameCamara? = error("no debe pedir frames")
            override fun cerrar() {
                abierta = false
            }
        }
        l = lector(pdf417)
        val s = Secuencia(l)
        l.iniciar(fuente)
        s.fases shouldBe listOf("permiso", "inicio")
        abierta shouldBe false
    }

    "NAT-01 Contenido en leyendo: el del decodificador aunque la pista de calidad no lo distinga (TD3)" {
        lateinit var l: Lector
        val vistos = mutableListOf<String?>()
        l = Lector(
            motor,
            decodificador = { _, _ -> vistos += l.estado.value.contenido; null },
            analizar = { AnalizadorCalidad.Evaluacion(ResultadoCalidad(90, null, null), Contenido.MRZ_TD3, emptyList()) },
            fechaReferencia = { "2026-10-09" },
        )
        l.iniciar(FuenteFramesFalsa(frames(90, 90, 90)))
        vistos shouldBe listOf("mrz-td3")
    }

    "NAT-02 Liberación: cancelar la corrutina durante la apertura cierra la fuente" {
        val l = lector(pdf417)
        var cerrada = false
        val abriendo = CompletableDeferred<Unit>()
        val fuente = object : FuenteFrames {
            override suspend fun abrir() {
                abriendo.complete(Unit)
                awaitCancellation()
            }
            override suspend fun siguiente(): FrameCamara? = null
            override fun cerrar() {
                cerrada = true
            }
        }
        withTimeout(10_000) {
            val job = launch { l.iniciar(fuente) }
            abriendo.await()
            job.cancel()
            job.join()
        }
        cerrada shouldBe true
        l.estado.value.fase shouldBe EstadoLector.Fase.INICIO
    }
})
