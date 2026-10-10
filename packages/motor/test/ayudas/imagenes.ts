// Imágenes sintéticas de PERSONA_BASE (NUIP 9999123456) para las pruebas del motor, generadas en memoria con los
// mismos generadores que usa la CLI en tools/test/leer-foto.test.mjs (skill fixture-sintetico). Ningún dato real.
import { generarMrzTd1, generarPdf417, PERSONA_BASE } from "@lector-cedula/fixtures";
import { imagenSintetica, pngBlanco } from "../../../capture/test/pdf417/sintetica.js";
// @ts-expect-error módulo JS de evals sin tipos
import { crearRenderizador } from "../../../../evals/sinteticos/render-mrz.mjs";

export const NUIP = PERSONA_BASE.nuip;

export async function amarilla(): Promise<Uint8Array> {
  return imagenSintetica(generarPdf417(PERSONA_BASE, { semilla: 1 }).bytes);
}

export async function digital(): Promise<Uint8Array> {
  const render = (await crearRenderizador()) as { render(l: unknown): Promise<{ bytes: Uint8Array }>; cerrar(): Promise<void> };
  try {
    return (await render.render(generarMrzTd1(PERSONA_BASE, { semilla: 1 }).lineas)).bytes;
  } finally {
    await render.cerrar();
  }
}

export function sinDocumento(): Uint8Array {
  return pngBlanco(800, 600);
}
