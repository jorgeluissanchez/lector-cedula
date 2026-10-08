// FRA-01 contrato de tipos: se compila con `tsc -p packages/fraud/tsconfig.contrato.json` desde contrato.test.ts.
import type { Motivo, SenalRiesgo } from "../../src/index.js";

export const valido: Motivo = { codigo: "pantalla", puntaje: 0.9, detalle: "moire" };

export const codigoFueraDelVocabulario: Motivo = {
  // @ts-expect-error FRA-01: "deepfake" no pertenece al vocabulario cerrado.
  codigo: "deepfake",
  puntaje: 0.9,
  detalle: "moire",
};

export const detalleFueraDeLista: Motivo = {
  codigo: "pantalla",
  puntaje: 0.9,
  // @ts-expect-error FRA-01: el detalle es de lista cerrada.
  detalle: "9999123456",
};

// @ts-expect-error FRA-01: la versión es el literal 1.
export const versionDistinta: SenalRiesgo["version"] = 2;
