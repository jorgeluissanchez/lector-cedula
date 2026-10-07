// fixture-sintetico: defectos del verificador (FX-03, FX-05, FX-14, FX-21, FX-23); personas ficticias con prefijo 9999.
import { readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { arbFixtureMrz } from "../src/arbitrarios.js";
import { casosPdf417 } from "../src/casos.js";
import { ErrorFixture } from "../src/errores.js";
import { generarMrzTd1 } from "../src/mrz.js";
import { generarPdf417 } from "../src/pdf417.js";
import { PERSONA_BASE, type PersonaFicticia } from "../src/persona.js";

function capturar(fn: () => unknown): ErrorFixture {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ErrorFixture);
    return e as ErrorFixture;
  }
  throw new Error("se esperaba ErrorFixture y no lanzó nada");
}

/** Persona cuyo `nuip` es un getter que da un número sintético la primera vez y uno real después. */
function personaCambiante(): PersonaFicticia {
  let lecturas = 0;
  const p: Record<string, unknown> = { ...PERSONA_BASE };
  Object.defineProperty(p, "nuip", { enumerable: true, get: () => (lecturas++ === 0 ? "9999123456" : "1234567890") });
  return p as unknown as PersonaFicticia;
}

describe("FX-05 Cada campo de la persona se lee una sola vez", { timeout: 60_000 }, () => {
  it("FX-05 Un getter que cambia de valor no saca un NUIP fuera de rango al PDF417", () => {
    const f = generarPdf417(personaCambiante());
    expect(f.esperado.nuip).toBe("9999123456");
    expect(new TextDecoder("latin1").decode(f.bytes.subarray(48, 58))).toBe("9999123456");
  });

  it("FX-05 Un getter que cambia de valor no saca un NUIP fuera de rango a la MRZ", () => {
    const f = generarMrzTd1(personaCambiante());
    expect(f.lineas[1].slice(18, 28)).toBe("9999123456");
    expect(f.persona.nuip).toBe("9999123456");
  });
});

describe("FX-03 Claves propias y getters", { timeout: 60_000 }, () => {
  it("FX-03 Una clave símbolo de más hace la persona inválida", () => {
    const p = { ...PERSONA_BASE, [Symbol("extra")]: 1 };
    expect(capturar(() => generarPdf417(p)).codigo).toBe("persona-invalida");
  });

  it("FX-03 Una clave no enumerable de más hace la persona inválida", () => {
    const p: Record<string, unknown> = { ...PERSONA_BASE };
    Object.defineProperty(p, "apodo", { enumerable: false, value: "X" });
    expect(capturar(() => generarPdf417(p as unknown as PersonaFicticia)).codigo).toBe("persona-invalida");
  });

  it("FX-03 Un getter que lanza produce ErrorFixture", () => {
    const p: Record<string, unknown> = { ...PERSONA_BASE };
    Object.defineProperty(p, "rh", { enumerable: true, get: () => { throw new RangeError("x"); } });
    const e = capturar(() => generarPdf417(p as unknown as PersonaFicticia));
    expect(e.codigo).toBe("persona-invalida");
  });

  it("FX-03 Un Proxy que lanza al enumerar produce ErrorFixture", () => {
    const p = new Proxy({ ...PERSONA_BASE }, { ownKeys: () => { throw new RangeError("x"); } });
    expect(capturar(() => generarMrzTd1(p)).codigo).toBe("persona-invalida");
  });
});

describe("FX-21 posicionesOcr con huecos", { timeout: 60_000 }, () => {
  it("FX-21 Un hueco en posicionesOcr se rechaza con opcion-ocr-invalida", () => {
    // eslint-disable-next-line no-sparse-arrays
    const posicionesOcr = [, { linea: 2, posicion: 0 }] as unknown as { linea: 2; posicion: number }[];
    const e = capturar(() => generarMrzTd1(PERSONA_BASE, { variante: "ocr-b", posicionesOcr }));
    expect(e.codigo).toBe("opcion-ocr-invalida");
    expect(e.campo).toBe("posicionesOcr");
  });
});

describe("FX-20 Menos posiciones elegibles que errores pedidos", { timeout: 60_000 }, () => {
  it("FX-20 Con 4 posiciones elegibles y erroresOcr 5 se inyectan las 4, sin lanzar", () => {
    const p = { ...PERSONA_BASE, nuip: "9999934744", serialDocumento: "999947947", lugarExpedicion: "39394", fechaNacimiento: "1979-03-07", fechaVencimiento: "2049-04-04" };
    const f = generarMrzTd1(p, { variante: "ocr-b", erroresOcr: 5 });
    expect(f.inyecciones).toHaveLength(4);
    expect(new Set(f.inyecciones.map((i) => `${i.linea}:${i.posicion}`)).size).toBe(4);
  });
});

describe("FX-23 Presupuesto de 30 caracteres de la línea 3", { timeout: 60_000 }, () => {
  it("FX-23 arbFixtureMrz produce líneas 3 de exactamente 30 caracteres sin segundo nombre", () => {
    let exactas = 0;
    fc.assert(
      fc.property(arbFixtureMrz({ variantes: ["valida"] }), (f) => {
        const p = f.persona;
        if (p.segundoNombre === "" && p.primerApellido.length + p.segundoApellido.length + p.primerNombre.length + 3 === 30) exactas++;
      }),
      { numRuns: 3000 },
    );
    expect(exactas).toBeGreaterThan(0);
  });

  it("FX-23 arbFixtureMrz produce líneas 3 de exactamente 30 caracteres con segundo nombre", () => {
    let exactas = 0;
    fc.assert(
      fc.property(arbFixtureMrz({ variantes: ["valida"] }), (f) => {
        const p = f.persona;
        const largo = p.primerApellido.length + p.segundoApellido.length + p.primerNombre.length + 3;
        if (p.segundoNombre !== "" && largo + 1 + p.segundoNombre.length === 30) exactas++;
      }),
      { numRuns: 3000 },
    );
    expect(exactas).toBeGreaterThan(0);
  });

  it("FX-18 DE LA OSSA + SINTETICA + FICTICIO cabe exactamente", () => {
    const f = generarMrzTd1({ ...PERSONA_BASE, primerApellido: "DE LA OSSA", segundoApellido: "FICTICIO", primerNombre: "SINTETICA", segundoNombre: "" });
    expect(f.lineas[2]).toBe("DE<LA<OSSA<FICTICIO<<SINTETICA");
  });
});

describe("FX-14 H05b en los casos con RH AB", { timeout: 60_000 }, () => {
  it("FX-14 Los casos rh-ab-* declaran H05b y los demás no", () => {
    for (const c of casosPdf417()) {
      expect(c.fixture.hipotesis.includes("H05b" as never), c.id).toBe(c.fixture.esperado.rh.startsWith("AB"));
      expect([...c.fixture.hipotesis]).toStrictEqual([...c.fixture.hipotesis].sort());
    }
  });

  it("FX-14 H05b está registrada y G01 figura como refutada en parte en su fila", () => {
    const registro = readFileSync(new URL("../../../docs/decisiones/hipotesis-formato.md", import.meta.url), "utf8");
    expect(registro).toContain("| H05b |");
    const filaG01 = registro.split("\n").find((l) => l.startsWith("| G01 |")) ?? "";
    expect(filaG01).toContain("refutada en parte");
  });
});
