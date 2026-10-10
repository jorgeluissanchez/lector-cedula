/**
 * Oráculo MRZ para las pruebas del núcleo Kotlin (sdk-nativo, NAT-06; tarea 1.5): el plan de vistas y giros de
 * `packages/capture/src/mrz/lector.ts` (LMI-11x, LMI-12b, LMI-12c, LMI-14b, OD-21), el recorte ampliado y el enderezado
 * que reciben el OCR, importados desde su fuente, en un IIFE que Kotest evalúa en QuickJS para comparar en el mismo
 * proceso el puerto Kotlin con la web. Sin OCR: `entorno.ts` (Tesseract.js, PNG) se sustituye por un módulo vacío al
 * construir. Solo pruebas: nunca se empaqueta en el AAR. Entrada y salida JSON; los píxeles viajan en base64.
 */
import { angulosProbados, enderezar, estimarInclinacion } from "../../capture/src/mrz/enderezar.js";
import { intentosMrz, intentosTd3, ordenVistasPorEvidencia, recortarYAmpliar } from "../../capture/src/mrz/lector.js";
import { evidenciaTd3, GIROS, girar, localizarConEvidencia, type CajaMrz, type Giro, type PixelesRgba } from "../../capture/src/mrz/localizar.js";
import { decodificarBase64 } from "../src/base64.js";

function rgba(b64: string, width: number, height: number): PixelesRgba {
  const b = decodificarBase64(b64);
  if (b === null) throw new Error("base64-invalido");
  return { data: new Uint8ClampedArray(b), width, height };
}

/** Huella FNV-1a de 32 bits de los bytes (la calcula igual el lado Kotlin). */
function huella(d: Uint8Array | Uint8ClampedArray): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < d.length; i++) {
    h ^= d[i] as number;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

const caja = (c: CajaMrz): number[] => [c.x, c.y, c.ancho, c.alto];

/**
 * Plan completo de intentos (giro, método y caja) del formato pedido; con `vistas` > 0, además el tamaño y la huella de
 * la imagen que recibe el OCR (recorte ampliado y enderezado) para los primeros `vistas` intentos.
 */
function plan(b64: string, w: number, h: number, formato: "td1" | "td3", vistas: number): string {
  const p = rgba(b64, w, h);
  const r: unknown[] = [];
  let i = 0;
  for (const { giro, imagen, candidato } of formato === "td3" ? intentosTd3(p) : intentosMrz(p)) {
    const e: Record<string, unknown> = { giro, metodo: candidato.metodo, caja: caja(candidato.caja) };
    if (i < vistas) {
      const v = enderezar(recortarYAmpliar(imagen, candidato.caja));
      e["vista"] = [v.width, v.height, huella(v.data)];
    }
    r.push(e);
    i++;
  }
  return JSON.stringify(r);
}

/** LMI-14b: orden de las vistas por la evidencia de cada una (0, 90, 270, 180 en la entrada). */
function orden(b64: string, w: number, h: number): string {
  const p = rgba(b64, w, h);
  const vistas = ([0, ...GIROS] as (0 | Giro)[]).map((giro) => {
    const { evidencia, ventanasMrz } = localizarConEvidencia(giro === 0 ? p : girar(p, giro));
    return { giro, evidencia, ventanasMrz };
  });
  const td3 = ([0, ...GIROS] as (0 | Giro)[]).map((giro) => {
    const e = evidenciaTd3(giro === 0 ? p : girar(p, giro));
    return { giro, evidencia: e.evidencia, ventanas: e.ventanas };
  });
  return JSON.stringify({ vistas, orden: ordenVistasPorEvidencia(vistas), td3 });
}

/** Recorte ampliado de `c` (LMI-04): tamaño y huella. */
function recorte(b64: string, w: number, h: number, x: number, y: number, ancho: number, alto: number): string {
  const v = recortarYAmpliar(rgba(b64, w, h), { x, y, ancho, alto });
  return JSON.stringify([v.width, v.height, huella(v.data)]);
}

/** LMI-04 y LMI-06: inclinación estimada y enderezado (tamaño y huella). */
function enderezado(b64: string, w: number, h: number): string {
  const p = rgba(b64, w, h);
  const v = enderezar(p);
  return JSON.stringify({ angulo: estimarInclinacion(p), vista: [v.width, v.height, huella(v.data)] });
}

(globalThis as Record<string, unknown>)["OraculoMrz"] = Object.freeze({
  plan,
  orden,
  recorte,
  enderezado,
  huella: (b64: string) => {
    const b = decodificarBase64(b64);
    return b === null ? -1 : huella(b);
  },
  angulos: () => JSON.stringify(angulosProbados()),
});
