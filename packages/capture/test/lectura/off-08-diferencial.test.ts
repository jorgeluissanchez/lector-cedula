// OFF-08 Parseo y DIVIPOL en el dispositivo (pwa-lectura-offline, tarea 2.3): diferencial de `leerDocumento` contra la
// CLI `npm run leer-foto` y escenario "Lugar desconocido". Imágenes SINTÉTICAS de PERSONA_BASE (semilla 1), escritas
// solo en un temporal fuera del repositorio y borradas al final. Requiere `tsc -b` (dist de la CLI) y `npm run modelos:mrz`.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PERSONA_BASE, generarMrzTd1, generarPdf417 } from "@lector-cedula/fixtures";
import { buscarDivipol, parsearPdf417Amarilla } from "@lector-cedula/parsers";
import { PNG } from "pngjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearRenderizador } from "../../../../evals/sinteticos/render-mrz.mjs";
import { leerDocumento } from "../../src/lectura/leer.js";
import type { DependenciasLectura } from "../../src/lectura/tipos.js";
import { crearLectorMrz, type LectorMrz } from "../../src/mrz/lector.js";
import { decodificarPdf417Imagen } from "../../src/pdf417/decodificar.js";
import { imagenSintetica } from "../pdf417/sintetica.js";

const RAIZ = resolve(fileURLToPath(new URL("../../../..", import.meta.url)));
const CLI = join(RAIZ, "tools", "leer-foto.mjs");
const FECHA = "2026-10-06";

let dir: string;
let lector: LectorMrz;
let deps: DependenciasLectura;
const imagenes: Record<"amarilla" | "digital", Uint8Array> = { amarilla: new Uint8Array(), digital: new Uint8Array() };

function cli(ruta: string): Promise<{ status: number | null; stdout: string }> {
  return new Promise((resolver, rechazar) => {
    const hijo = spawn(process.execPath, [CLI, "--fecha-referencia", FECHA, ruta], { cwd: RAIZ, timeout: 150_000 });
    let stdout = "";
    hijo.stdout.setEncoding("utf8").on("data", (d: string) => (stdout += d));
    hijo.on("error", rechazar);
    hijo.on("close", (status) => resolver({ status, stdout }));
  });
}

function pixeles(png: Uint8Array) {
  const p = PNG.sync.read(Buffer.from(png));
  return { data: new Uint8ClampedArray(p.data), width: p.width, height: p.height };
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "off-08-"));
  imagenes.amarilla = await imagenSintetica(generarPdf417(PERSONA_BASE, { semilla: 1 }).bytes);
  const render = await crearRenderizador();
  try {
    imagenes.digital = (await render.render(generarMrzTd1(PERSONA_BASE, { semilla: 1 }).lineas)).bytes;
  } finally {
    await render.cerrar();
  }
  lector = crearLectorMrz({ rutaModelo: join(RAIZ, "models", "tesseract") });
  deps = { decodificar: decodificarPdf417Imagen, lectorMrz: lector, parsearPdf417: parsearPdf417Amarilla, buscarDivipol };
}, 60_000);

afterAll(async () => {
  await lector?.terminar();
  rmSync(dir, { recursive: true, force: true });
});

describe("OFF-08 Parseo y DIVIPOL en el dispositivo", { timeout: 60_000 }, () => {
  for (const tipo of ["amarilla", "digital"] as const) {
    it(`OFF-08 Igual que la CLI (${tipo})`, { timeout: 180_000 }, async () => {
      const ruta = join(dir, `${tipo}.png`);
      writeFileSync(ruta, imagenes[tipo]);
      const salida = await cli(ruta);
      expect(salida.status).toBe(0);
      const json = JSON.parse(salida.stdout) as { ok: boolean; tipo: string; resultado: unknown };
      const r = await leerDocumento(pixeles(imagenes[tipo]), deps, { fechaReferencia: FECHA });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.tipo).toBe(json.tipo);
      expect(r.tipo).toBe(tipo === "amarilla" ? "pdf417" : "mrz");
      // Comparación por JSON: la CLI serializa (las claves con `undefined` desaparecen en ambos lados por igual).
      expect(JSON.parse(JSON.stringify(r.resultado))).toStrictEqual(json.resultado);
    });
  }
});
