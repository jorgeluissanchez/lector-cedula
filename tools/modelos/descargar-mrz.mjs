#!/usr/bin/env node
// Descarga reproducible de mrz.traineddata (cambio leer-mrz-desde-imagen, LMI-08; design.md, decisión 5).
// Uso: npm run modelos:mrz [-- --verificar]
// Descarga a un temporal, verifica SHA-256 y tamaño y solo entonces lo mueve a models/tesseract/mrz.traineddata.
// --verificar comprueba el destino sin red.
import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const URL_MRZ =
  "https://raw.githubusercontent.com/DoubangoTelecom/tesseractMRZ/1e7adfecda5f3c9ae1fb12cf6b4b8c3958c63e46/tessdata_best/mrz.traineddata";
export const SHA_MRZ = "e44f5b7a6bdd3f382ef3bfa84ee0057f5897946a84a094c26910e0a124f3a9bd";
export const BYTES_MRZ = 11396382;
export const DESTINO_MRZ = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "models", "tesseract", "mrz.traineddata");

const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const coincide = (b, esperado) => b.length === esperado.bytes && sha256(b) === esperado.sha256;

/**
 * Ejecuta la descarga o la verificación. Devuelve el código de salida (0 bien, 1 fallo); nunca lanza.
 * Dependencias inyectables para pruebas: `fetch`, `destino`, `dirTemporal`, `esperado` ({ sha256, bytes }) y `log`.
 */
export async function descargarMrz({
  verificar = false,
  fetch = globalThis.fetch,
  destino = DESTINO_MRZ,
  dirTemporal = tmpdir(),
  esperado = { sha256: SHA_MRZ, bytes: BYTES_MRZ },
  url = URL_MRZ,
  log = (m) => process.stderr.write(`${m}\n`),
} = {}) {
  if (verificar) {
    try {
      if (coincide(await readFile(destino), esperado)) {
        log("modelos:mrz: OK");
        return 0;
      }
      log("modelos:mrz: el modelo no coincide con el hash esperado; ejecuta npm run modelos:mrz");
    } catch {
      log("modelos:mrz: modelo ausente; ejecuta npm run modelos:mrz");
    }
    return 1;
  }
  const temporal = join(dirTemporal, `mrz-${randomUUID()}.part`);
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const bytes = new Uint8Array(await resp.arrayBuffer());
    await writeFile(temporal, bytes);
    if (!coincide(bytes, esperado)) throw new Error("hash o tamaño distintos");
    await mkdir(dirname(destino), { recursive: true });
    try {
      await rename(temporal, destino);
    } catch {
      await copyFile(temporal, destino);
    }
    log("modelos:mrz: OK");
    return 0;
  } catch (e) {
    log(`modelos:mrz: fallo (${e instanceof Error ? e.message : "desconocido"}); destino sin tocar`);
    return 1;
  } finally {
    await rm(temporal, { force: true });
  }
}

// Punto de entrada de `npm run modelos:mrz` (red real): fuera de la mutación; la lógica está en descargarMrz.
// Stryker disable all
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = await descargarMrz({ verificar: process.argv.includes("--verificar") });
}
