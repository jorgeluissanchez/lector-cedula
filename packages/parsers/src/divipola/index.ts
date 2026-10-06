/**
 * @lector-cedula/parsers/divipola: equivalencia de códigos DIVIPOL (Registraduría) a DIVIPOLA (DANE)
 * (cambio divipol-registraduria, requisitos DV-15 y DV-17; design.md decisiones 3 y 6).
 *
 * Punto de entrada separado del principal: los datos de equivalencia son material adaptado de DIVIPOLA del DANE,
 * bajo CC BY-SA 4.0 (atribución en DIVIPOLA_METADATOS y en packages/parsers/THIRD_PARTY_NOTICES.md). Quien
 * redistribuya estos datos MUST hacerlo bajo CC BY-SA 4.0. El punto de entrada principal nunca importa este módulo.
 *
 * Función pura y total: reutiliza buscarDivipol para los motivos comunes (formato-invalido, sin-dato, desconocido)
 * y sus advertencias (D01 a D04), y devuelve objetos y arreglos nuevos en cada llamada.
 */
import { buscarDivipol } from "../divipol/buscar.js";
import { EQUIVALENCIAS_DIVIPOLA, FUENTE_EQUIVALENCIAS } from "./equivalencias.generated.js";

export type MetodoEquivalencia = "nombre-exacto" | "nombre-sin-parentesis" | "manual";
export type ResultadoEquivalencia =
  | { equivalente: true; divipol: string; divipola: string; metodo: MetodoEquivalencia; warnings: string[] }
  | {
      equivalente: false;
      divipol: string | null;
      motivo: "formato-invalido" | "sin-dato" | "desconocido" | "consulado" | "sin-equivalente";
      warnings: string[];
    };

export const DIVIPOLA_METADATOS: {
  readonly fuente: string;
  readonly url: string;
  readonly licencia: "CC-BY-SA-4.0";
  readonly sha256: string;
  readonly cambios: string;
} = Object.freeze({
  fuente: FUENTE_EQUIVALENCIAS.fuente,
  url: FUENTE_EQUIVALENCIAS.url,
  licencia: FUENTE_EQUIVALENCIAS.licencia,
  sha256: FUENTE_EQUIVALENCIAS.sha256,
  cambios: FUENTE_EQUIVALENCIAS.cambios,
});

const EQUIVALENCIAS = new Map(EQUIVALENCIAS_DIVIPOLA.map(([divipol, divipola, metodo]) => [divipol, { divipola, metodo }]));

export function divipolADivipola(codigo: unknown): ResultadoEquivalencia {
  const lugar = buscarDivipol(codigo);
  if (!lugar.encontrado) return { equivalente: false, divipol: lugar.codigo, motivo: lugar.motivo, warnings: lugar.warnings };
  if (lugar.tipo === "consulado") return { equivalente: false, divipol: lugar.codigo, motivo: "consulado", warnings: lugar.warnings };
  // Toda fila municipal está en la tabla generada (integridad DV-16); la ausencia se trata como sin equivalente.
  const equivalencia = EQUIVALENCIAS.get(lugar.codigo);
  if (equivalencia === undefined || equivalencia.divipola === null) {
    return { equivalente: false, divipol: lugar.codigo, motivo: "sin-equivalente", warnings: lugar.warnings };
  }
  return { equivalente: true, divipol: lugar.codigo, divipola: equivalencia.divipola, metodo: equivalencia.metodo, warnings: lugar.warnings };
}
