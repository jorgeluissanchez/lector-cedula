// fixture-sintetico: trama de referencia ficticia C(P3) (NUIP 9999000002) de la spec parser-pdf417-amarilla.
import { describe, expect, it } from "vitest";
import { buscarDivipol, parsearPdf417Amarilla } from "../src/index.js";
import { C, C_F, P1, P3, P5 } from "./ayudas/tramas-referencia.js";

describe("PA-15 Integración con la búsqueda DIVIPOL real", () => {
  it("PA-15 Integración con la búsqueda DIVIPOL real (atrapa: interfaz del resolutor incompatible con buscarDivipol)", () => {
    const r = parsearPdf417Amarilla(C(P3), { divipol: buscarDivipol });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.validaciones[3]).toStrictEqual({
      id: "divipol-existe",
      estado: "ok",
      campos: ["codigoDepartamentoNacimiento", "codigoMunicipioNacimiento"],
      detalle: null,
    });
    expect(r.campos.codigoMunicipioNacimiento).toBe("019");
  });

  it("PA-15 La búsqueda real no cambia campos ni confianza y sin códigos no se consulta (atrapa: reescribir códigos)", () => {
    const sin = parsearPdf417Amarilla(C(P1));
    const con = parsearPdf417Amarilla(C(P1), { divipol: buscarDivipol });
    expect(sin.ok && con.ok && [con.campos, con.confianza]).toStrictEqual(sin.ok && [sin.campos, sin.confianza]);
    const f = parsearPdf417Amarilla(C_F(P1), { divipol: buscarDivipol });
    expect(f.ok && f.validaciones[3]?.detalle).toBe("sin-codigos");
    const p5 = parsearPdf417Amarilla(C(P5), { divipol: buscarDivipol });
    expect(p5.ok && p5.validaciones[3]?.estado).not.toBe("ok");
  });
});
