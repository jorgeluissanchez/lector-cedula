// Cambio otros-documentos, OD-21 (tarea 3.1): conjuntos sintéticos de pasaporte (TD3) y CE (TD1) del eval
// eval:mrz-imagen, y su corredor con lector y renderizador INYECTADOS (sin OCR ni navegador). Nada se escribe al repo.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clasificarDocumento, parsearMrzCedulaDigital } from "@lector-cedula/parsers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DISTORSIONES, N_OTROS, N_OTROS_DISTORSION, UMBRAL_OTROS, clasificar, conjuntoE, conjuntosOtros, correr, cumple, ejecutarEval } from "../runners/mrz-imagen.mjs";
import { digitoIcao, generarTd1, generarTd3 } from "../sinteticos/generador-icao.mjs";

const REF = { fechaReferencia: "2026-10-06" };
let otros;
let E;
let dir;

beforeAll(async () => {
  otros = await conjuntosOtros();
  E = await conjuntoE(5);
  dir = mkdtempSync(join(tmpdir(), "eval-mrz-otros-"));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const renderizar = async (lineas, opciones) => ({ bytes: new TextEncoder().encode(JSON.stringify({ lineas, d: opciones.distorsion ?? null })) });

/** Lector que interpreta las líneas del JSON como lo haría el lector real (pasaporte con td3; CC o CE con td1). */
function lectorFalso(alterar = (_i, l) => l) {
  let i = 0;
  const formatos = [];
  return {
    formatos,
    async leer(bytes, op) {
      formatos.push(op.formato ?? "td1");
      const { lineas, d } = JSON.parse(new TextDecoder().decode(bytes));
      const l = alterar(i++, lineas, d);
      if (l === null) return { ok: false, error: "mrz-no-encontrada" };
      if (op.formato === "td3") {
        const doc = clasificarDocumento(l, op);
        return doc.ok ? { ok: true, intento: "proyeccion", digitosValidos: 5, documento: doc } : { ok: false, error: "mrz-no-encontrada" };
      }
      const cc = parsearMrzCedulaDigital(l, op);
      if (cc.ok) return { ok: true, intento: "proyeccion", digitosValidos: 4, resultado: cc };
      const doc = clasificarDocumento(l, op);
      return doc.ok ? { ok: true, intento: "proyeccion", digitosValidos: 4, documento: doc } : { ok: false, error: "mrz-no-encontrada" };
    },
  };
}

describe("OD-21 Generador ICAO del eval", () => {
  it("Dígito ICAO 9303 con el espécimen de Utopía", () => {
    expect(digitoIcao("L898902C3")).toBe("6");
    expect(digitoIcao("740812")).toBe("2");
    expect(digitoIcao("120415")).toBe("9");
  });

  it("Reproduce el pasaporte colombiano y la CE sintéticos de las specs", () => {
    expect(
      generarTd3({ emisor: "COL", apellidos: "PEREZ NUNEZ", nombres: "ANA MARIA", numero: "AZ1234567", nacionalidad: "COL", nacimiento: "900215", sexo: "F", vencimiento: "310214", opcional: "1234567890" }),
    ).toStrictEqual(["P<COLPEREZ<NUNEZ<<ANA<MARIA<<<<<<<<<<<<<<<<<", "AZ12345673COL9002155F31021451234567890<<<<78"]);
    expect(
      generarTd1({ codigo: "I", emisor: "COL", numero: "1234567", opcional1: "", nacimiento: "800101", sexo: "F", vencimiento: "300101", nacionalidad: "VEN", opcional2: "", apellidos: "GARCIA", nombres: "MARIA JOSE" }),
    ).toStrictEqual(["I<COL1234567<<4<<<<<<<<<<<<<<<", "8001014F3001019VEN<<<<<<<<<<<4", "GARCIA<<MARIA<JOSE<<<<<<<<<<<<"]);
  });

  it("Conjuntos TD3 y CE: tamaño, deterministas, distintos, sintéticos y clasificados", async () => {
    expect(otros.td3).toHaveLength(N_OTROS);
    expect(otros.ce).toHaveLength(N_OTROS);
    expect((await conjuntosOtros()).td3.map((f) => f.lineas)).toStrictEqual(otros.td3.map((f) => f.lineas));
    expect(new Set(otros.td3.map((f) => f.lineas.join(""))).size).toBe(N_OTROS);
    expect(new Set(otros.ce.map((f) => f.lineas.join(""))).size).toBe(N_OTROS);
    for (const f of otros.td3) {
      expect(f.sintetico).toBe(true);
      expect(f.formato).toBe("td3");
      expect(f.lineas.map((l) => l.length)).toStrictEqual([44, 44]);
      const r = clasificarDocumento(f.lineas, REF);
      expect(r).toMatchObject({ ok: true, tipoDocumento: "pasaporte" });
      expect(f.camposEsperados).toStrictEqual(r.campos);
    }
    for (const f of otros.ce) {
      expect(f.formato).toBe("td1");
      expect(parsearMrzCedulaDigital(f.lineas, REF).ok).toBe(false);
      expect(clasificarDocumento(f.lineas, REF)).toMatchObject({ ok: true, tipoDocumento: "cedula-extranjeria", campos: f.camposEsperados });
    }
    // Pasaportes colombianos y extranjeros en el mismo conjunto.
    const emisores = new Set(otros.td3.map((f) => f.camposEsperados.estadoEmisor));
    expect(emisores.has("COL")).toBe(true);
    expect(emisores.size).toBeGreaterThan(3);
  });
});

describe("OD-21 Corredor del eval con TD3 y CE", { timeout: 60_000 }, () => {
  it("Un lector perfecto cumple; TD3 se lee con formato td3 y la CE con td1", async () => {
    const lector = lectorFalso();
    const salida = join(dir, "ok.json");
    expect(await correr({ lectores: [lector], renderizar, conjunto: E, otros, salida, log: () => undefined })).toBe(0);
    const r = JSON.parse(readFileSync(salida, "utf8"));
    for (const tipo of ["td3", "ce"]) {
      expect(r[tipo].limpias).toStrictEqual({ n: N_OTROS, correctas: N_OTROS, falsas: 0 });
      expect(Object.keys(r[tipo].distorsiones)).toStrictEqual(DISTORSIONES);
      for (const g of Object.values(r[tipo].distorsiones)) expect(g).toStrictEqual({ n: N_OTROS_DISTORSION, correctas: N_OTROS_DISTORSION, falsas: 0 });
    }
    expect(lector.formatos.filter((f) => f === "td3")).toHaveLength(N_OTROS + N_OTROS_DISTORSION * DISTORSIONES.length);
    expect(r.cumple).toBe(true);
  });

  it("Sin otros conjuntos el reporte no lleva td3 ni ce (compatibilidad LMI-06)", async () => {
    const r = await ejecutarEval({ lectores: [lectorFalso()], renderizar, conjunto: E });
    expect(r).not.toHaveProperty("td3");
    expect(r).not.toHaveProperty("ce");
  });

  it("Una sola lectura falsa de pasaporte o de CE incumple", async () => {
    for (const tipo of ["td3", "ce"]) {
      const otro = otros[tipo][1].lineas;
      const primero = otros[tipo][0].lineas.join("");
      const lector = lectorFalso((_i, l) => (l.join("") === primero ? otro : l));
      const r = await ejecutarEval({ lectores: [lector], renderizar, conjunto: E, otros });
      expect(r[tipo].limpias.falsas + Object.values(r[tipo].distorsiones).reduce((s, g) => s + g.falsas, 0)).toBeGreaterThan(0);
      expect(r.cumple).toBe(false);
    }
  });

  it("Umbral por grupo de TD3 y CE: 90 %", () => {
    expect(UMBRAL_OTROS).toBe(0.9);
    const grupo = (n, c) => ({ n, correctas: c, falsas: 0 });
    const base = (c) => ({
      limpias: grupo(5, 5),
      distorsiones: Object.fromEntries(DISTORSIONES.map((d) => [d, grupo(50, 50)])),
      td3: { limpias: grupo(40, 36), distorsiones: Object.fromEntries(DISTORSIONES.map((d) => [d, grupo(20, c)])) },
    });
    expect(cumple(base(18))).toBe(true);
    expect(cumple(base(17))).toBe(false);
    const l = base(20);
    l.td3.limpias.correctas = 35;
    expect(cumple(l)).toBe(false);
  });

  it("Clasificación de documentos: correcta, falsa (otro documento con dígitos válidos) y fallo", () => {
    const v = otros.td3[0];
    const leer = (lineas) => ({ ok: true, documento: clasificarDocumento(lineas, REF) });
    expect(clasificar(leer(v.lineas), v)).toBe("correcta");
    expect(clasificar(leer(otros.td3[1].lineas), v)).toBe("falsa");
    expect(clasificar({ ok: false, error: "mrz-no-encontrada" }, v)).toBe("fallo");
    // Una cédula digital válida leída sobre una CE es falsa.
    expect(clasificar({ ok: true, resultado: parsearMrzCedulaDigital([...E[0].lineas], REF) }, otros.ce[0])).toBe("falsa");
    // Un documento leído sobre una cédula digital también es falso.
    expect(clasificar(leer(otros.ce[0].lineas), E[0])).toBe("falsa");
  });

  it("Reporte sin datos de TD3 ni CE", async () => {
    const salida = join(dir, "privado.json");
    await correr({ lectores: [lectorFalso()], renderizar, conjunto: E, otros, salida, log: () => undefined });
    const texto = readFileSync(salida, "utf8");
    expect(texto).not.toContain("<<");
    for (const f of [...otros.td3, ...otros.ce]) expect(texto).not.toContain(f.camposEsperados.numeroDocumento);
  });
});
