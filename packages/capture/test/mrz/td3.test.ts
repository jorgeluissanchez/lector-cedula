// Cambio otros-documentos, OD-21 (tarea 2.2): extracción de 2 líneas de 44 y lector MRZ con `formato: "td3"`, CE por
// TD1 genérico (OD-11) y TD1 `IT` (OD-11b, T01), con el worker de OCR INYECTADO. Imagen: lienzo sintético en memoria;
// MRZ del generador sintético de parsers (pasaporte COL de OD-01, CE de OD-10a).
import { clasificarDocumento, parsearMrzCedulaDigital } from "@lector-cedula/parsers";
import { PERSONA_BASE, generarMrzTd1 } from "@lector-cedula/fixtures";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { extraerLineasMrz, extraerLineasTd3 } from "../../src/mrz/extraer.js";
import { crearLectorMrz, formatoMrz, type WorkerOcr } from "../../src/mrz/lector.js";
import { CE_SINTETICA, DATOS_CE, ESPECIMEN_ICAO, generarTd1, PASAPORTE_COL } from "../../../parsers/test/ayudas/generador-mrz-icao.js";

const REF = { fechaReferencia: "2026-10-08" };
/** Lienzo gris liso de 400x300: el plan de intentos siempre tiene candidatos (recorte inferior, imagen completa, franjas). */
const LIENZO = { width: 400, height: 300, data: new Uint8ClampedArray(400 * 300 * 4).fill(200) };

function falso(textos: readonly string[]) {
  const llamadas = { n: 0 };
  const crearWorker = async (): Promise<WorkerOcr> => ({
    setParameters: async () => undefined,
    recognize: async () => ({ data: { text: textos[Math.min(llamadas.n++, textos.length - 1)] ?? "" } }),
    terminate: async () => undefined,
  });
  return { llamadas, crearWorker };
}

describe("OD-21 Extracción de 2 líneas de 44", { timeout: 60_000 }, () => {
  it("OD-21 Pasaporte con ruido, espacios y minúsculas", () => {
    const texto = "PASAPORTE\n" + PASAPORTE_COL[0].toLowerCase().split("").join(" ") + "\n\n" + PASAPORTE_COL[1] + "\nX";
    expect(extraerLineasTd3(texto)).toStrictEqual([...PASAPORTE_COL]);
  });

  it("OD-21 Límites: 42 y 46 (relleno) se aceptan, 41 y 47 no; el exceso que no es relleno se descarta", () => {
    const l = (n: number, c = "A") => c.repeat(n);
    expect(extraerLineasTd3([l(42), l(46, "<")].join("\n"))).toStrictEqual([l(42) + "<<", l(44, "<")]);
    expect(extraerLineasTd3([l(41), l(44)].join("\n"))).toBeNull();
    expect(extraerLineasTd3([l(47, "<"), l(44)].join("\n"))).toBeNull();
    expect(extraerLineasTd3([l(44) + "B", l(44)].join("\n"))).toBeNull();
    expect(extraerLineasTd3(l(44))).toBeNull();
    expect(extraerLineasTd3(null)).toBeNull();
  });

  it("OD-21 Las líneas TD1 no son TD3 ni al revés", () => {
    const td1 = generarMrzTd1(PERSONA_BASE, { semilla: 1 });
    expect(extraerLineasTd3(td1.texto)).toBeNull();
    expect(extraerLineasMrz(PASAPORTE_COL.join("\n"))).toBeNull();
  });

  it("OD-21 Nunca lanza", () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.string({ unit: "binary" }), fc.anything()), (x) => {
        const r = extraerLineasTd3(x);
        expect(r === null || (r.length === 2 && r.every((l) => l.length === 44))).toBe(true);
      }),
      { numRuns: 1000 },
    );
  });
});

describe("OD-21 Lector MRZ con formato td3", { timeout: 60_000 }, () => {
  it("OD-21 formatoMrz: solo td3 explícito es td3", () => {
    expect(formatoMrz({ formato: "td3" })).toBe("td3");
    for (const o of [undefined, null, {}, { formato: "td1" }, { formato: "TD3" }, "td3"]) expect(formatoMrz(o)).toBe("td1");
  });

  it("OD-21 Pasaporte: tras un texto ilegible, el segundo intento da el pasaporte con sus 5 dígitos", async () => {
    const { llamadas, crearWorker } = falso(["ILEGIBLE", PASAPORTE_COL.join("\n")]);
    const r = await crearLectorMrz({ rutaModelo: "/m", crearWorker }).leer(LIENZO, { ...REF, formato: "td3" });
    expect(llamadas.n).toBe(2);
    expect(r).toMatchObject({ ok: true, digitosValidos: 5, documento: clasificarDocumento([...PASAPORTE_COL], REF) });
    if (r.ok && "documento" in r) expect(r.documento.campos.numeroDocumento).toBe("AZ1234567");
  });

  it("OD-21 Con td3 una MRZ TD1 no se acepta, y sin formato un pasaporte tampoco", async () => {
    const td1 = generarMrzTd1(PERSONA_BASE, { semilla: 1 }).texto;
    expect(await crearLectorMrz({ rutaModelo: "/m", crearWorker: falso([td1]).crearWorker, maxLlamadasOcr: 3 }).leer(LIENZO, { ...REF, formato: "td3" })).toStrictEqual({
      ok: false,
      error: "mrz-no-encontrada",
    });
    expect(await crearLectorMrz({ rutaModelo: "/m", crearWorker: falso([PASAPORTE_COL.join("\n")]).crearWorker, maxLlamadasOcr: 3 }).leer(LIENZO, REF)).toStrictEqual({
      ok: false,
      error: "mrz-no-encontrada",
    });
  });

  it("OD-21 Pasaporte con un dígito de control alterado: no se acepta (nunca un número distinto)", async () => {
    const alterado = [PASAPORTE_COL[0], PASAPORTE_COL[1].slice(0, 9) + "4" + PASAPORTE_COL[1].slice(10)].join("\n");
    const r = await crearLectorMrz({ rutaModelo: "/m", crearWorker: falso([alterado]).crearWorker, maxLlamadasOcr: 5 }).leer(LIENZO, { ...REF, formato: "td3" });
    expect(r).toStrictEqual({ ok: false, error: "mrz-no-encontrada" });
  });

  it("OD-21 El espécimen ICAO (UTO) también es pasaporte", async () => {
    const r = await crearLectorMrz({ rutaModelo: "/m", crearWorker: falso([ESPECIMEN_ICAO.join("\n")]).crearWorker }).leer(LIENZO, { ...REF, formato: "td3" });
    expect(r).toMatchObject({ ok: true, documento: { tipoDocumento: "pasaporte", fuente: "mrz-td3" } });
  });
});

describe("OD-11 y OD-11b TD1 genérico en el lector", { timeout: 60_000 }, () => {
  it("OD-11 CE: el lector TD1 la devuelve como documento", async () => {
    const r = await crearLectorMrz({ rutaModelo: "/m", crearWorker: falso([CE_SINTETICA.join("\n")]).crearWorker }).leer(LIENZO, REF);
    expect(r).toMatchObject({ ok: true, digitosValidos: 4, documento: { tipoDocumento: "cedula-extranjeria", fuente: "mrz-td1", campos: { numeroDocumento: "1234567" } } });
  });

  it("OD-11 La cédula digital sigue saliendo como `resultado` (LMI sin cambios)", async () => {
    const P = generarMrzTd1(PERSONA_BASE, { semilla: 1 });
    const r = await crearLectorMrz({ rutaModelo: "/m", crearWorker: falso([P.texto]).crearWorker }).leer(LIENZO, REF);
    expect(r).toMatchObject({ ok: true, digitosValidos: 4, resultado: parsearMrzCedulaDigital([...P.lineas], REF) });
  });

  it("OD-11b TD1 IT de Colombia: documento-no-admitido con T01 cuando no aparece nada mejor", async () => {
    const it_ = generarTd1({ ...DATOS_CE, codigo: "IT", nacionalidad: "COL", nacimiento: "110101" }).join("\n");
    const r = await crearLectorMrz({ rutaModelo: "/m", crearWorker: falso([it_]).crearWorker, maxLlamadasOcr: 3 }).leer(LIENZO, REF);
    expect(r).toStrictEqual({ ok: false, error: "documento-no-admitido", warnings: ["T01"] });
  });

  it("OD-11b Un TD1 IT seguido de una CE válida: gana la CE", async () => {
    const it_ = generarTd1({ ...DATOS_CE, codigo: "IT", nacionalidad: "COL" }).join("\n");
    const r = await crearLectorMrz({ rutaModelo: "/m", crearWorker: falso([it_, CE_SINTETICA.join("\n")]).crearWorker }).leer(LIENZO, REF);
    expect(r).toMatchObject({ ok: true, documento: { tipoDocumento: "cedula-extranjeria" } });
  });

  it("OD-11 Un TD1 de otro país no admitido (sin hipótesis) se ignora: mrz-no-encontrada", async () => {
    const esp = generarTd1({ ...DATOS_CE, emisor: "ESP" }).join("\n");
    const r = await crearLectorMrz({ rutaModelo: "/m", crearWorker: falso([esp]).crearWorker, maxLlamadasOcr: 3 }).leer(LIENZO, REF);
    expect(r).toStrictEqual({ ok: false, error: "mrz-no-encontrada" });
  });
});
