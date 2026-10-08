// LMI-06 (spec lectura-mrz-imagen): pruebas del corredor evals/runners/mrz-imagen.mjs con lector y renderizador
// INYECTADOS (sin OCR ni navegador). La "imagen" es el JSON de las líneas sintéticas; nada se escribe al repositorio.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parsearMrzCedulaDigital } from "@lector-cedula/parsers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { DISTORSIONES, SALIDA, clasificar, conjuntoE, correr, cumple, ejecutarEval } from "../runners/mrz-imagen.mjs";

const REF = { fechaReferencia: "2026-10-06" };
let E;
let dir;

beforeAll(async () => {
  E = await conjuntoE();
  dir = mkdtempSync(join(tmpdir(), "eval-mrz-"));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const renderizar = async (lineas, opciones) => ({ bytes: new TextEncoder().encode(JSON.stringify({ lineas, d: opciones.distorsion ?? null })) });

/** Lector que "lee" las líneas del JSON; `alterar(i, lineas, d)` permite fallar o mentir en la llamada i. */
function lectorFalso(alterar = (_i, l) => l) {
  let i = 0;
  return {
    async leer(bytes, op) {
      const { lineas, d } = JSON.parse(new TextDecoder().decode(bytes));
      const l = alterar(i++, lineas, d);
      if (l === null) return { ok: false, error: "mrz-no-encontrada" };
      return { ok: true, intento: "proyeccion", digitosValidos: 4, resultado: parsearMrzCedulaDigital(l, op) };
    },
  };
}

describe("LMI-06 Corredor del eval", { timeout: 60_000 }, () => {
  it("Conjunto E: 200 fixtures válidos, deterministas y distintos", async () => {
    const propio = await conjuntoE();
    expect(propio.map((f) => f.lineas)).toStrictEqual(E.map((f) => f.lineas));
    expect(E).toHaveLength(200);
    expect(new Set(E.map((f) => f.lineas.join(""))).size).toBe(200);
    expect(E.every((f) => f.variante === "valida" && f.sintetico === true)).toBe(true);
    expect((await conjuntoE()).map((f) => f.lineas)).toStrictEqual(E.map((f) => f.lineas));
    expect(E.map((f) => f.semilla).slice(0, 3)).toStrictEqual([1, 2, 3]);
  });

  it("Un lector perfecto cumple: código 0 y contadores exactos", async () => {
    const salida = join(dir, "ok.json");
    expect(await correr({ lectores: [lectorFalso(), lectorFalso()], renderizar, conjunto: E, salida, log: () => undefined })).toBe(0);
    const r = JSON.parse(readFileSync(salida, "utf8"));
    expect(r.limpias).toStrictEqual({ n: 200, correctas: 200, falsas: 0 });
    expect(Object.keys(r.distorsiones)).toStrictEqual(DISTORSIONES);
    for (const g of Object.values(r.distorsiones)) expect(g).toStrictEqual({ n: 50, correctas: 50, falsas: 0 });
    expect(r.cumple).toBe(true);
  });

  it("LMI-06 El corredor detecta incumplimiento (195/200 limpias)", async () => {
    let limpias = 0;
    const lector = lectorFalso((_i, l, d) => (d === null && limpias++ < 5 ? null : l));
    const salida = join(dir, "195.json");
    expect(await correr({ lectores: [lector], renderizar, conjunto: E, salida, log: () => undefined })).toBe(1);
    expect(JSON.parse(readFileSync(salida, "utf8")).limpias).toStrictEqual({ n: 200, correctas: 195, falsas: 0 });
  });

  it("LMI-06 El corredor detecta una sola lectura falsa", async () => {
    const otra = E[199].lineas;
    const lector = lectorFalso((i, l) => (i === 0 ? otra : l));
    const salida = join(dir, "falsa.json");
    expect(await correr({ lectores: [lector], renderizar, conjunto: E, salida, log: () => undefined })).toBe(1);
    expect(JSON.parse(readFileSync(salida, "utf8")).limpias).toStrictEqual({ n: 200, correctas: 199, falsas: 1 });
  });

  it("LMI-06 196/200 limpias y 45/50 por distorsión cumplen; 44/50 no", async () => {
    const base = () => ({ limpias: { n: 200, correctas: 196, falsas: 0 }, distorsiones: Object.fromEntries(DISTORSIONES.map((d) => [d, { n: 50, correctas: 45, falsas: 0 }])) });
    expect(cumple(base())).toBe(true);
    const r = base();
    r.distorsiones.blur1.correctas = 44;
    expect(cumple(r)).toBe(false);
    const f = base();
    f.distorsiones.ruido8.falsas = 1;
    expect(cumple(f)).toBe(false);
    const l = base();
    l.limpias.correctas = 195;
    expect(cumple(l)).toBe(false);
  });

  it("LMI-06 Clasificación: correcta, falsa y fallo", () => {
    const v = E[0];
    const ok = { ok: true, resultado: parsearMrzCedulaDigital([...v.lineas], REF) };
    expect(clasificar(ok, v)).toBe("correcta");
    expect(clasificar({ ok: true, resultado: parsearMrzCedulaDigital([...E[1].lineas], REF) }, v)).toBe("falsa");
    expect(clasificar({ ok: false, error: "mrz-no-encontrada" }, v)).toBe("fallo");
    expect(clasificar(undefined, v)).toBe("fallo");
    const l2 = v.lineas[1];
    const malCompuesto = [v.lineas[0], l2.slice(0, 29) + String((Number(l2[29]) + 1) % 10), v.lineas[2]];
    expect(clasificar({ ok: true, resultado: parsearMrzCedulaDigital(malCompuesto, REF) }, v)).toBe("fallo");
  });

  it("LMI-06 Reporte sin datos", async () => {
    const salida = join(dir, "privado.json");
    await correr({ lectores: [lectorFalso()], renderizar, conjunto: E, salida, log: () => undefined });
    const texto = readFileSync(salida, "utf8");
    expect(texto).not.toContain("<<");
    for (const f of E) expect(texto).not.toContain(f.esperado.nuip);
  });

  it("Conjunto E con n pequeño: semillas 1..n y personas que caben en TD1", async () => {
    const c = await conjuntoE(5);
    expect(c.map((f) => f.semilla)).toStrictEqual([1, 2, 3, 4, 5]);
    expect(c.map((f) => f.lineas)).toStrictEqual(E.slice(0, 5).map((f) => f.lineas));
  });

  it("Constantes: distorsiones de la spec y ruta del reporte", () => {
    expect(DISTORSIONES).toStrictEqual(["rotacion+2", "rotacion-2", "blur1", "brillo+20", "brillo-20", "jpeg70", "escala0.8", "ruido8", "rotacion180"]);
    expect(SALIDA).toBe(fileURLToPath(new URL("../reports/mrz-imagen.json", import.meta.url)));
  });

  it("Distorsiones: solo las 50 primeras, con semilla de ruido i + 1", async () => {
    const llamadas = [];
    const r = await ejecutarEval({
      lectores: [lectorFalso()],
      renderizar: async (l, o) => {
        llamadas.push(o);
        return renderizar(l, o);
      },
      conjunto: E.slice(0, 3),
      nDistorsion: 2,
    });
    expect(llamadas).toHaveLength(3 + 2 * 9);
    expect(llamadas.filter((o) => o.distorsion === "ruido8").map((o) => o.semillaRuido)).toStrictEqual([1, 2]);
    expect(llamadas.filter((o) => o.distorsion === undefined)).toHaveLength(3);
    expect(r.limpias.n).toBe(3);
    expect(r.distorsiones.blur1.n).toBe(2);
  });

  it("Sin conjunto explícito usa el conjunto E y escribe un log por grupo", async () => {
    const lineas = [];
    const salida = join(dir, "log.json");
    expect(await correr({ lectores: [lectorFalso()], renderizar, salida, log: (m) => lineas.push(m) })).toBe(0);
    expect(JSON.parse(readFileSync(salida, "utf8")).limpias.n).toBe(200);
    expect(lineas[0]).toBe("limpias      200/200 correctas, 0 falsas");
    expect(lineas[1]).toBe("rotacion+2   50/50 correctas, 0 falsas");
    expect(lineas).toHaveLength(11);
    expect(lineas.at(-1)).toBe("eval:mrz-imagen: OK");
    const malo = [];
    await correr({ lectores: [lectorFalso(() => null)], renderizar, conjunto: E.slice(0, 2), salida, log: (m) => malo.push(m) });
    expect(malo.at(-1)).toBe("eval:mrz-imagen: NO CUMPLE LMI-06");
  });

  it("Clasificación: una línea de nombres distinta con los 4 dígitos válidos es falsa", () => {
    const v = E[0];
    const otra = [v.lineas[0], v.lineas[1], "OTRO<APELLIDO<<NOMBRE".padEnd(30, "<")];
    expect(clasificar({ ok: true, resultado: parsearMrzCedulaDigital(otra, REF) }, v)).toBe("falsa");
  });
});
