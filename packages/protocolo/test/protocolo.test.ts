// MOT-20 y MOT-22: contrato del protocolo compartido por el front (@lector-cedula/web) y el back (@lector-cedula/servidor).
import { readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  CABECERA_CLIENTE,
  CAMPO_CLIENTE,
  CAMPO_IMAGEN,
  ETAPAS_INTERMEDIAS,
  MOTIVOS_RECHAZO,
  TIPO_JSON,
  TIPO_NDJSON,
  validarEvento,
} from "../src/index.js";

const esquema = JSON.parse(readFileSync(new URL("../protocolo-ndjson.schema.json", import.meta.url), "utf8")) as {
  oneOf: { properties: { etapa: { enum?: string[]; const?: string } } }[];
  definitions: { motivo: { enum: string[] } };
};

describe("protocolo NDJSON", { timeout: 60_000 }, () => {
  it("MOT-20 constantes del protocolo", () => {
    expect(TIPO_NDJSON).toBe("application/x-ndjson; charset=utf-8");
    expect(TIPO_JSON).toBe("application/json; charset=utf-8");
    expect(CABECERA_CLIENTE).toBe("x-lector-cliente");
    expect(CAMPO_IMAGEN).toBe("imagen");
    expect(CAMPO_CLIENTE).toBe("cliente");
    expect(ETAPAS_INTERMEDIAS).toStrictEqual(["recibido", "leyendo", "fraude", "comparando"]);
  });

  it("MOT-22 los 9 motivos de rechazo, literales de la spec", () => {
    expect(MOTIVOS_RECHAZO).toStrictEqual([
      "no-coincide",
      "fraude",
      "ilegible",
      "menor-de-edad",
      "documento-no-admitido",
      "demasiado-grande",
      "tiempo-agotado",
      "ocupado",
      "error-interno",
    ]);
  });

  it("MOT-20 el esquema JSON y el validador comparten etapas y motivos", () => {
    expect(esquema.definitions.motivo.enum).toStrictEqual([...MOTIVOS_RECHAZO]);
    expect(esquema.oneOf[0]?.properties.etapa.enum).toStrictEqual([...ETAPAS_INTERMEDIAS]);
    expect(esquema.oneOf[1]?.properties.etapa.const).toBe("resultado");
  });

  it.each([
    [{ etapa: "recibido" }],
    [{ etapa: "leyendo", progreso: 0 }],
    [{ etapa: "leyendo", progreso: 1 }],
    [{ etapa: "fraude" }],
    [{ etapa: "comparando" }],
    [{ etapa: "resultado", ok: true, documento: { campos: {} }, riesgo: null }],
    [{ etapa: "resultado", ok: false, rechazo: { motivo: "error-interno" } }],
    [{ etapa: "resultado", ok: false, rechazo: { motivo: "no-coincide", diferencias: ["campos.nuip"] } }],
  ])("MOT-20 evento válido %j", (evento) => {
    expect(validarEvento(evento)).toBe(true);
  });

  it.each([
    [null],
    ["recibido"],
    [{}],
    [{ etapa: "otro" }],
    [{ etapa: "leyendo", progreso: 1.5 }],
    [{ etapa: "leyendo", progreso: -0.1 }],
    [{ etapa: "leyendo", progreso: "0.5" }],
    [{ etapa: "leyendo", progreso: Number.NaN }],
    [{ etapa: "recibido", documento: {} }],
    [{ etapa: "resultado" }],
    [{ etapa: "resultado", ok: "si" }],
    [{ etapa: "resultado", ok: true }],
    [{ etapa: "resultado", ok: true, documento: null }],
    [{ etapa: "resultado", ok: true, documento: {} }],
    [{ etapa: "resultado", ok: true, documento: { campos: null } }],
    [{ etapa: "resultado", ok: true, documento: { campos: {} }, rechazo: { motivo: "fraude" } }],
    [{ etapa: "resultado", ok: false }],
    [{ etapa: "resultado", ok: false, rechazo: { motivo: "inventado" } }],
    [{ etapa: "resultado", ok: false, rechazo: null }],
    [{ etapa: "resultado", ok: false, rechazo: { motivo: "no-coincide", diferencias: [1] } }],
    [{ etapa: "resultado", ok: false, rechazo: { motivo: "no-coincide", diferencias: "campos.nuip" } }],
    [{ etapa: "resultado", ok: false, rechazo: { motivo: "fraude" }, documento: {} }],
    [{ etapa: "resultado", ok: false, rechazo: { motivo: "fraude", extra: 1 } }],
    [{ etapa: "resultado", ok: true, documento: { campos: {} }, otro: 1 }],
  ])("MOT-20 evento inválido %j", (evento) => {
    expect(validarEvento(evento)).toBe(false);
  });

  it("MOT-20 el validador nunca lanza con entradas arbitrarias", () => {
    fc.assert(
      fc.property(fc.anything(), (x) => {
        expect(typeof validarEvento(x)).toBe("boolean");
      }),
      { numRuns: 1000 },
    );
  });
});
