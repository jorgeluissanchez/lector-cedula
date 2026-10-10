package io.github.jorgeluissanchez.lectorcedula.calidad

/**
 * Umbrales de CAL-08 (sdk-nativo, NAT-03). Los valores por omisión NO se escriben aquí: se leen del recurso
 * `lectorcedula/umbrales-calidad.json`, generado desde `packages/capture/src/calidad/umbrales.ts` por
 * `packages/nucleo-js/scripts/generar-umbrales.mjs` (una prueba de Vitest falla si se desfasa).
 */
data class Umbrales(
    val laplacianoDesenfocado: Double,
    val laplacianoNitido: Double,
    val luminanciaSaturada: Double,
    val fraccionSaturadaMax: Double,
    val componenteSaturadoMax: Double,
    val luminanciaOscura: Double,
    val fraccionOscuraMax: Double,
    val mediaNegra: Double,
    val mediaOscuraOk: Double,
    val mediaClaraOk: Double,
    val mediaBlanca: Double,
    val ratioMinimo: Double,
    val ratioOk: Double,
    val umbralListo: Int,
    val framesConsecutivos: Int,
    val intervaloMinimoMs: Double,
    val laplacianoMinimoGuiado: Double,
) {
    companion object {
        private const val RECURSO = "/lectorcedula/umbrales-calidad.json"

        /** Umbrales por omisión leídos del JSON generado. */
        val POR_DEFECTO: Umbrales by lazy { desdeJson(leerRecurso()) }

        private fun leerRecurso(): String {
            val flujo = Umbrales::class.java.getResourceAsStream(RECURSO) ?: error("umbrales-no-empaquetados")
            return flujo.use { it.readBytes().toString(Charsets.UTF_8) }
        }

        /** Lee `{"umbrales": {...}}`. Falla si falta un campo: nunca se usan números inventados. */
        fun desdeJson(texto: String): Umbrales {
            val bloque = Regex("\"umbrales\"\\s*:\\s*\\{([^}]*)\\}").find(texto)?.groupValues?.get(1) ?: error("umbrales-invalidos")
            val valores = Regex("\"([A-Za-z]+)\"\\s*:\\s*(-?[0-9.eE+-]+)").findAll(bloque).associate { it.groupValues[1] to it.groupValues[2].toDouble() }
            fun v(campo: String): Double = valores[campo] ?: error("umbrales-invalidos: $campo")
            return Umbrales(
                laplacianoDesenfocado = v("laplacianoDesenfocado"),
                laplacianoNitido = v("laplacianoNitido"),
                luminanciaSaturada = v("luminanciaSaturada"),
                fraccionSaturadaMax = v("fraccionSaturadaMax"),
                componenteSaturadoMax = v("componenteSaturadoMax"),
                luminanciaOscura = v("luminanciaOscura"),
                fraccionOscuraMax = v("fraccionOscuraMax"),
                mediaNegra = v("mediaNegra"),
                mediaOscuraOk = v("mediaOscuraOk"),
                mediaClaraOk = v("mediaClaraOk"),
                mediaBlanca = v("mediaBlanca"),
                ratioMinimo = v("ratioMinimo"),
                ratioOk = v("ratioOk"),
                umbralListo = v("umbralListo").toInt(),
                framesConsecutivos = v("framesConsecutivos").toInt(),
                intervaloMinimoMs = v("intervaloMinimoMs"),
                laplacianoMinimoGuiado = v("laplacianoMinimoGuiado"),
            )
        }
    }
}
