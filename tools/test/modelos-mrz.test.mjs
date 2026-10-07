// LMI-08 (spec lectura-mrz-imagen): descarga reproducible de mrz.traineddata con fetch INYECTADO (sin red).
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fileURLToPath } from "node:url";
import { BYTES_MRZ, DESTINO_MRZ, SHA_MRZ, URL_MRZ, descargarMrz } from "../modelos/descargar-mrz.mjs";

const MODELO_REAL = fileURLToPath(new URL("../../models/tesseract/mrz.traineddata", import.meta.url));

let dir;
let temporal;
const silencio = () => undefined;
const respuesta = (bytes, ok = true) => async () => ({ ok, status: ok ? 200 : 404, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "modelos-mrz-"));
  temporal = mkdtempSync(join(tmpdir(), "modelos-mrz-tmp-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  rmSync(temporal, { recursive: true, force: true });
});

describe("LMI-08 Modelo reproducible", () => {
  it("LMI-08 Hash correcto", async () => {
    const cuerpo = new Uint8Array([7, 8, 9, 10]);
    const esperado = { sha256: createHash("sha256").update(cuerpo).digest("hex"), bytes: 4 };
    const destino = join(dir, "sub", "mrz.traineddata");
    const fetch = vi.fn(respuesta(cuerpo));
    expect(await descargarMrz({ fetch, destino, dirTemporal: temporal, esperado, log: silencio })).toBe(0);
    expect(new Uint8Array(readFileSync(destino))).toStrictEqual(cuerpo);
    expect(fetch).toHaveBeenCalledWith(URL_MRZ);
    expect(readdirSync(temporal)).toStrictEqual([]);
  });

  it("LMI-08 Hash incorrecto", async () => {
    const destino = join(dir, "mrz.traineddata");
    const r = await descargarMrz({ fetch: respuesta(new Uint8Array([1, 2, 3])), destino, dirTemporal: temporal, log: silencio });
    expect(r).toBe(1);
    expect(existsSync(destino)).toBe(false);
    expect(readdirSync(temporal)).toStrictEqual([]);
  });

  it("LMI-08 Tamaño distinto con hash correcto también falla", async () => {
    const cuerpo = new Uint8Array([1, 2, 3]);
    const esperado = { sha256: createHash("sha256").update(cuerpo).digest("hex"), bytes: 4 };
    const destino = join(dir, "mrz.traineddata");
    expect(await descargarMrz({ fetch: respuesta(cuerpo), destino, dirTemporal: temporal, esperado, log: silencio })).toBe(1);
    expect(existsSync(destino)).toBe(false);
  });

  it("LMI-08 HTTP no OK o fetch que lanza: 1 sin tocar el destino", async () => {
    const destino = join(dir, "mrz.traineddata");
    expect(await descargarMrz({ fetch: respuesta(new Uint8Array(), false), destino, dirTemporal: temporal, log: silencio })).toBe(1);
    expect(await descargarMrz({ fetch: async () => Promise.reject(new Error("red")), destino, dirTemporal: temporal, log: silencio })).toBe(1);
    expect(existsSync(destino)).toBe(false);
    expect(readdirSync(temporal)).toStrictEqual([]);
  });

  it("LMI-08 Verificar sin red", async () => {
    const fetch = vi.fn();
    const log = vi.fn();
    expect(await descargarMrz({ verificar: true, fetch, destino: join(dir, "no-existe"), log })).toBe(1);
    expect(fetch).not.toHaveBeenCalled();
    expect(log.mock.calls[0][0]).toContain("npm run modelos:mrz");
  });

  it("LMI-08 Verificar: 0 si coincide, 1 si el contenido difiere", async () => {
    const cuerpo = new Uint8Array([5, 5]);
    const esperado = { sha256: createHash("sha256").update(cuerpo).digest("hex"), bytes: 2 };
    const destino = join(dir, "mrz.traineddata");
    await descargarMrz({ fetch: respuesta(cuerpo), destino, dirTemporal: temporal, esperado, log: silencio });
    const fetch = vi.fn();
    expect(await descargarMrz({ verificar: true, fetch, destino, esperado, log: silencio })).toBe(0);
    expect(await descargarMrz({ verificar: true, fetch, destino, log: silencio })).toBe(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("LMI-08 Manifiesto", () => {
    const m = JSON.parse(readFileSync(new URL("../../models/manifest.json", import.meta.url), "utf8"));
    const e = m.filter((x) => x.nombre === "tesseract-mrz");
    expect(e).toStrictEqual([{ nombre: "tesseract-mrz", licencia: "BSD-3-Clause", fuente: URL_MRZ, sha256: SHA_MRZ, uso: "produccion" }]);
    expect([SHA_MRZ, BYTES_MRZ]).toStrictEqual(["e44f5b7a6bdd3f382ef3bfa84ee0057f5897946a84a094c26910e0a124f3a9bd", 11396382]);
    expect(URL_MRZ).toBe("https://raw.githubusercontent.com/DoubangoTelecom/tesseractMRZ/1e7adfecda5f3c9ae1fb12cf6b4b8c3958c63e46/tessdata_best/mrz.traineddata");
  });

  it("LMI-08 Destino por omisión y mensajes", async () => {
    expect(DESTINO_MRZ).toBe(MODELO_REAL);
    const cuerpo = new Uint8Array([4]);
    const esperado = { sha256: createHash("sha256").update(cuerpo).digest("hex"), bytes: 1 };
    const log = vi.fn();
    await descargarMrz({ fetch: respuesta(cuerpo), destino: join(dir, "a"), dirTemporal: temporal, esperado, log });
    await descargarMrz({ fetch: respuesta(new Uint8Array(), false), destino: join(dir, "b"), dirTemporal: temporal, log });
    await descargarMrz({ fetch: respuesta(cuerpo), destino: join(dir, "c"), dirTemporal: temporal, log });
    await descargarMrz({ fetch: async () => Promise.reject("texto"), destino: join(dir, "d"), dirTemporal: temporal, log });
    await descargarMrz({ verificar: true, destino: join(dir, "a"), esperado, log });
    writeFileSync(join(dir, "e"), new Uint8Array([9]));
    await descargarMrz({ verificar: true, destino: join(dir, "e"), esperado, log });
    expect(log.mock.calls.map((c) => c[0])).toStrictEqual([
      "modelos:mrz: OK",
      "modelos:mrz: fallo (HTTP 404); destino sin tocar",
      "modelos:mrz: fallo (hash o tamaño distintos); destino sin tocar",
      "modelos:mrz: fallo (desconocido); destino sin tocar",
      "modelos:mrz: OK",
      "modelos:mrz: el modelo no coincide con el hash esperado; ejecuta npm run modelos:mrz",
    ]);
  });

  it("LMI-08 Mismo tamaño y otro contenido no verifica", async () => {
    const cuerpo = new Uint8Array([1, 2]);
    const esperado = { sha256: createHash("sha256").update(cuerpo).digest("hex"), bytes: 2 };
    writeFileSync(join(dir, "f"), new Uint8Array([2, 1]));
    expect(await descargarMrz({ verificar: true, destino: join(dir, "f"), esperado, log: silencio })).toBe(1);
  });

  it.skipIf(!existsSync(MODELO_REAL))("LMI-08 El modelo descargado verifica con el hash y tamaño por omisión", async () => {
    expect(await descargarMrz({ verificar: true, destino: MODELO_REAL, log: silencio })).toBe(0);
    const falso = join(dir, "mismo-tamano");
    writeFileSync(falso, new Uint8Array(BYTES_MRZ));
    expect(await descargarMrz({ verificar: true, destino: falso, log: silencio })).toBe(1);
  });
});
