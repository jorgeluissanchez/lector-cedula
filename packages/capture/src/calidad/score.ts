import { medirExposicion } from "./exposicion.js";
import { luminanciasFrame } from "./luminancia.js";
import { medirNitidez } from "./nitidez.js";
import { medirReflejo } from "./reflejo.js";
import { calcularRegion } from "./region.js";
import { medirTamano } from "./tamano.js";
import { MOTIVOS, type DeteccionDocumento, type FrameAnalisis, type Motivo, type ResultadoAnalisis } from "./tipos.js";
import type { Umbrales } from "./umbrales.js";

const NO_ENCONTRADO: ResultadoAnalisis = Object.freeze({
  ok: true,
  resultado: Object.freeze({ score: 0, motivo: "acerca", metricas: null }),
});

function frameValido(f: FrameAnalisis): boolean {
  return Number.isInteger(f.ancho) && Number.isInteger(f.alto) && f.ancho > 0 && f.alto > 0 && f.pixeles.length === f.ancho * f.alto * 4;
}

/**
 * Score de calidad de CAL-07 sobre un frame de análisis y la detección del documento. Puro y determinista: la misma
 * función corre en el Worker (CAL-09) y en Node. No retiene el frame.
 * - Sin documento (`cuadrilatero: null`): score 0, motivo `acerca`, métricas `null` (CAL-14).
 * - Frame mal formado: `frame-invalido`; cuadrilátero rechazado por CAL-02: `cuadrilatero-invalido`.
 */
export function analizarFrame(frame: FrameAnalisis, deteccion: DeteccionDocumento, u: Readonly<Umbrales>): ResultadoAnalisis {
  if (!frameValido(frame)) return { ok: false, codigo: "frame-invalido" };
  const { ancho, alto } = frame;
  const cuad = deteccion.cuadrilatero;
  if (cuad === null) return NO_ENCONTRADO;
  const region = calcularRegion(cuad, ancho, alto);
  if (!region.ok) return { ok: false, codigo: region.codigo };

  const lum = luminanciasFrame(frame.pixeles, ancho, alto);
  const nitidez = medirNitidez(lum, region.mascara, ancho, alto, u);
  const reflejo = medirReflejo(lum, region.mascara, ancho, alto, region.tamano, u);
  const exposicion = medirExposicion(lum, region.mascara, region.tamano, u);
  const tamano = deteccion.fuente === "modelo" ? medirTamano(cuad, ancho, alto, u) : null;

  const subscores: Readonly<Record<Motivo, number | null>> = {
    acerca: tamano === null ? null : tamano.subscore,
    oscuro: exposicion.subscoreOscuro,
    sobreexpuesto: exposicion.subscoreSobreexpuesto,
    reflejo: reflejo.subscore,
    desenfocado: nitidez.subscore,
  };
  // Mínimo de los subscores evaluados; en empate gana el primero en el orden de MOTIVOS.
  let score = 100;
  let limitante: Motivo = "desenfocado";
  for (let i = MOTIVOS.length - 1; i >= 0; i--) {
    const motivo = MOTIVOS[i] as Motivo;
    const s = subscores[motivo];
    if (s !== null && s <= score) {
      score = s;
      limitante = motivo;
    }
  }
  return {
    ok: true,
    resultado: { score, motivo: score < u.umbralListo ? limitante : null, metricas: { nitidez, reflejo, exposicion, tamano } },
  };
}
