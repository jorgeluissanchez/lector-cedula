/**
 * Oráculo de calidad para las pruebas del núcleo Kotlin (sdk-nativo, NAT-03, NAT-04; tarea 1.3): las funciones de
 * `packages/capture/src/calidad`, `flujo/guia.ts` y `mrz/localizar.ts`, importadas desde su fuente, en un IIFE que las
 * pruebas Kotlin evalúan en QuickJS para comparar, en el mismo proceso, el puerto Kotlin con la implementación web
 * sobre frames generados (diferencial con propiedades). Solo pruebas: nunca se empaqueta en el AAR. Entrada y salida
 * JSON; los píxeles viajan en base64.
 */
import { detectarPresencia, evaluarConPresencia, buscarTarjeta, hayMrz, hayMrzTd3, hayPdf417, hayPdf417Suave, LAPLACIANO_MINIMO_GUIADO, type Rect } from "../../capture/src/calidad/presencia.js";
import { rampa } from "../../capture/src/calidad/rampa.js";
import { dimensionesAnalisis } from "../../capture/src/calidad/reduccion.js";
import { calcularRegion } from "../../capture/src/calidad/region.js";
import { analizarFrame } from "../../capture/src/calidad/score.js";
import type { Cuadrilatero } from "../../capture/src/calidad/tipos.js";
import { UMBRALES_POR_DEFECTO } from "../../capture/src/calidad/umbrales.js";
import { calcularGuia, guiaEnAnalisis, type Caja } from "../../capture/src/flujo/guia.js";
import { evidenciaTd3, localizarConEvidencia } from "../../capture/src/mrz/localizar.js";
import { decodificarBase64 } from "../src/base64.js";

function bytes(b64: string): Uint8Array {
  const b = decodificarBase64(b64);
  if (b === null) throw new Error("base64-invalido");
  return b;
}

const rgba = (b64: string, width: number, height: number) => ({ data: new Uint8ClampedArray(bytes(b64)), width, height });

/**
 * CAL-07 sobre la guía de CAM-08 (o `guia`, SDK-61), presencia de OFF-22 y evaluación guiada de OFF-25, como el Worker
 * web. Con `fuente` `"modelo"` el cuadrilátero cuenta como detectado y entra el tamaño de CAL-06.
 */
function analizar(b64: string, ancho: number, alto: number, anchoOriginal: number, altoOriginal: number, guia: Caja | null, fuente: "guia" | "modelo" = "guia"): string {
  const frame = { ancho, alto, pixeles: new Uint8ClampedArray(bytes(b64)), anchoOriginal, altoOriginal };
  const cuad = guiaEnAnalisis(ancho, alto, anchoOriginal, altoOriginal, guia ?? undefined);
  const cal07 = analizarFrame(frame, { cuadrilatero: cuad, confianza: null, fuente }, UMBRALES_POR_DEFECTO);
  const presencia = detectarPresencia(frame, cuad);
  const guiado = cal07.ok ? evaluarConPresencia(cal07.resultado, () => presencia.presente, UMBRALES_POR_DEFECTO.umbralListo, LAPLACIANO_MINIMO_GUIADO) : null;
  return JSON.stringify({ cal07, presencia, guiado: guiado === null ? null : { score: guiado.score, motivo: guiado.motivo } });
}

/** CAL-02: tamaño de M y suma de los índices dentro (huella de la máscara), o `null` si el cuadrilátero es inválido. */
function region(cuad: Cuadrilatero, ancho: number, alto: number): string {
  const r = calcularRegion(cuad, ancho, alto);
  if (!r.ok) return "null";
  let huella = 0;
  r.mascara.forEach((v, i) => {
    if (v === 1) huella += i;
  });
  return JSON.stringify({ tamano: r.tamano, huella });
}

function mrz(b64: string, ancho: number, alto: number): string {
  const p = rgba(b64, ancho, alto);
  const td1 = localizarConEvidencia(p);
  const td3 = evidenciaTd3(p);
  return JSON.stringify({
    td1: { evidencia: td1.evidencia, ventanas: td1.ventanasMrz },
    td3: { evidencia: td3.evidencia, ventanas: td3.ventanas },
    hayMrz: hayMrz(p),
    hayMrzTd3: hayMrzTd3(p),
  });
}

function tarjeta(lumaB64: string, ancho: number, alto: number): string {
  const l = bytes(lumaB64);
  const t = buscarTarjeta(l, ancho, alto);
  const r: Rect = t ?? { x: 0, y: 0, ancho, alto };
  return JSON.stringify({ tarjeta: t, pdf417: hayPdf417(l, ancho, r), pdf417Suave: hayPdf417Suave(l, ancho, r) });
}

(globalThis as Record<string, unknown>)["OraculoCalidad"] = Object.freeze({
  analizar,
  region,
  mrz,
  tarjeta,
  rampa: (x: number, a: number, b: number) => rampa(x, a, b),
  guia: (ancho: number, alto: number, orientacion: "horizontal" | "vertical" | null, margen: number | null) =>
    JSON.stringify(calcularGuia(ancho, alto, { ...(orientacion === null ? {} : { orientacion }), ...(margen === null ? {} : { margen }) })),
  guiaEnAnalisis: (ancho: number, alto: number, anchoOriginal: number, altoOriginal: number) => JSON.stringify(guiaEnAnalisis(ancho, alto, anchoOriginal, altoOriginal)),
  dimensiones: (ancho: number, alto: number) => JSON.stringify(dimensionesAnalisis(ancho, alto)),
});
