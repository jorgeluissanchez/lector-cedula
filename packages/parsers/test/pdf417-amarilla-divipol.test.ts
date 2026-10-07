// fixture-sintetico: tramas de referencia ficticias (NUIP 9999...) de la spec parser-pdf417-amarilla.
import { describe, expect, it, vi } from "vitest";
import { parsearPdf417Amarilla } from "../src/index.js";
import type { ResultadoPdf417Amarilla } from "../src/index.js";
import { C, C_F, P1, P5, W } from "./ayudas/tramas-referencia.js";

const DIVIPOL = ["codigoDepartamentoNacimiento", "codigoMunicipioNacimiento"];

function exito(r: ResultadoPdf417Amarilla): Extract<ResultadoPdf417Amarilla, { ok: true }> {
  if (!r.ok) throw new Error(`se esperaba éxito y llegó ${r.error}`);
  return r;
}

describe("PA-15 Resolutor DIVIPOL inyectado", () => {
  const referencia = exito(parsearPdf417Amarilla(C(P1)));

  it("PA-15 Código encontrado (atrapa: llamar varias veces o con otro código)", () => {
    const espia = vi.fn(() => ({ encontrado: true, codigo: "16001", warnings: [] }));
    const r = exito(parsearPdf417Amarilla(C(P1), { divipol: espia }));
    expect(espia).toHaveBeenCalledTimes(1);
    expect(espia).toHaveBeenCalledWith("16001");
    expect(r.validaciones[3]).toStrictEqual({ id: "divipol-existe", estado: "ok", campos: DIVIPOL, detalle: null });
    expect([r.campos, r.confianza, r.warnings]).toStrictEqual([referencia.campos, referencia.confianza, referencia.warnings]);
  });

  it("PA-15 Código desconocido con su hipótesis (atrapa: perder los IDs del resolutor)", () => {
    const r = exito(
      parsearPdf417Amarilla(C(P1), { divipol: () => ({ encontrado: false, codigo: "16001", motivo: "desconocido", warnings: ["D01"] }) }),
    );
    expect(r.validaciones[3]).toStrictEqual({ id: "divipol-existe", estado: "fallida", campos: DIVIPOL, detalle: "desconocido" });
    expect(r.warnings).toStrictEqual(["D01"]);
  });

  it("PA-15 Código sin dato (atrapa: tratar 00000 como desconocido)", () => {
    const espia = vi.fn(() => ({ encontrado: false, codigo: "00000", motivo: "sin-dato", warnings: ["D04"] }));
    const r = exito(parsearPdf417Amarilla(C(P5), { divipol: espia }));
    expect(espia).toHaveBeenCalledWith("00000");
    expect(r.validaciones[3]).toStrictEqual({ id: "divipol-existe", estado: "no-aplica", campos: DIVIPOL, detalle: "sin-dato" });
    expect(r.warnings).toContain("D04");
  });

  it("PA-15 Resolutor defectuoso (atrapa: propagar la excepción o confiar en la forma de la respuesta)", () => {
    const resolutores = [
      () => {
        throw new Error("fallo");
      },
      () => "si",
      () => ({ encontrado: false, codigo: null, motivo: "formato-invalido", warnings: ["D01"] }),
    ];
    for (const divipol of resolutores) {
      const r = exito(parsearPdf417Amarilla(C(P1), { divipol }));
      expect(r.validaciones[3]).toStrictEqual({ id: "divipol-existe", estado: "no-aplica", campos: DIVIPOL, detalle: "error-resolutor" });
      expect(r.warnings).toStrictEqual(referencia.warnings);
    }
  });

  it("PA-15 Respuestas mal formadas o que lanzan al leerse son error-resolutor (atrapa: lectura no defensiva)", () => {
    const malas: unknown[] = [
      null,
      undefined,
      7,
      { encontrado: "true" },
      { encontrado: 1 },
      { encontrado: false },
      { encontrado: false, motivo: "DESCONOCIDO", warnings: ["D01"] },
      { encontrado: "no", motivo: "desconocido", warnings: ["D01"] },
      { encontrado: undefined, motivo: "sin-dato", warnings: ["D04"] },
      {
        get encontrado() {
          throw new Error("getter");
        },
      },
      {
        encontrado: true,
        get warnings() {
          throw new Error("getter");
        },
      },
    ];
    for (const respuesta of malas) {
      const r = exito(parsearPdf417Amarilla(C(P1), { divipol: () => respuesta }));
      expect([respuesta, r.validaciones[3]]).toStrictEqual([
        respuesta,
        { id: "divipol-existe", estado: "no-aplica", campos: DIVIPOL, detalle: "error-resolutor" },
      ]);
      expect(r.warnings).toStrictEqual([]);
    }
  });

  it("PA-15 Respuesta válida sin warnings o con warnings que no son arreglo (atrapa: exigir warnings)", () => {
    for (const respuesta of [{ encontrado: true }, { encontrado: true, warnings: "D01" }, { encontrado: true, warnings: { 0: "D01" } }]) {
      const r = exito(parsearPdf417Amarilla(C(P1), { divipol: () => respuesta }));
      expect(r.validaciones[3]).toStrictEqual({ id: "divipol-existe", estado: "ok", campos: DIVIPOL, detalle: null });
      expect(r.warnings).toStrictEqual([]);
    }
  });

  it("PA-15 Solo se copian IDs de hipótesis bien formados (atrapa: copiar texto arbitrario a warnings)", () => {
    const r = exito(
      parsearPdf417Amarilla(C(P1), {
        divipol: () => ({ encontrado: true, codigo: "16001", warnings: ["D02", "<b>", 7, "d03", "D02", "D0001", " D03", "D03 ", "D3", ["D05"], { toString: () => "D06" }] }),
      }),
    );
    expect(r.warnings).toStrictEqual(["D02"]);
  });

  it("PA-15 IDs del resolutor se ordenan y se unen a los del camino sin duplicados (atrapa: duplicados o desorden)", () => {
    const r = exito(parsearPdf417Amarilla(W(P1), { divipol: () => ({ encontrado: true, warnings: ["Z01", "H02", "A99", "D01"] }) }));
    expect(r.warnings).toStrictEqual(["A99", "D01", "H02", "Z01"]);
  });

  it("PA-15 Sin códigos no se consulta (atrapa: consultar con códigos null)", () => {
    const espia = vi.fn(() => ({ encontrado: true }));
    const r = exito(parsearPdf417Amarilla(C_F(P1), { divipol: espia }));
    expect(espia).not.toHaveBeenCalled();
    expect(r.validaciones[3]).toStrictEqual({ id: "divipol-existe", estado: "no-aplica", campos: DIVIPOL, detalle: "sin-codigos" });
  });

  it("PA-15 El resolutor se llama sin this (atrapa: exponer las opciones al resolutor)", () => {
    const espia = vi.fn(() => ({ encontrado: true }));
    parsearPdf417Amarilla(C(P1), { divipol: espia });
    expect(espia.mock.contexts).toStrictEqual([undefined]);
  });

  it("PA-15 Los códigos y la confianza no cambian con el resolutor (atrapa: reescribir códigos con la respuesta)", () => {
    const r = exito(parsearPdf417Amarilla(C(P1), { divipol: () => ({ encontrado: true, codigo: "99999" }) }));
    expect([r.campos.codigoDepartamentoNacimiento, r.campos.codigoMunicipioNacimiento]).toStrictEqual(["16", "001"]);
    expect(r.confianza).toStrictEqual(referencia.confianza);
  });
});
