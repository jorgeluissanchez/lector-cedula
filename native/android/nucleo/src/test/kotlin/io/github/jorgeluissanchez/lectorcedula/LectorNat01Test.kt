package io.github.jorgeluissanchez.lectorcedula

import io.github.jorgeluissanchez.lectorcedula.calidad.Fixtures
import io.github.jorgeluissanchez.lectorcedula.motor.MotorJs
import io.kotest.core.spec.style.StringSpec
import io.kotest.matchers.collections.shouldContainInOrder
import io.kotest.matchers.nulls.shouldNotBeNull
import io.kotest.matchers.shouldBe
import io.kotest.matchers.string.shouldNotBeBlank
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * NAT-01 Núcleo nativo con el mismo modelo de estado, NAT-11 "StateFlow", NAT-02 "Liberación" (núcleo con fuente
 * falsa), NAT-12 "Sesión sin servidor" y NAT-13 "Búferes a cero". fixture-sintetico: `amarilla-1080p` y el payload de
 * `PERSONA_BASE` (NUIP 9999123456); el decodificador falso sustituye a zxing-cpp hasta la tarea 1.4.
 */
class LectorNat01Test : StringSpec({
    val motor by lazy { MotorJs.desdeRecurso() }
    afterSpec { motor.close() }

    fun lector(decodificador: DecodificadorFalso, opciones: JsonObject = JsonObject(emptyMap()), analizar: ((FrameCamara) -> io.github.jorgeluissanchez.lectorcedula.calidad.AnalizadorCalidad.Evaluacion?)? = null): Lector {
        val l = if (analizar == null) {
            Lector(motor, opciones, decodificador, fechaReferencia = { "2026-10-09" })
        } else {
            Lector(motor, opciones, decodificador, analizar = analizar, fechaReferencia = { "2026-10-09" })
        }
        decodificador.lector = l
        return l
    }

    fun felices() = listOf(Falsos::negra, Falsos::amarilla, Falsos::amarilla, Falsos::amarilla)

    "NAT-01 Flujo feliz con frames falsos: permiso, activo, listo, leyendo, resultado".config(enabled = Fixtures.disponibles()) {
        val dec = DecodificadorFalso(Falsos.bytesPersonaBase)
        val l = lector(dec)
        val s = Secuencia(l)
        val fuente = FuenteFramesFalsa(felices())
        l.iniciar(fuente)
        s.fases shouldBe listOf("permiso", "activo", "listo", "leyendo", "resultado")
        dec.fasesAlLeer shouldBe listOf(EstadoLector.Fase.LEYENDO)
        val r = l.estado.value.resultado.shouldNotBeNull()
        r.campos["nuip"] shouldBe "9999123456"
        r.confiable shouldBe false
        r.validacionId shouldBe null
        l.estado.value.contenido shouldBe "pdf417"
        l.estado.value.envio shouldBe null
        fuente.abierta shouldBe false
        // NAT-13: cada frame y los bytes entregados al bundle quedan a cero.
        fuente.entregados.size shouldBe 4
        fuente.entregados.all { f -> f.pixeles.all { it == 0.toByte() } } shouldBe true
        dec.entregados.single().all { it == 0.toByte() } shouldBe true
    }

    "NAT-11 StateFlow: el último valor recogido tiene fase RESULTADO y campos[nuip] 9999123456".config(enabled = Fixtures.disponibles()) {
        val l = lector(DecodificadorFalso(Falsos.bytesPersonaBase))
        val valores = mutableListOf<EstadoLector>()
        withTimeout(10_000) {
            val listo = CompletableDeferred<Unit>()
            val recolector = launch(Dispatchers.Unconfined) {
                listo.complete(Unit)
                l.estado.collect { valores += it }
            }
            listo.await()
            l.iniciar(FuenteFramesFalsa(felices()))
            recolector.cancel()
        }
        valores.first().fase shouldBe EstadoLector.Fase.INICIO
        valores.map { it.fase } shouldContainInOrder listOf(EstadoLector.Fase.PERMISO, EstadoLector.Fase.RESULTADO)
        valores.last().fase shouldBe EstadoLector.Fase.RESULTADO
        valores.last().resultado!!.campos["nuip"] shouldBe "9999123456"
        valores.last() shouldBe l.estado.value
    }

    "NAT-01 Permiso denegado: permiso, error con camara-denegada y mensaje no vacío" {
        val l = lector(DecodificadorFalso(null))
        val s = Secuencia(l)
        val fuente = FuenteFramesFalsa(emptyList(), error = "camara-denegada")
        l.iniciar(fuente)
        s.fases shouldBe listOf("permiso", "error")
        val e = l.estado.value.error.shouldNotBeNull()
        e.codigo shouldBe "camara-denegada"
        e.mensaje.shouldNotBeBlank()
    }

    "NAT-01 Error desconocido al abrir la fuente: camara-error" {
        val l = lector(DecodificadorFalso(null))
        val fuente = object : FuenteFrames {
            override suspend fun abrir() = throw IllegalStateException("sin cámara")
            override suspend fun siguiente(): FrameCamara? = null
            override fun cerrar() = Unit
        }
        l.iniciar(fuente)
        l.estado.value.error!!.codigo shouldBe "camara-error"
    }

    "NAT-01 Fallo del análisis de calidad: activo→error con calidad-error y la fuente cerrada" {
        val l = lector(DecodificadorFalso(null), analizar = { throw IllegalStateException("analizador") })
        val s = Secuencia(l)
        val frame = FrameCamara(ByteArray(16) { 7 }, 2, 2)
        val fuente = FuenteFramesFalsa(listOf({ frame }))
        l.iniciar(fuente)
        s.fases shouldBe listOf("permiso", "activo", "error")
        s.pares.last() shouldBe ("activo" to "error")
        l.estado.value.error!!.codigo shouldBe "calidad-error"
        l.estado.value.error!!.mensaje.shouldNotBeBlank()
        fuente.abierta shouldBe false
        fuente.cierres shouldBe 1
        // NAT-13: el analizador lanzó a mitad del frame y aun así el frame quedó a cero.
        frame.pixeles.all { it == 0.toByte() } shouldBe true
    }

    "NAT-01 Idioma en: mensaje de error en inglés desde el bundle" {
        val l = lector(DecodificadorFalso(null), opciones = JsonObject(mapOf("idioma" to JsonPrimitive("en"))))
        l.iniciar(FuenteFramesFalsa(emptyList(), error = "camara-denegada"))
        val es = lector(DecodificadorFalso(null))
        es.iniciar(FuenteFramesFalsa(emptyList(), error = "camara-denegada"))
        (l.estado.value.error!!.mensaje != es.estado.value.error!!.mensaje) shouldBe true
    }

    "NAT-01 Código de error desconocido de la fuente: camara-error con mensaje" {
        val l = lector(DecodificadorFalso(null))
        l.iniciar(FuenteFramesFalsa(emptyList(), error = "codigo-que-no-existe"))
        l.estado.value.error!!.codigo shouldBe "camara-error"
        l.estado.value.error!!.mensaje.shouldNotBeBlank()
    }

    "NAT-01 Reintentar desde resultado reabre la última fuente y vuelve a leer (SDK-27)".config(enabled = Fixtures.disponibles()) {
        val l = lector(DecodificadorFalso(Falsos.bytesPersonaBase))
        val fuente = FuenteFramesFalsa(felices())
        l.iniciar(fuente)
        l.estado.value.fase shouldBe EstadoLector.Fase.RESULTADO
        val s = Secuencia(l)
        l.reintentar()
        s.fases shouldBe listOf("permiso", "activo", "listo", "leyendo", "resultado")
        fuente.aperturas shouldBe 2
        l.estado.value.intento shouldBe 2
    }

    "NAT-01 Reintentar desde error reabre la fuente; sin iniciar previo no hace nada" {
        val nuevo = lector(DecodificadorFalso(null))
        nuevo.reintentar()
        nuevo.estado.value.fase shouldBe EstadoLector.Fase.INICIO
        val l = lector(DecodificadorFalso(null))
        val fuente = FuenteFramesFalsa(emptyList(), error = "camara-denegada")
        l.iniciar(fuente)
        l.reintentar()
        fuente.aperturas shouldBe 2
        l.estado.value.fase shouldBe EstadoLector.Fase.ERROR
    }

    "NAT-02 Liberación: cancelar en activo deja la fase en inicio y la fuente cerrada" {
        lateinit var l: Lector
        val fuente = FuenteFramesFalsa(List(5) { { FrameCamara(ByteArray(16), 2, 2) } }, alEntregar = { i -> if (i == 1) l.cancelar() })
        l = lector(DecodificadorFalso(null), analizar = { null })
        val s = Secuencia(l)
        l.iniciar(fuente)
        s.fases shouldBe listOf("permiso", "activo", "inicio")
        fuente.abierta shouldBe false
        fuente.entregados.size shouldBe 2
        fuente.entregados.all { f -> f.pixeles.all { it == 0.toByte() } } shouldBe true
    }

    "NAT-02 Liberación: cancelar la corrutina de iniciar cierra la fuente" {
        val l = lector(DecodificadorFalso(null), analizar = { null })
        var cerrada = false
        val abierta = CompletableDeferred<Unit>()
        val fuente = object : FuenteFrames {
            override suspend fun abrir() = Unit
            override suspend fun siguiente(): FrameCamara? {
                abierta.complete(Unit)
                awaitCancellation()
            }
            override fun cerrar() {
                cerrada = true
            }
        }
        withTimeout(10_000) {
            val job = launch { l.iniciar(fuente) }
            abierta.await()
            l.estado.value.fase shouldBe EstadoLector.Fase.ACTIVO
            job.cancel()
            job.join()
        }
        cerrada shouldBe true
        l.estado.value.fase shouldBe EstadoLector.Fase.INICIO
    }

    "NAT-01 Destruir: cancela, cierra la fuente y deja el lector inservible" {
        lateinit var l: Lector
        val fuente = FuenteFramesFalsa(List(3) { { FrameCamara(ByteArray(16), 2, 2) } }, alEntregar = { l.destruir() })
        l = lector(DecodificadorFalso(null), analizar = { null })
        l.iniciar(fuente)
        l.estado.value.fase shouldBe EstadoLector.Fase.INICIO
        fuente.abierta shouldBe false
        l.iniciar(fuente)
        l.reintentar()
        fuente.aperturas shouldBe 1
        l.estado.value.fase shouldBe EstadoLector.Fase.INICIO
    }

    "NAT-01 Lectura sin resultado del decodificador: reintento automático a activo con intento + 1".config(enabled = Fixtures.disponibles()) {
        val l = lector(DecodificadorFalso(null))
        val s = Secuencia(l)
        l.iniciar(FuenteFramesFalsa(listOf(Falsos::amarilla, Falsos::amarilla, Falsos::amarilla)))
        s.fases shouldBe listOf("permiso", "activo", "listo", "leyendo", "activo")
        l.estado.value.intento shouldBe 2
    }

    "NAT-01 Payload que el bundle rechaza: error lectura-fallida".config(enabled = Fixtures.disponibles()) {
        val l = lector(DecodificadorFalso(ByteArray(40) { 65 }))
        l.iniciar(FuenteFramesFalsa(listOf(Falsos::amarilla, Falsos::amarilla, Falsos::amarilla)))
        l.estado.value.fase shouldBe EstadoLector.Fase.ERROR
        l.estado.value.error!!.codigo shouldBe "lectura-fallida"
    }

    "NAT-12 Sesión sin servidor: fase inicial error con opcion-invalida y opcion servidor" {
        val l = lector(DecodificadorFalso(null), opciones = JsonObject(mapOf("sesion" to JsonPrimitive("ses_sintetica_01"))))
        l.estado.value.fase shouldBe EstadoLector.Fase.ERROR
        l.estado.value.error shouldBe l.estado.value.error!!.copy(codigo = "opcion-invalida", opcion = "servidor")
        l.estado.value.error!!.mensaje.shouldNotBeBlank()
        val fuente = FuenteFramesFalsa(emptyList())
        l.iniciar(fuente)
        fuente.aperturas shouldBe 0
    }
})
