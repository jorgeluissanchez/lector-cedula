// Interpretación pura de las líneas MRZ (OD-11, OD-11b, OD-21), sin OCR ni imagen: la usan el lector MRZ y el bundle
// `nucleo-js` del SDK nativo (sdk-nativo, NAT-07). Separada de lector.ts para no arrastrar Tesseract.js al bundle.
import { clasificarDocumento, parsearMrzCedulaDigital } from "@lector-cedula/parsers";
import type { FormatoMrz, IntentoMrz, ResultadoLectorMrz, ResultadoParserMrz } from "./lector.js";

/** `AAAA-MM-DD` existente con año 2000 a 2099 (el mismo dominio que acepta el parser). */
export function fechaReferenciaValida(opciones: unknown): string | null {
  if (typeof opciones !== "object" || opciones === null) return null;
  const f: unknown = (opciones as { fechaReferencia?: unknown }).fechaReferencia;
  const d = new Date(`${String(f)}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== f) return null;
  return f.startsWith("20") ? f : null;
}

function contarValidos(r: ResultadoParserMrz): number {
  const d = r.digitosControl;
  return [d.serial, d.nacimiento, d.vencimiento, d.compuesto].filter((x) => x.estado === "valido").length;
}

/**
 * Interpreta las líneas MRZ de una vista (OD-11, OD-11b, OD-21): pasaporte por TD3; por TD1, la cédula digital o, si no
 * lo es, una CE con todos sus dígitos válidos. `mrz-no-encontrada` si no es ninguno. Pura y síncrona: la usa el bucle
 * de OCR y el bundle `nucleo-js` con las líneas que lee el OCR nativo (sdk-nativo, NAT-07).
 */
export function interpretarLineasMrz(lineas: unknown, formato: FormatoMrz, fecha: string, intento: IntentoMrz): ResultadoLectorMrz {
  const noEncontrada = { ok: false, error: "mrz-no-encontrada" } as const;
  if (formato === "td3") {
    // OD-21: el parser TD3 rechaza cualquier dígito de control inválido; un pasaporte clasificado tiene los 5 válidos.
    const doc = clasificarDocumento(lineas, { fechaReferencia: fecha });
    return doc.ok && doc.tipoDocumento === "pasaporte" ? { ok: true, intento, digitosValidos: 5, documento: doc } : noEncontrada;
  }
  const resultado = parsearMrzCedulaDigital(lineas, { fechaReferencia: fecha });
  if (resultado.ok) return { ok: true, intento, digitosValidos: contarValidos(resultado), resultado };
  // OD-11 y OD-11b: si no es la cédula digital, el TD1 genérico (todos sus dígitos válidos) puede ser una CE o una TI por MRZ.
  const doc = clasificarDocumento(lineas, { fechaReferencia: fecha });
  if (doc.ok && doc.tipoDocumento === "cedula-extranjeria") return { ok: true, intento, digitosValidos: 4, documento: { ...doc, tipoDocumento: "cedula-extranjeria" } };
  if (!doc.ok && doc.error === "documento-no-admitido" && doc.warnings !== undefined) return { ok: false, error: doc.error, warnings: doc.warnings };
  return noEncontrada;
}
