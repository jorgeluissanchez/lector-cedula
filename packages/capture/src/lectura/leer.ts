// Orquestación pura de la lectura (OFF-06, OFF-08, OFF-27; design.md, decisión 2). Sin pista, el mismo orden que
// tools/leer-foto.mjs: primero PDF417; solo si el error es `pdf417-no-encontrado`, la MRZ TD1 con el plan de giros. Con
// `pista` (el contenido que vio la presencia, OFF-27) empieza por ese lector y prueba el otro solo como respaldo cuando
// el primero no encuentra nada (y `respaldo` no es `false`). Devuelve el resultado enmascarado salvo con
// `enmascarar: false` (OFF-09; la PWA muestra los datos completos) y pone a cero los bytes del PDF417 tras parsearlos (OFF-11).
import type { Pixeles } from "../pdf417/decodificar.js";
import { esMayorDeEdad } from "./edad.js";
import { conLugarNacimiento } from "./lugar.js";
import { enmascararCamposPdf417, enmascararResultadoMrz } from "./mascara.js";
import type {
  DependenciasLectura,
  OpcionesLectura,
  ResultadoLectura,
  TipoLectura,
} from "./tipos.js";

const CANCELADA: ResultadoLectura = { ok: false, error: "cancelada" };

/** Función aparte: la señal puede abortarse durante un `await` (TypeScript estrecharía `aborted` a `false`). */
function abortada(senal: AbortSignal | undefined): boolean {
  return senal?.aborted === true;
}

/** Resultado de un lector: `null` si no encontró nada (se puede probar el otro). */
type Paso = { readonly final: ResultadoLectura } | { readonly noEncontrado: ResultadoLectura };

async function pasoPdf417(
  pixeles: Pixeles,
  deps: DependenciasLectura,
  opciones: OpcionesLectura,
): Promise<Paso> {
  const { senal, fechaReferencia, enmascarar = true } = opciones;
  const imagen = await deps.decodificar(pixeles);
  if (abortada(senal)) {
    if (imagen.ok) imagen.bytes.fill(0);
    return { final: CANCELADA };
  }
  if (!imagen.ok) {
    if (imagen.error === "pdf417-no-encontrado")
      return { noEncontrado: { ok: false, tipo: "pdf417", error: "pdf417-no-encontrado" } };
    return { final: { ok: false, error: imagen.error } };
  }
  let resultado: ReturnType<DependenciasLectura["parsearPdf417"]>;
  try {
    resultado = deps.parsearPdf417(imagen.bytes, { divipol: deps.buscarDivipol });
  } finally {
    imagen.bytes.fill(0);
  }
  if (!resultado.ok) return { final: { ok: false, tipo: "pdf417", error: "pdf417-no-valido" } };
  if (!esMayorDeEdad(resultado.campos.fechaNacimiento, fechaReferencia))
    return { final: { ok: false, tipo: "pdf417", error: "menor-de-edad" } };
  const conLugar = conLugarNacimiento(resultado, deps.buscarDivipol);
  return {
    final: {
      ok: true,
      tipo: "pdf417",
      intento: imagen.intento,
      resultado: enmascarar ? { ...conLugar, campos: enmascararCamposPdf417(conLugar.campos) } : conLugar,
    },
  };
}

async function pasoMrz(
  pixeles: Pixeles,
  deps: DependenciasLectura,
  opciones: OpcionesLectura,
): Promise<Paso> {
  const { senal, fechaReferencia, enmascarar = true } = opciones;
  const lectura = await deps.lectorMrz.leer(pixeles, { fechaReferencia });
  if (abortada(senal)) return { final: CANCELADA };
  if (!lectura.ok) {
    const r: ResultadoLectura = { ok: false, tipo: "mrz", error: lectura.error };
    return lectura.error === "mrz-no-encontrada" ? { noEncontrado: r } : { final: r };
  }
  if (!lectura.resultado.valido) return { final: { ok: false, tipo: "mrz", error: "mrz-no-valida" } };
  const nacimiento = lectura.resultado.campos.fechaNacimiento;
  // Stryker disable next-line ConditionalExpression: equivalente; con `valido` la fecha nunca es null (MZ-17), se comprueba para estrechar el tipo.
  if (nacimiento === null || !esMayorDeEdad(nacimiento, fechaReferencia))
    return { final: { ok: false, tipo: "mrz", error: "menor-de-edad" } };
  return {
    final: {
      ok: true,
      tipo: "mrz",
      intento: lectura.intento,
      resultado: enmascarar ? enmascararResultadoMrz(lectura.resultado) : lectura.resultado,
    },
  };
}

const PASOS: Readonly<Record<TipoLectura, typeof pasoPdf417>> = { pdf417: pasoPdf417, mrz: pasoMrz };

export async function leerDocumento(
  pixeles: Pixeles,
  deps: DependenciasLectura,
  opciones: OpcionesLectura,
): Promise<ResultadoLectura> {
  if (abortada(opciones.senal)) return CANCELADA;
  const primero: TipoLectura = opciones.pista ?? "pdf417";
  const a = await PASOS[primero](pixeles, deps, opciones);
  if ("final" in a) return a.final;
  // Sin pista la MRZ siempre se intenta tras no encontrar el PDF417 (OFF-06); con pista, salvo `respaldo: false`.
  if (opciones.pista !== undefined && opciones.respaldo === false) return a.noEncontrado;
  const b = await PASOS[primero === "pdf417" ? "mrz" : "pdf417"](pixeles, deps, opciones);
  return "final" in b ? b.final : b.noEncontrado;
}
