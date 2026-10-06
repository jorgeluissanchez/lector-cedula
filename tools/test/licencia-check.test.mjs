import { describe, expect, it } from "vitest";
import { evaluarLicencia, evaluarNombre, evaluarManifiestoModelos } from "../licencia-check.mjs";

describe("evaluarLicencia", () => {
  it.each(["MIT", "Apache-2.0", "BSD-3-Clause", "ISC", "MPL-2.0", "CC-BY-4.0", "0BSD"])(
    "permite %s",
    (lic) => expect(evaluarLicencia(lic).ok).toBe(true),
  );

  it.each(["AGPL-3.0", "AGPL-3.0-only", "GPL-3.0", "CC-BY-NC-SA-4.0", "PolyForm-Noncommercial-1.0.0", "SSPL-1.0"])(
    "prohíbe %s",
    (lic) => expect(evaluarLicencia(lic).ok).toBe(false),
  );

  it("acepta una expresión OR si alguna alternativa es permitida", () => {
    expect(evaluarLicencia("(MIT OR GPL-3.0)").ok).toBe(true);
  });

  it("rechaza una expresión AND si alguna parte es prohibida", () => {
    expect(evaluarLicencia("(MIT AND AGPL-3.0)").ok).toBe(false);
  });

  it("marca como desconocida una licencia ausente", () => {
    const r = evaluarLicencia(undefined);
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/sin licencia/i);
  });
});

describe("evaluarNombre (lista negra explícita)", () => {
  it.each(["ultralytics", "fastmrz", "surya-ocr", "pyiqa", "insightface"])("bloquea %s", (n) => {
    expect(evaluarNombre(n).ok).toBe(false);
  });

  it("permite paquetes no listados", () => {
    expect(evaluarNombre("zxing-wasm").ok).toBe(true);
  });
});

describe("evaluarManifiestoModelos", () => {
  it("rechaza modelos con licencia prohibida o pendiente", () => {
    const errores = evaluarManifiestoModelos([
      { nombre: "minifasnet", licencia: "Apache-2.0" },
      { nombre: "buffalo_l", licencia: "insightface-noncommercial" },
      { nombre: "docaligner-lc050", licencia: "PENDIENTE" },
    ]);
    expect(errores.map((e) => e.nombre)).toEqual(["buffalo_l", "docaligner-lc050"]);
  });
});
