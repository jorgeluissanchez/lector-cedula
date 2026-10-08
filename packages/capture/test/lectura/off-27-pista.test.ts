// OFF-27 Pista de tipo desde la presencia (pwa-lectura-offline): orden y número de llamadas con dependencias
// inyectadas, el mensaje del Worker lector y el `contenido` en la respuesta del Worker de calidad.
// Datos SINTÉTICOS de @lector-cedula/fixtures (PERSONA_BASE, semilla 1).
import { PERSONA_BASE, generarMrzTd1, generarPdf417 } from "@lector-cedula/fixtures";
import { buscarDivipol, parsearMrzCedulaDigital, parsearPdf417Amarilla } from "@lector-cedula/parsers";
import { PNG } from "pngjs";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { crearRenderizador } from "../../../../evals/sinteticos/render-mrz.mjs";
import type { FrameAnalisis } from "../../src/calidad/tipos.js";
import { crearDetectorGuia } from "../../src/flujo/guia.js";
import { clasificarErrorLectura } from "../../src/lectura/errores.js";
import { leerDocumento } from "../../src/lectura/leer.js";
import { crearManejadorLector } from "../../src/lectura/manejador.js";
import type { DependenciasLectura } from "../../src/lectura/tipos.js";
import type { ResultadoLectorMrz } from "../../src/mrz/lector.js";
import type { MensajeDelWorker } from "../../src/navegador/protocolo.js";
import { iniciarWorkerCalidad, type AlcanceWorker } from "../../src/navegador/worker-calidad.js";
import type { ResultadoPdf417Imagen } from "../../src/pdf417/decodificar.js";
import { pixelesSinteticos } from "../pdf417/sintetica.js";
import { type Imagen, tarjetaEnGuia } from "./escenas-presencia.js";

const FECHA = "2026-10-06";
const F = generarPdf417(PERSONA_BASE, { semilla: 1 });
const M = generarMrzTd1(PERSONA_BASE, { semilla: 1 });
const PIXELES = { data: new Uint8ClampedArray(4 * 4 * 4).fill(255), width: 4, height: 4 };

function mrzOk(): ResultadoLectorMrz {
  const r = parsearMrzCedulaDigital(M.lineas, { fechaReferencia: FECHA });
  if (!r.ok) throw new Error("fixture MRZ inválido");
  return { ok: true, intento: "proyeccion", digitosValidos: 4, resultado: r } as ResultadoLectorMrz;
}

const PDF_OK = (): ResultadoPdf417Imagen => ({ ok: true, bytes: new Uint8Array(F.bytes), intento: "original" });
const PDF_NO: ResultadoPdf417Imagen = { ok: false, error: "pdf417-no-encontrado" };

function deps(pdf417: () => ResultadoPdf417Imagen, mrz: ResultadoLectorMrz) {
  const orden: string[] = [];
  const decodificar = vi.fn(async () => (orden.push("pdf417"), pdf417()));
  const leerMrz = vi.fn(async () => (orden.push("mrz"), mrz));
  const d: DependenciasLectura = { decodificar, lectorMrz: { leer: leerMrz }, parsearPdf417: parsearPdf417Amarilla, buscarDivipol };
  return { d, decodificar, leerMrz, orden };
}

describe("OFF-27 Pista de tipo en leerDocumento", () => {
  it("OFF-27 Pista MRZ", async () => {
    const { d, decodificar, leerMrz } = deps(PDF_OK, mrzOk());
    const r = await leerDocumento(PIXELES, d, { fechaReferencia: FECHA, pista: "mrz" });
    expect(r).toMatchObject({ ok: true, tipo: "mrz" });
    expect(leerMrz).toHaveBeenCalledTimes(1);
    expect(decodificar).toHaveBeenCalledTimes(0);
  });

  it("OFF-27 Pista MRZ con respaldo", async () => {
    const a = deps(PDF_OK, { ok: false, error: "mrz-no-encontrada" });
    expect(await leerDocumento(PIXELES, a.d, { fechaReferencia: FECHA, pista: "mrz" })).toMatchObject({ ok: true, tipo: "pdf417" });
    expect(a.orden).toStrictEqual(["mrz", "pdf417"]);
    const b = deps(() => PDF_NO, { ok: false, error: "mrz-no-encontrada" });
    expect(await leerDocumento(PIXELES, b.d, { fechaReferencia: FECHA, pista: "mrz" })).toStrictEqual({ ok: false, tipo: "pdf417", error: "pdf417-no-encontrado" });
    expect(b.orden).toStrictEqual(["mrz", "pdf417"]);
  });

  it("OFF-27 Pista MRZ sin respaldo para otros errores", async () => {
    for (const error of ["tiempo-agotado", "modelo-no-disponible"] as const) {
      const { d, decodificar } = deps(PDF_OK, { ok: false, error });
      expect(await leerDocumento(PIXELES, d, { fechaReferencia: FECHA, pista: "mrz" })).toStrictEqual({ ok: false, tipo: "mrz", error });
      expect(decodificar).toHaveBeenCalledTimes(0);
    }
  });

  it("OFF-27 Pista MRZ sin respaldo con respaldo: false", async () => {
    const { d, decodificar } = deps(PDF_OK, { ok: false, error: "mrz-no-encontrada" });
    expect(await leerDocumento(PIXELES, d, { fechaReferencia: FECHA, pista: "mrz", respaldo: false })).toStrictEqual({ ok: false, tipo: "mrz", error: "mrz-no-encontrada" });
    expect(decodificar).toHaveBeenCalledTimes(0);
  });

  it("OFF-27 Pista PDF417 y respaldo desactivado", async () => {
    const a = deps(PDF_OK, mrzOk());
    expect(await leerDocumento(PIXELES, a.d, { fechaReferencia: FECHA, pista: "pdf417" })).toMatchObject({ ok: true, tipo: "pdf417" });
    expect(a.leerMrz).toHaveBeenCalledTimes(0);
    const b = deps(() => PDF_NO, mrzOk());
    const r = await leerDocumento(PIXELES, b.d, { fechaReferencia: FECHA, pista: "pdf417", respaldo: false });
    expect(r).toStrictEqual({ ok: false, tipo: "pdf417", error: "pdf417-no-encontrado" });
    expect(b.leerMrz).toHaveBeenCalledTimes(0);
    expect(clasificarErrorLectura(r).codigo).toBe("no-encontrado");
    // Con respaldo (por defecto) la pista PDF417 cae a la MRZ como OFF-06.
    const c = deps(() => PDF_NO, mrzOk());
    expect(await leerDocumento(PIXELES, c.d, { fechaReferencia: FECHA, pista: "pdf417" })).toMatchObject({ ok: true, tipo: "mrz" });
    expect(c.orden).toStrictEqual(["pdf417", "mrz"]);
  });

  it("OFF-27 cancelación entre el lector de la pista y el respaldo", async () => {
    const control = new AbortController();
    const { d, decodificar } = deps(PDF_OK, { ok: false, error: "mrz-no-encontrada" });
    d.lectorMrz.leer = vi.fn(async () => (control.abort(), { ok: false as const, error: "mrz-no-encontrada" as const }));
    expect(await leerDocumento(PIXELES, d, { fechaReferencia: FECHA, pista: "mrz", senal: control.signal })).toStrictEqual({ ok: false, error: "cancelada" });
    expect(decodificar).toHaveBeenCalledTimes(0);
  });
});

describe("OFF-27 Pista en el Worker lector", () => {
  const mensaje = (pista: unknown) => ({ tipo: "leer", id: 1, ancho: 4, alto: 4, pixeles: new Uint8ClampedArray(64).fill(9).buffer, fechaReferencia: FECHA, pista });

  it("OFF-27 pista mrz: solo el lector MRZ", async () => {
    const { d, orden } = deps(PDF_OK, mrzOk());
    expect(await crearManejadorLector(d)(mensaje("mrz"))).toMatchObject({ resultado: { ok: true, tipo: "mrz" } });
    expect(orden).toStrictEqual(["mrz"]);
  });

  it("OFF-27 pista inválida: orden de OFF-06", async () => {
    const { d, orden } = deps(() => PDF_NO, mrzOk());
    expect(await crearManejadorLector(d)(mensaje("qr"))).toMatchObject({ resultado: { ok: true, tipo: "mrz" } });
    expect(orden).toStrictEqual(["pdf417", "mrz"]);
  });

  it("OFF-28 respaldo: false en el mensaje", async () => {
    const { d, orden } = deps(() => PDF_NO, mrzOk());
    const r = await crearManejadorLector(d)({ ...mensaje("pdf417"), respaldo: false });
    expect(r).toMatchObject({ resultado: { ok: false, tipo: "pdf417", error: "pdf417-no-encontrado" } });
    expect(orden).toStrictEqual(["pdf417"]);
  });
});

describe("OFF-27 Contenido en la respuesta del Worker de calidad", { timeout: 60_000 }, () => {
  let amarilla: Imagen;
  let digital: Imagen;
  beforeAll(async () => {
    amarilla = await pixelesSinteticos(F.bytes);
    const render = await crearRenderizador();
    try {
      const png = PNG.sync.read(Buffer.from((await render.render(M.lineas)).bytes));
      digital = { data: new Uint8ClampedArray(png.data), width: png.width, height: png.height };
    } finally {
      await render.cerrar();
    }
  }, 60_000);

  async function analizar(f: FrameAnalisis, presencia: boolean) {
    const recibidos: MensajeDelWorker[] = [];
    const alcance: AlcanceWorker = { onmessage: null, postMessage: (m) => void recibidos.push(m) };
    iniciarWorkerCalidad(alcance, crearDetectorGuia(), presencia ? { presencia: true } : undefined);
    const pixeles = new Uint8ClampedArray(f.pixeles).buffer;
    alcance.onmessage?.({ data: { tipo: "analizar", id: 1, ancho: f.ancho, alto: f.alto, anchoOriginal: f.anchoOriginal, altoOriginal: f.altoOriginal, pixeles } } as MessageEvent);
    await expect.poll(() => recibidos.length).toBe(1);
    return recibidos[0] as Extract<MensajeDelWorker, { tipo: "resultado" }>;
  }

  it("OFF-27 amarilla pdf417, digital mrz y sin presencia null", async () => {
    expect((await analizar(tarjetaEnGuia(amarilla), true)).contenido).toBe("pdf417");
    expect((await analizar(tarjetaEnGuia(digital), true)).contenido).toBe("mrz");
    expect((await analizar(tarjetaEnGuia(amarilla), false)).contenido).toBeNull();
  });
});
