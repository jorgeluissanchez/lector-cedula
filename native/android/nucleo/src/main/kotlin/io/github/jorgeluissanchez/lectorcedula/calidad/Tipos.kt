package io.github.jorgeluissanchez.lectorcedula.calidad

/**
 * Tipos de la calidad nativa (sdk-nativo, NAT-03 y NAT-04). Puerto literal de `packages/capture/src/calidad/tipos.ts`:
 * el núcleo trabaja sobre RGBA de 8 bits del frame de análisis (640 px de lado largo, CAL-01) y nunca lo retiene.
 */

/** Caja en píxeles (guía de CAM-08, tarjeta de OFF-22). */
data class Caja(val x: Double, val y: Double, val ancho: Double, val alto: Double)

/** Punto (x, y). */
data class Punto(val x: Double, val y: Double)

/** Orden: superior izquierda, superior derecha, inferior derecha, inferior izquierda. */
typealias Cuadrilatero = List<Punto>

/**
 * Frame de análisis RGBA. `pixeles` es del llamador: el núcleo solo lo lee durante la llamada (NAT-13).
 * `guia` es la guía en píxeles del frame original (SDK-61); sin ella, la de CAM-08.
 */
class FrameAnalisis(
    val ancho: Int,
    val alto: Int,
    val pixeles: ByteArray,
    val anchoOriginal: Int,
    val altoOriginal: Int,
    val guia: Caja? = null,
)

/** Motivos en orden de prioridad para los empates (CAL-07). */
enum class Motivo(val codigo: String) {
    ACERCA("acerca"),
    OSCURO("oscuro"),
    SOBREEXPUESTO("sobreexpuesto"),
    REFLEJO("reflejo"),
    DESENFOCADO("desenfocado"),
}

data class MetricaNitidez(val varianza: Double, val subscore: Int)

data class MetricaReflejo(val fraccionSaturada: Double, val componenteMayor: Double, val subscore: Int)

data class MetricaExposicion(val media: Double, val fraccionOscura: Double, val subscoreOscuro: Int, val subscoreSobreexpuesto: Int)

data class MetricaTamano(val ratio: Double, val subscore: Int)

data class MetricasCalidad(
    val nitidez: MetricaNitidez,
    val reflejo: MetricaReflejo,
    val exposicion: MetricaExposicion,
    val tamano: MetricaTamano?,
)

/** Score entero 0..100, motivo limitante (o `null`) y métricas (`null` sin documento, CAL-14). */
data class ResultadoCalidad(val score: Int, val motivo: Motivo?, val metricas: MetricasCalidad?)

/** Detección del documento: cuadrilátero en píxeles del frame de análisis o `null`. */
data class DeteccionDocumento(val cuadrilatero: Cuadrilatero?, val fuente: Fuente) {
    enum class Fuente { GUIA, MODELO }
}

/** Resultado de `analizarFrame`: éxito o código de error (`frame-invalido`, `cuadrilatero-invalido`). */
sealed interface ResultadoAnalisis {
    data class Ok(val resultado: ResultadoCalidad) : ResultadoAnalisis

    data class Error(val codigo: String) : ResultadoAnalisis
}

/** Contenido detectado por la presencia (OD-20). */
enum class Contenido(val codigo: String) {
    PDF417("pdf417"),
    MRZ_TD1("mrz-td1"),
    MRZ_TD3("mrz-td3"),
}
