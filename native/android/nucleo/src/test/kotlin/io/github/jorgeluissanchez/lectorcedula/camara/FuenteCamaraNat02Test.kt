package io.github.jorgeluissanchez.lectorcedula.camara

import io.github.jorgeluissanchez.lectorcedula.DecodificadorFalso
import io.github.jorgeluissanchez.lectorcedula.EstadoLector
import io.github.jorgeluissanchez.lectorcedula.ErrorFuente
import io.github.jorgeluissanchez.lectorcedula.Falsos
import io.github.jorgeluissanchez.lectorcedula.FrameCamara
import io.github.jorgeluissanchez.lectorcedula.Lector
import io.github.jorgeluissanchez.lectorcedula.Secuencia
import io.github.jorgeluissanchez.lectorcedula.calidad.AnalizadorCalidad
import io.github.jorgeluissanchez.lectorcedula.calidad.Fixtures
import io.github.jorgeluissanchez.lectorcedula.motor.MotorJs
import io.github.jorgeluissanchez.lectorcedula.pdf417.Luminancia
import io.kotest.assertions.throwables.shouldThrow
import io.kotest.core.spec.style.StringSpec
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.nulls.shouldNotBeNull
import io.kotest.matchers.shouldBe
import io.kotest.matchers.types.shouldBeSameInstanceAs
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout

/** Corrutinas en un solo hilo (runBlocking): el orden entre la cámara falsa y el Lector es determinista. */
private fun <T> enUnHilo(bloque: suspend CoroutineScope.() -> T): T = runBlocking { withTimeout(60_000) { bloque() } }

/**
 * NAT-02 (enfoque, linterna, liberación y cancelación de la corrutina) y NAT-13 (búferes a cero) de la fuente de cámara
 * del núcleo, con una cámara falsa que entrega planos Y como CameraX (`KJ`). La cámara real se prueba en `KI`.
 * fixture-sintetico: planos generados y el frame 0 de `amarilla-1080p` (PERSONA_BASE, NUIP 9999123456).
 */
class FuenteCamaraNat02Test : StringSpec({
    val motor by lazy { MotorJs.desdeRecurso() }
    afterSpec { motor.close() }

    fun lector(analizar: ((FrameCamara) -> AnalizadorCalidad.Evaluacion?)? = null, bytes: ByteArray? = null): Lector {
        val dec = DecodificadorFalso(bytes)
        val l = if (analizar == null) {
            Lector(motor, decodificador = dec, fechaReferencia = { "2026-10-09" })
        } else {
            Lector(motor, decodificador = dec, analizar = analizar, fechaReferencia = { "2026-10-09" })
        }
        dec.lector = l
        return l
    }

    fun gris(ancho: Int = 4, alto: Int = 3, pasoFila: Int = ancho, pasoPixel: Int = 1) =
        ImagenFalsa(ancho, alto, { x, y -> (y * 37 + x * 11 + 5) and 0xFF }, pasoFila, pasoPixel)

    suspend fun CoroutineScope.activo(l: Lector, fuente: FuenteCamara): Job {
        val job = launch { l.iniciar(fuente) }
        l.estado.first { it.fase == EstadoLector.Fase.ACTIVO }
        return job
    }

    "NAT-02 Enfoque continuo: al pasar a activo se envió una acción con el punto en el centro de la guía" {
        for ((resolucion, centro) in listOf(
            Resolucion(1920, 1080) to Enfoque(960.0, 540.0, 1920, 1080),
            Resolucion(1280, 720) to Enfoque(640.0, 360.0, 1280, 720),
            Resolucion(1080, 1920) to Enfoque(540.0, 960.0, 1080, 1920),
        )) {
            val camara = CamaraFalsa(resolucion)
            val l = lector(analizar = { null })
            enUnHilo {
                val job = activo(l, FuenteCamara(camara))
                camara.enfoques shouldBe listOf(centro)
                job.cancel()
                job.join()
            }
        }
    }

    "NAT-02 Enfoque continuo: el centro es el de la guía de CAM-08 aunque el frame no sea 16:9" {
        // 1600x1200: guía 1440x908 en (80, 146); su centro (800, 600) es el del frame.
        val camara = CamaraFalsa(Resolucion(1600, 1200))
        val fuente = FuenteCamara(camara)
        fuente.abrir()
        camara.enfoques shouldBe listOf(Enfoque(800.0, 600.0, 1600, 1200))
        fuente.cerrar()
    }

    "NAT-02 Linterna: enableTorch(true) y enableTorch(false) en ese orden, sin cambiar la fase" {
        val camara = CamaraFalsa()
        val l = lector(analizar = { null })
        enUnHilo {
            val job = activo(l, FuenteCamara(camara))
            l.linterna(true)
            l.linterna(false)
            camara.linternas shouldBe listOf(true, false)
            l.estado.value.fase shouldBe EstadoLector.Fase.ACTIVO
            job.cancel()
            job.join()
        }
    }

    "NAT-02 Linterna: sin flash, linterna(true) no lanza, no llega al control y no cambia la fase" {
        val camara = CamaraFalsa(tieneFlash = false)
        val l = lector(analizar = { null })
        enUnHilo {
            val job = activo(l, FuenteCamara(camara))
            l.linterna(true)
            camara.linternas shouldBe emptyList()
            l.estado.value.fase shouldBe EstadoLector.Fase.ACTIVO
            job.cancel()
            job.join()
        }
    }

    "NAT-02 Linterna: con la fuente cerrada o el control que lanza, linterna no lanza" {
        val camara = CamaraFalsa()
        val fuente = FuenteCamara(camara)
        fuente.linterna(true)
        camara.linternas shouldBe emptyList()
        val lanza = object : ControlCamara by CamaraFalsa() {
            override fun linterna(encendida: Boolean) = throw IllegalStateException("sin cámara")
        }
        val f2 = FuenteCamara(lanza)
        f2.abrir()
        f2.linterna(true)
        f2.cerrar()
        lector().linterna(true)
    }

    "NAT-02 Liberación: cancelar en activo deja la fase en inicio, la cámara cerrada y la imagen pendiente devuelta" {
        val camara = CamaraFalsa()
        val l = lector(analizar = { null })
        val s = Secuencia(l)
        enUnHilo {
            val job = activo(l, FuenteCamara(camara))
            // Sin ceder el hilo, el Lector no recoge: la primera imagen se descarta al llegar la segunda.
            val a = gris()
            val b = gris()
            camara.entregar(a)
            camara.entregar(b)
            l.cancelar()
            job.join()
            a.cierres shouldBe 1
            a.lecturas shouldBe 0
            b.cierres shouldBe 1
        }
        s.fases shouldBe listOf("permiso", "activo", "inicio")
        l.estado.value.fase shouldBe EstadoLector.Fase.INICIO
        camara.abierta shouldBe false
        camara.cierres shouldBe 1
    }

    "NAT-02 Liberación: una imagen que llega con la fuente cerrada se devuelve sin leerla" {
        val camara = CamaraFalsa()
        val fuente = FuenteCamara(camara)
        fuente.abrir()
        fuente.cerrar()
        val tarde = gris()
        camara.entregar(tarde)
        tarde.cierres shouldBe 1
        tarde.lecturas shouldBe 0
        fuente.siguiente().shouldBeNull()
        // Cerrar dos veces libera la cámara una sola vez.
        fuente.cerrar()
        camara.cierres shouldBe 1
    }

    "NAT-02 Cancelación de la corrutina en Kotlin: mientras la fuente se abre (permiso)" {
        val camara = CamaraFalsa(esperarApertura = true)
        val l = lector(analizar = { null })
        enUnHilo {
            val job = launch { l.iniciar(FuenteCamara(camara)) }
            camara.apertura.await()
            l.estado.value.fase shouldBe EstadoLector.Fase.PERMISO
            job.cancel()
            job.join()
        }
        l.estado.value.fase shouldBe EstadoLector.Fase.INICIO
        camara.cierres shouldBe 1
    }

    "NAT-02 Cancelación de la corrutina en Kotlin: mientras entrega frames (activo)" {
        val camara = CamaraFalsa()
        val l = lector(analizar = { null })
        enUnHilo {
            val job = activo(l, FuenteCamara(camara))
            val pendiente = gris()
            camara.entregar(pendiente)
            job.cancel()
            job.join()
            pendiente.cierres shouldBe 1
        }
        l.estado.value.fase shouldBe EstadoLector.Fase.INICIO
        camara.abierta shouldBe false
    }

    "NAT-02 Liberación: destruir y pasar a error también cierran la cámara" {
        val c1 = CamaraFalsa()
        val l1 = lector(analizar = { null })
        enUnHilo {
            val job = activo(l1, FuenteCamara(c1))
            l1.destruir()
            job.join()
        }
        c1.abierta shouldBe false
        val c2 = CamaraFalsa()
        val l2 = lector(analizar = { throw IllegalStateException("analizador") })
        enUnHilo {
            val job = activo(l2, FuenteCamara(c2))
            c2.entregar(gris())
            job.join()
        }
        l2.estado.value.error!!.codigo shouldBe "calidad-error"
        c2.abierta shouldBe false
    }

    "NAT-01 Permiso denegado por la cámara: error camara-denegada y la cámara no queda abierta" {
        val camara = CamaraFalsa.denegada()
        val l = lector()
        l.iniciar(FuenteCamara(camara))
        l.estado.value.error!!.codigo shouldBe "camara-denegada"
        camara.abierta shouldBe false
        val f = FuenteCamara(CamaraFalsa.denegada())
        shouldThrow<ErrorFuente> { f.abrir() }.codigo shouldBe "camara-denegada"
        f.siguiente().shouldBeNull()
    }

    "Frame de luminancia: el plano Y con relleno de fila o paso de píxel 2 pasa a RGBA gris exacto" {
        for (imagen in listOf(gris(), gris(pasoFila = 7), gris(pasoPixel = 2, pasoFila = 9))) {
            val camara = CamaraFalsa()
            val fuente = FuenteCamara(camara)
            fuente.abrir()
            camara.entregar(imagen)
            val f = fuente.siguiente().shouldNotBeNull()
            f.ancho shouldBe 4
            f.alto shouldBe 3
            val esperado = ByteArray(4 * 3 * 4)
            for (y in 0 until 3) for (x in 0 until 4) {
                val v = ((y * 37 + x * 11 + 5) and 0xFF).toByte()
                val o = (y * 4 + x) * 4
                esperado[o] = v
                esperado[o + 1] = v
                esperado[o + 2] = v
                esperado[o + 3] = 255.toByte()
            }
            f.pixeles shouldBe esperado
            imagen.cierres shouldBe 1
            f.liberar()
            fuente.cerrar()
        }
    }

    "Frame de luminancia: una imagen con el plano más corto de lo que declara se descarta y se devuelve" {
        val camara = CamaraFalsa()
        val fuente = FuenteCamara(camara)
        fuente.abrir()
        val corta = ImagenFalsa(4, 3, { _, _ -> 9 }, tamano = 5)
        val vacia = ImagenFalsa(0, 3, { _, _ -> 9 }, tamano = 1)
        val buena = gris()
        camara.entregar(corta)
        val f = enUnHilo {
            launch {
                // Las imágenes inválidas no despiertan a `siguiente` con un frame: llega la buena.
                camara.entregar(vacia)
                camara.entregar(buena)
            }
            fuente.siguiente()
        }.shouldNotBeNull()
        corta.cierres shouldBe 1
        vacia.cierres shouldBe 1
        buena.cierres shouldBe 1
        f.pixeles[0] shouldBe 5.toByte()
        fuente.cerrar()
    }

    "Frame de luminancia: solo se copian las imágenes que el lector consume (las descartadas no se leen)" {
        val camara = CamaraFalsa()
        val fuente = FuenteCamara(camara)
        fuente.abrir()
        val imagenes = List(5) { gris() }
        imagenes.forEach(camara::entregar)
        val f = fuente.siguiente().shouldNotBeNull()
        imagenes.map { it.cierres } shouldBe List(5) { 1 }
        imagenes.dropLast(1).map { it.lecturas } shouldBe List(4) { 0 }
        (imagenes.last().lecturas > 0) shouldBe true
        f.liberar()
        fuente.cerrar()
    }

    "Frame de luminancia: la luminancia de calidad, PDF417 y MRZ del frame gris es exactamente Y" {
        val ancho = 64
        val alto = 4
        val imagen = ImagenFalsa(ancho, alto, { x, y -> x * 4 + y }, pasoFila = 80)
        val camara = CamaraFalsa()
        val fuente = FuenteCamara(camara)
        fuente.abrir()
        camara.entregar(imagen)
        val f = fuente.siguiente().shouldNotBeNull()
        val y = IntArray(ancho * alto) { i -> (i % ancho) * 4 + i / ancho }
        io.github.jorgeluissanchez.lectorcedula.calidad.Calidad.luminanciasFrame(f.pixeles, ancho, alto).toList() shouldBe y.toList()
        Luminancia.deRgba(f.pixeles, ancho, alto).map { it.toInt() and 0xFF } shouldBe y.toList()
        io.github.jorgeluissanchez.lectorcedula.mrz.LocalizarMrz.luminancias(f.pixeles, ancho * alto).toList() shouldBe y.toList()
        f.liberar()
        fuente.cerrar()
    }

    "Reintentar: la fuente cerrada se puede reabrir y vuelve a entregar frames" {
        val camara = CamaraFalsa()
        val fuente = FuenteCamara(camara)
        fuente.abrir()
        fuente.cerrar()
        fuente.abrir()
        camara.entregar(gris())
        fuente.siguiente().shouldNotBeNull().liberar()
        camara.aperturas shouldBe 2
        camara.enfoques.size shouldBe 2
        fuente.cerrar()
    }

    "NAT-13 Búferes a cero: liberar una o dos veces deja el frame a cero y el búfer se reutiliza" {
        val camara = CamaraFalsa()
        val fuente = FuenteCamara(camara)
        fuente.abrir()
        camara.entregar(gris())
        val f1 = fuente.siguiente().shouldNotBeNull()
        f1.liberar()
        f1.liberar()
        f1.pixeles.all { it == 0.toByte() } shouldBe true
        fuente.buferesRetenidos().size shouldBe 1
        camara.entregar(gris())
        val f2 = fuente.siguiente().shouldNotBeNull()
        f2.pixeles shouldBeSameInstanceAs f1.pixeles
        fuente.buferesRetenidos().size shouldBe 0
        // Un frame de otro tamaño no usa el búfer retenido.
        f2.liberar()
        camara.entregar(gris(ancho = 5))
        val f3 = fuente.siguiente().shouldNotBeNull()
        (f3.pixeles === f2.pixeles) shouldBe false
        f3.liberar()
        fuente.cerrar()
        fuente.buferesRetenidos().size shouldBe 0
        f2.pixeles.all { it == 0.toByte() } shouldBe true
        f3.pixeles.all { it == 0.toByte() } shouldBe true
    }

    "NAT-13 Búferes a cero: un frame liberado después de cerrar no queda retenido" {
        val camara = CamaraFalsa()
        val fuente = FuenteCamara(camara)
        fuente.abrir()
        camara.entregar(gris())
        val f = fuente.siguiente().shouldNotBeNull()
        fuente.cerrar()
        f.liberar()
        f.pixeles.all { it == 0.toByte() } shouldBe true
        fuente.buferesRetenidos().size shouldBe 0
    }

    "NAT-13 Búferes a cero: el analizador lanza a mitad de un frame de la cámara y todo queda a cero" {
        val camara = CamaraFalsa()
        var visto: ByteArray? = null
        val l = lector(analizar = { f -> visto = f.pixeles; throw IllegalStateException("analizador") })
        val fuente = FuenteCamara(camara)
        enUnHilo {
            val job = activo(l, fuente)
            camara.entregar(gris())
            job.join()
        }
        visto.shouldNotBeNull().all { it == 0.toByte() } shouldBe true
        fuente.buferesRetenidos().size shouldBe 0
    }

    "NAT-01 Flujo feliz con la fuente de cámara: planos Y de amarilla-1080p hasta resultado".config(enabled = Fixtures.disponibles()) {
        val camara = CamaraFalsa()
        val l = lector(bytes = Falsos.bytesPersonaBase)
        val s = Secuencia(l)
        val amarilla = Falsos.amarilla()
        val y = Luminancia.deRgba(amarilla.pixeles, amarilla.ancho, amarilla.alto)
        amarilla.liberar()
        val fuente = FuenteCamara(camara)
        enUnHilo {
            val job = activo(l, fuente)
            while (l.estado.value.fase != EstadoLector.Fase.RESULTADO) {
                // Una imagen cada vez que el Lector espera (`siguiente`), con relleno de fila como CameraX.
                camara.entregar(ImagenFalsa(1920, 1080, { px, py -> y[py * 1920 + px].toInt() and 0xFF }, pasoFila = 1984))
                kotlinx.coroutines.yield()
            }
            job.join()
        }
        y.fill(0)
        s.fases shouldBe listOf("permiso", "activo", "listo", "leyendo", "resultado")
        l.estado.value.resultado!!.campos["nuip"] shouldBe "9999123456"
        camara.abierta shouldBe false
        fuente.buferesRetenidos().size shouldBe 0
    }
})
