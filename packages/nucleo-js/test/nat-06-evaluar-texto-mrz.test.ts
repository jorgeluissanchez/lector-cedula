// fixture-sintetico: PERSONA_BASE (NUIP 9999123456) y el pasaporte sintético de OD-01; nunca datos reales.
// NAT-06 y NAT-07 (sdk-nativo, tarea 1.5): `evaluarTextoMrz` es la regla que el bucle de OCR nativo consulta en cada
// vista (extracción de líneas y dígitos de control). Debe dar lo mismo que el bucle de `crearLectorMrz` de la web:
// `extraerLineasMrz`/`extraerLineasTd3` seguidas de `interpretarLineasMrz`.
import { arbFixtureMrz, generarMrzTd1, PERSONA_BASE } from "@lector-cedula/fixtures";
import fc from "fast-check";
import { beforeAll, describe, expect, it } from "vitest";
import { extraerLineasMrz, extraerLineasTd3 } from "../../capture/src/mrz/extraer.js";
import { interpretarLineasMrz } from "../../capture/src/mrz/interpretar.js";
import { codigoBundle, evaluarEnVm } from "./ayuda.js";

const FECHA = "2026-10-09";
const DIGITAL = generarMrzTd1(PERSONA_BASE, { semilla: 1 }).lineas;
const PASAPORTE = ["P<COLPEREZ<NUNEZ<<ANA<MARIA<<<<<<<<<<<<<<<<<", "AZ12345673COL9002155F31021451234567890<<<<78"];

type Evaluar = (texto: unknown, opciones?: unknown) => unknown;
let evaluar: Evaluar;

beforeAll(async () => {
  const { api } = evaluarEnVm(await codigoBundle());
  evaluar = (api as unknown as { evaluarTextoMrz: Evaluar }).evaluarTextoMrz;
}, 60_000);

/** Oráculo: el paso del bucle web (lector.ts) sobre el mismo texto, resumido en la forma de `evaluarTextoMrz`. */
function oraculoWeb(texto: unknown, formato: "td1" | "td3"): unknown {
  const lineas = formato === "td3" ? extraerLineasTd3(texto) : extraerLineasMrz(texto);
  if (lineas === null) return { ok: false, error: "mrz-no-encontrada", lineas: null };
  const r = interpretarLineasMrz(lineas, formato, FECHA, "nativo" as never);
  if (!r.ok) return { ok: false, error: r.error, lineas };
  return { ok: true, lineas, digitosValidos: r.digitosValidos, documento: "documento" in r };
}

describe("NAT-06 evaluarTextoMrz en el bundle", { timeout: 60_000 }, () => {
  it("NAT-06 Digital TD1: texto OCR con ruido de espacios, minúsculas y líneas en blanco da las 3 líneas y 4 dígitos válidos", () => {
    const texto = `\n  ${DIGITAL[0].toLowerCase()}\n\n${DIGITAL[1].replace(/</gu, "< ")}\r\n${DIGITAL[2]}\nRUIDO\n`;
    expect(evaluar(texto, { fechaReferencia: FECHA })).toStrictEqual({ ok: true, lineas: [...DIGITAL], digitosValidos: 4, documento: false });
  });

  it("NAT-06 Pasaporte TD3: con formato td3 da las 2 líneas de 44 y un documento", () => {
    const r = evaluar(PASAPORTE.join("\n"), { fechaReferencia: FECHA, formato: "td3" }) as { ok: boolean; lineas: string[]; digitosValidos: number; documento: boolean };
    expect(r).toStrictEqual({ ok: true, lineas: PASAPORTE, digitosValidos: 5, documento: true });
    expect(r.lineas.map((l) => l.length)).toStrictEqual([44, 44]);
  });

  it("NAT-06 El formato td3 solo se elige de forma explícita: el texto TD3 con formato td1 no tiene 3 líneas", () => {
    expect(evaluar(PASAPORTE.join("\n"), { fechaReferencia: FECHA })).toStrictEqual({ ok: false, error: "mrz-no-encontrada", lineas: null });
    expect(evaluar(PASAPORTE.join("\n"), { fechaReferencia: FECHA, formato: "TD3" })).toStrictEqual({ ok: false, error: "mrz-no-encontrada", lineas: null });
  });

  it("NAT-06 Un dígito de control dañado baja digitosValidos sin perder las líneas", () => {
    const l2 = DIGITAL[1];
    const roto = `${l2.slice(0, 6)}${(Number(l2[6]) + 1) % 10}${l2.slice(7)}`;
    const r = evaluar([DIGITAL[0], roto, DIGITAL[2]].join("\n"), { fechaReferencia: FECHA }) as { ok: boolean; digitosValidos: number; lineas: string[] };
    expect(r.ok).toBe(true);
    expect(r.digitosValidos).toBeLessThan(4);
    expect(r.lineas[1]).toBe(roto);
  });

  it("NAT-06 Sin texto MRZ, texto no string o fecha inválida: error sin lanzar", () => {
    expect(evaluar("HOLA\nMUNDO", { fechaReferencia: FECHA })).toStrictEqual({ ok: false, error: "mrz-no-encontrada", lineas: null });
    expect(evaluar(42, { fechaReferencia: FECHA })).toStrictEqual({ ok: false, error: "mrz-no-encontrada", lineas: null });
    expect(evaluar(DIGITAL.join("\n"), { fechaReferencia: "2026-02-30" })).toStrictEqual({ ok: false, error: "fecha-referencia-invalida", lineas: null });
    expect(evaluar(DIGITAL.join("\n"))).toStrictEqual({ ok: false, error: "fecha-referencia-invalida", lineas: null });
  });

  it("NAT-06 Diferencial con el bucle web sobre fixtures MRZ válidos con ruido de OCR", () => {
    let utiles = 0;
    fc.assert(
      fc.property(arbFixtureMrz(), fc.array(fc.constantFrom("", " ", "\n", "x", "<"), { maxLength: 3 }), fc.boolean(), (fx, ruido, minusculas) => {
        const lineas = [...(fx as { lineas: readonly string[] }).lineas];
        const texto = [ruido.join(""), ...lineas.map((l) => (minusculas ? l.toLowerCase() : l)), ruido.join("")].join("\n");
        const r = evaluar(texto, { fechaReferencia: FECHA }) as { ok: boolean };
        if (r.ok) utiles++;
        expect(r).toStrictEqual(oraculoWeb(texto, "td1"));
      }),
      { numRuns: 1000 },
    );
    // Propiedad no vacía: la mayoría de los casos llegan a una lectura válida.
    expect(utiles).toBeGreaterThan(500);
  });

  it("NAT-06 Nunca lanza con entradas arbitrarias", () => {
    fc.assert(
      fc.property(fc.anything(), fc.anything(), (t, o) => {
        const r = evaluar(t, o) as { ok: boolean };
        expect(typeof r.ok).toBe("boolean");
      }),
      { numRuns: 1000 },
    );
  });
});
