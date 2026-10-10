package io.github.jorgeluissanchez.lectorcedula

import io.github.jorgeluissanchez.lectorcedula.calidad.AnalizadorCalidad
import io.github.jorgeluissanchez.lectorcedula.calidad.Contenido
import io.github.jorgeluissanchez.lectorcedula.calidad.Motivo
import io.github.jorgeluissanchez.lectorcedula.calidad.ResultadoCalidad
import io.github.jorgeluissanchez.lectorcedula.motor.MotorJs
import io.kotest.core.spec.style.StringSpec
import io.kotest.matchers.shouldBe
import io.kotest.property.Arb
import io.kotest.property.arbitrary.enum
import io.kotest.property.arbitrary.list
import io.kotest.property.checkAll

/**
 * NAT-01 "Secuencias arbitrarias" (propiedad, Kotest; decisión 3 del orquestador en lugar de jqwik): secuencias de hasta
 * 50 eventos entre iniciar, cancelar, reintentar, destruir, frames, éxito y fallo solo producen pares de fases de
 * `TRANSICIONES` y ninguna llamada lanza. 1000 casos por omisión; `-Dnat.iteraciones` lo reduce bajo PIT.
 */
class LectorPropiedadNat01Test : StringSpec({
    val motor by lazy { MotorJs.desdeRecurso() }
    afterSpec { motor.close() }

    // Oráculo: TRANSICIONES de SDK-27 (packages/web/src/maquina.ts), copiadas aquí a propósito.
    val transiciones = setOf(
        "inicio>permiso", "permiso>activo", "permiso>error", "activo>listo", "listo>activo", "listo>leyendo", "activo>leyendo",
        "leyendo>resultado", "leyendo>activo", "leyendo>error", "activo>error", "listo>error", "permiso>inicio", "activo>inicio",
        "listo>inicio", "leyendo>inicio", "resultado>permiso", "error>permiso", "leyendo>verificando", "activo>verificando",
        "listo>verificando", "verificando>resultado", "verificando>activo", "verificando>error", "verificando>inicio",
    )
    val iteraciones = System.getProperty("nat.iteraciones")?.toIntOrNull() ?: 1000

    "NAT-01 Secuencias arbitrarias: cada par consecutivo de fases pertenece a TRANSICIONES y ninguna llamada lanza" {
        var pares = 0
        checkAll(iteraciones, Arb.list(Arb.enum<Evento>(), 0..50)) { eventos ->
            val guion = ArrayDeque(eventos)
            lateinit var lector: Lector
            val fuente = FuenteGuionada(guion) { lector }
            val dec = Decodificador { f, _ -> if (f.pixeles[1] == EXITO) Lectura.Pdf417(Falsos.bytesPersonaBase.copyOf()) else null }
            lector = Lector(motor, decodificador = dec, analizar = ::analizarFalso, fechaReferencia = { "2026-10-09" })
            val invalidos = mutableListOf<String>()
            lector.observador = { a, s ->
                val par = "${a.fase.codigo}>${s.fase.codigo}"
                pares++
                if (a.fase != s.fase && par !in transiciones) invalidos += par
            }
            while (guion.isNotEmpty()) {
                when (guion.removeFirst()) {
                    Evento.INICIAR -> lector.iniciar(fuente)
                    Evento.REINTENTAR -> lector.reintentar()
                    Evento.CANCELAR -> lector.cancelar()
                    Evento.DESTRUIR -> lector.destruir()
                    else -> Unit // eventos de la fuente fuera de una lectura: no aplican
                }
            }
            invalidos shouldBe emptyList()
            // Toda fuente abierta queda cerrada salvo que la lectura siga viva esperando frames.
            if (lector.estado.value.fase !in setOf(EstadoLector.Fase.ACTIVO, EstadoLector.Fase.LISTO, EstadoLector.Fase.PERMISO)) fuente.abierta shouldBe false
        }
        (pares > 0) shouldBe true
    }
}) {
    enum class Evento { INICIAR, CANCELAR, REINTENTAR, DESTRUIR, FRAME_MALO, FRAME_BUENO, FALLO_CALIDAD, EXITO_LECTURA, FALLO_LECTURA, DENEGAR }

    /** Fuente que consume el guion: los eventos de frame dan un frame marcado; cancelar o destruir llegan a mitad de lectura. */
    class FuenteGuionada(private val guion: ArrayDeque<Evento>, private val lector: () -> Lector) : FuenteFrames {
        var abierta = false
            private set

        override suspend fun abrir() {
            if (guion.firstOrNull() == Evento.DENEGAR) {
                guion.removeFirst()
                throw ErrorFuente("camara-denegada")
            }
            abierta = true
        }

        override suspend fun siguiente(): FrameCamara? {
            if (!abierta) return null
            val evento = guion.firstOrNull() ?: return null
            val marca = when (evento) {
                Evento.FRAME_MALO -> MALO
                Evento.FALLO_CALIDAD -> LANZA
                Evento.FRAME_BUENO, Evento.EXITO_LECTURA, Evento.FALLO_LECTURA -> BUENO
                Evento.CANCELAR, Evento.DESTRUIR -> BUENO
                else -> return null
            }
            guion.removeFirst()
            if (evento == Evento.CANCELAR) lector().cancelar()
            if (evento == Evento.DESTRUIR) lector().destruir()
            val lectura: Byte = if (evento == Evento.EXITO_LECTURA) EXITO else 0
            return FrameCamara(byteArrayOf(marca, lectura, 0, 0), 1, 1)
        }

        override fun cerrar() {
            abierta = false
        }
    }

    companion object {
        const val MALO: Byte = 1
        const val BUENO: Byte = 2
        const val LANZA: Byte = 3
        const val EXITO: Byte = 1

        fun analizarFalso(f: FrameCamara): AnalizadorCalidad.Evaluacion? = when (f.pixeles[0]) {
            MALO -> AnalizadorCalidad.Evaluacion(ResultadoCalidad(10, Motivo.ACERCA, null), null, emptyList())
            BUENO -> AnalizadorCalidad.Evaluacion(ResultadoCalidad(95, null, null), Contenido.PDF417, emptyList())
            LANZA -> throw IllegalStateException("analizador")
            else -> null
        }
    }
}
