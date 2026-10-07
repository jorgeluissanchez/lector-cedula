// LMI-03 (spec lectura-mrz-imagen): extracción de las 3 líneas del texto OCR. Datos de @lector-cedula/fixtures.
import { PERSONA_BASE, arbFixtureMrz, generarMrzTd1 } from "@lector-cedula/fixtures";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { extraerLineasMrz } from "../../src/mrz/extraer.js";

const P = generarMrzTd1(PERSONA_BASE, { semilla: 1 });

describe("LMI-03 Extracción de las 3 líneas del texto OCR", { timeout: 60_000 }, () => {
  it("LMI-03 Espacios y minúsculas", () => {
    const texto = "  " + P.lineas[0].toLowerCase().split("").join(" ") + "\n\n" + P.lineas[1] + "\n" + P.lineas[2] + "  ";
    expect(extraerLineasMrz(texto)).toStrictEqual([...P.lineas]);
  });

  it("LMI-03 Relleno y recorte", () => {
    expect(P.lineas[2].endsWith("<")).toBe(true);
    const texto = [P.lineas[0] + "<<", P.lineas[1], P.lineas[2].slice(0, 29)].join("\n");
    expect(extraerLineasMrz(texto)).toStrictEqual([...P.lineas]);
  });

  it("LMI-03 Ruido alrededor", () => {
    expect(extraerLineasMrz("REPUBLICA DE COLOMBIA\n" + P.texto + "\nX1")).toStrictEqual([...P.lineas]);
  });

  it("LMI-03 Insuficiente", () => {
    expect(extraerLineasMrz("")).toBeNull();
    expect(extraerLineasMrz(P.lineas[0])).toBeNull();
    expect(extraerLineasMrz(P.lineas[0] + "\n" + P.lineas[1])).toBeNull();
  });

  it("LMI-03 Límites de longitud: 27 y 33 se descartan, 28 y 32 se aceptan", () => {
    const l = (n: number, c = "A") => c.repeat(n);
    expect(extraerLineasMrz([l(28), l(30), l(32, "<")].join("\n"))).toStrictEqual([l(28) + "<<", l(30), l(30, "<")]);
    expect(extraerLineasMrz([l(27), l(30), l(30)].join("\n"))).toBeNull();
    expect(extraerLineasMrz([l(33, "<"), l(30), l(30)].join("\n"))).toBeNull();
  });

  it("LMI-03 Exceso que no es relleno se descarta; caracteres fuera de [A-Z0-9<] también", () => {
    const l = "A".repeat(30);
    expect(extraerLineasMrz([l + "B", l, l].join("\n"))).toBeNull();
    expect(extraerLineasMrz([l + "<B", l, l].join("\n"))).toBeNull();
    expect(extraerLineasMrz(["A".repeat(29) + "-", l, l].join("\n"))).toBeNull();
    expect(extraerLineasMrz(["Ñ" + "A".repeat(29), l, l].join("\n"))).toBeNull();
  });

  it("LMI-03 Las 3 deben ser consecutivas; acepta CRLF y CR; no cambia caracteres internos", () => {
    const l = "A".repeat(30);
    expect(extraerLineasMrz([l, l, "corta", l].join("\n"))).toBeNull();
    expect(extraerLineasMrz(["O0IB".repeat(7) + "SZ", l, l].join("\r\n"))).toStrictEqual(["O0IB".repeat(7) + "SZ", l, l]);
    expect(extraerLineasMrz([l, l, l].join("\r"))).toStrictEqual([l, l, l]);
    expect(extraerLineasMrz(["corta", l, "B".repeat(30), "C".repeat(30), "D".repeat(30)].join("\n"))).toStrictEqual([l, "B".repeat(30), "C".repeat(30)]);
  });

  it("LMI-03 Entrada no textual: null", () => {
    expect(extraerLineasMrz(null)).toBeNull();
    expect(extraerLineasMrz(42)).toBeNull();
  });

  // Propiedades asíncronas: ceden el bucle de eventos en cada caso. Síncronas, bloqueaban el worker de Vitest más de
  // 60 s con la máquina cargada y Vitest abortaba con "Timeout calling onTaskUpdate".
  it("LMI-03 Round-trip con arbFixtureMrz (espacios, minúsculas y ruido) e idempotencia", async () => {
    const ruido = fc.array(fc.string({ maxLength: 27 }).filter((s) => !/[\r\n]/u.test(s)), { maxLength: 3 });
    await fc.assert(
      fc.asyncProperty(arbFixtureMrz(), fc.array(fc.boolean(), { minLength: 90, maxLength: 90 }), ruido, ruido, async (f, minus, antes, despues) => {
        const sucias = f.lineas.map((l, i) =>
          l
            .split("")
            .map((c, j) => (minus[i * 30 + j] === true ? ` ${c.toLowerCase()}\t` : c))
            .join(""),
        );
        const texto = [...antes, ...sucias, ...despues].join("\n");
        const r = extraerLineasMrz(texto);
        expect(r).toStrictEqual([...f.lineas]);
        expect(extraerLineasMrz((r ?? []).join("\n"))).toStrictEqual(r);
      }),
      { numRuns: 1000 },
    );
  });

  it("LMI-03 Nunca lanza (fc.anything)", async () => {
    await fc.assert(
      fc.asyncProperty(fc.anything(), async (x) => {
        const r = extraerLineasMrz(x);
        expect(r === null || (Array.isArray(r) && r.length === 3)).toBe(true);
      }),
      { numRuns: 1000 },
    );
  });

  it("LMI-03 Nunca lanza (texto binario)", async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ unit: "binary" }), async (x) => {
        const r = extraerLineasMrz(x);
        expect(r === null || r.every((l) => /^[A-Z0-9<]{30}$/u.test(l))).toBe(true);
      }),
      { numRuns: 1000 },
    );
  });
});
