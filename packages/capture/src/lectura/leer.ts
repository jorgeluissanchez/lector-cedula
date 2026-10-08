// Orquestación pura de la lectura (OFF-06, OFF-08; design.md, decisión 2), en el mismo orden que tools/leer-foto.mjs:
// primero PDF417; solo si el error es `pdf417-no-encontrado`, la MRZ TD1 con el plan de giros. Devuelve el resultado
// ya enmascarado (OFF-09) y pone a cero los bytes del PDF417 tras parsearlos (OFF-11).
import type { Pixeles } from "../pdf417/decodificar.js";
import { conLugarNacimiento } from "./lugar.js";
import { enmascararCamposPdf417, enmascararResultadoMrz } from "./mascara.js";
import type { DependenciasLectura, OpcionesLectura, ResultadoLectura } from "./tipos.js";

const CANCELADA: ResultadoLectura = { ok: false, error: "cancelada" };

/** Función aparte: la señal puede abortarse durante un `await` (TypeScript estrecharía `aborted` a `false`). */
function abortada(senal: AbortSignal | undefined): boolean {
  return senal?.aborted === true;
}

export async function leerDocumento(pixeles: Pixeles, deps: DependenciasLectura, opciones: OpcionesLectura): Promise<ResultadoLectura> {
  const { senal, fechaReferencia } = opciones;
  if (abortada(senal)) return CANCELADA;
  const imagen = await deps.decodificar(pixeles);
  if (abortada(senal)) {
    if (imagen.ok) imagen.bytes.fill(0);
    return CANCELADA;
  }
  if (imagen.ok) {
    const resultado = deps.parsearPdf417(imagen.bytes, { divipol: deps.buscarDivipol });
    imagen.bytes.fill(0);
    if (!resultado.ok) return { ok: false, tipo: "pdf417", error: "pdf417-no-valido" };
    const conLugar = conLugarNacimiento(resultado, deps.buscarDivipol);
    return { ok: true, tipo: "pdf417", intento: imagen.intento, resultado: { ...conLugar, campos: enmascararCamposPdf417(conLugar.campos) } };
  }
  if (imagen.error !== "pdf417-no-encontrado") return { ok: false, error: imagen.error };

  const lectura = await deps.lectorMrz.leer(pixeles, { fechaReferencia });
  if (abortada(senal)) return CANCELADA;
  if (!lectura.ok) return { ok: false, tipo: "mrz", error: lectura.error };
  if (!lectura.resultado.valido) return { ok: false, tipo: "mrz", error: "mrz-no-valida" };
  return { ok: true, tipo: "mrz", intento: lectura.intento, resultado: enmascararResultadoMrz(lectura.resultado) };
}
