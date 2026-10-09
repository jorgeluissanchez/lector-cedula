/**
 * Detector `inconsistencia` (FRA-11, FRA-18; decisiones P5 y P7). Reutiliza los validadores de
 * `@lector-cedula/parsers` sin duplicar su lógica. Reloj inyectado; puro y total.
 */
import { buscarDivipol, parsearMrzCedulaDigital, validarFormatoNuip } from "@lector-cedula/parsers";
import type { CamposDocumento, DetalleInconsistencia, Motivo } from "../tipos.js";

/** Motivos fuertes (puntaje 1) en orden de prioridad; el resto puntúa 0,6 (design.md, decisión 4). */
const FUERTES: readonly DetalleInconsistencia[] = ["fecha-imposible", "municipio-inexistente", "digito-control"];
const DEBILES: readonly DetalleInconsistencia[] = ["vencido", "pdf417-vs-visible", "mrz-vs-visible", "nuip-formato"];
const PUNTAJE_DEBIL = 0.6;

const ISO = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/;

/** Días desde la época de una fecha ISO válida, o `null`. */
function dia(fecha: string): number | null {
  const m = ISO.exec(fecha);
  if (m === null) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(t);
  if (d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) return null;
  return t / 86_400_000;
}

const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const texto = (x: unknown): string | undefined => (typeof x === "string" ? x : undefined);

function campos(x: unknown): CamposDocumento | undefined {
  if (!esObjeto(x)) return undefined;
  const c: CamposDocumento = {};
  for (const k of ["nuip", "fechaNacimiento", "fechaExpedicion", "fechaVencimiento", "codigoLugar"] as const) {
    const v = texto(x[k]);
    if (v !== undefined) c[k] = v;
  }
  return c;
}

const normalizarNuip = (x: string): string | null => {
  const r = validarFormatoNuip(x);
  return r.valido ? r.numero : null;
};

export interface ResultadoInconsistencia {
  motivo: Motivo | null;
  omitidas: string[];
}

export function detectarInconsistencia(tipo: "amarilla" | "digital", datos: unknown, reloj: () => Date): ResultadoInconsistencia {
  const hallados = new Set<DetalleInconsistencia>();
  const omitidas: string[] = [];
  let hoy: number;
  try {
    const t = reloj().getTime();
    hoy = Number.isFinite(t) ? Math.floor(t / 86_400_000) : Number.POSITIVE_INFINITY;
  } catch {
    hoy = Number.POSITIVE_INFINITY;
  }
  if (!esObjeto(datos)) return { motivo: null, omitidas: ["datos", "texto-visible"] };

  const pdf417 = campos(datos.pdf417);
  const visible = campos(datos.visible);
  const desdeMrz: CamposDocumento = {};
  if (datos.mrz !== undefined) {
    const lineas = esObjeto(datos.mrz) ? datos.mrz.lineas : undefined;
    const hoyIso = Number.isFinite(hoy) ? new Date(hoy * 86_400_000).toISOString().slice(0, 10) : "2026-01-01";
    const r = parsearMrzCedulaDigital(lineas, { fechaReferencia: hoyIso });
    if (!r.ok) omitidas.push("mrz");
    else {
      const d = r.digitosControl;
      if ([d.serial, d.nacimiento, d.vencimiento, d.compuesto].some((x) => x.estado === "invalido")) hallados.add("digito-control");
      if (r.campos.nuip !== null) desdeMrz.nuip = r.campos.nuip;
      if (r.campos.fechaNacimiento !== null) desdeMrz.fechaNacimiento = r.campos.fechaNacimiento;
      if (r.campos.fechaVencimiento !== null) desdeMrz.fechaVencimiento = r.campos.fechaVencimiento;
    }
  }

  for (const c of [pdf417, desdeMrz, visible]) {
    if (c === undefined) continue;
    const nac = c.fechaNacimiento === undefined ? undefined : dia(c.fechaNacimiento);
    const exp = c.fechaExpedicion === undefined ? undefined : dia(c.fechaExpedicion);
    if (nac === null || exp === null) hallados.add("fecha-imposible");
    if (typeof nac === "number" && (nac > hoy || (typeof exp === "number" && nac > exp))) hallados.add("fecha-imposible");
    if (typeof exp === "number" && exp > hoy) hallados.add("fecha-imposible");
    if (c.codigoLugar !== undefined) {
      const lugar = buscarDivipol(c.codigoLugar.replace("-", ""));
      if (!lugar.encontrado && lugar.motivo !== "sin-dato") hallados.add("municipio-inexistente");
    }
    if (c.nuip !== undefined && normalizarNuip(c.nuip) === null) hallados.add("nuip-formato");
    // P5 / FRA-18: solo la digital vence.
    // Sin reloj válido (hoy infinito) no se decide ningún vencimiento.
    if (c.fechaVencimiento !== undefined) {
      const v = dia(c.fechaVencimiento);
      if (v === null) hallados.add("fecha-imposible");
      else if (tipo === "digital" && Number.isFinite(hoy) && v < hoy) hallados.add("vencido");
    }
  }

  if (visible === undefined || visible.nuip === undefined) omitidas.push("texto-visible");
  else {
    const vis = normalizarNuip(visible.nuip);
    const comparar = (otro: string | undefined, detalle: DetalleInconsistencia) => {
      if (otro === undefined || vis === null) return;
      const n = normalizarNuip(otro);
      if (n !== null && n !== vis) hallados.add(detalle);
    };
    comparar(pdf417?.nuip, "pdf417-vs-visible");
    comparar(desdeMrz.nuip, "mrz-vs-visible");
  }

  const fuerte = FUERTES.find((d) => hallados.has(d));
  if (fuerte !== undefined) return { motivo: { codigo: "inconsistencia", puntaje: 1, detalle: fuerte }, omitidas };
  const debil = DEBILES.find((d) => hallados.has(d));
  if (debil !== undefined) return { motivo: { codigo: "inconsistencia", puntaje: PUNTAJE_DEBIL, detalle: debil }, omitidas };
  return { motivo: null, omitidas };
}
