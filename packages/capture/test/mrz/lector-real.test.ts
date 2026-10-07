// LMI-02, LMI-05, LMI-06 y LMI-07 (spec lectura-mrz-imagen) con Tesseract.js 7.0.0 y mrz.traineddata REALES.
// Requiere `npm run modelos:mrz`. Imágenes SINTÉTICAS (Chromium de Playwright, @lector-cedula/fixtures), en memoria.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PERSONA_BASE, generarMrzTd1 } from "@lector-cedula/fixtures";
import { PNG } from "pngjs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { crearRenderizador } from "../../../../evals/sinteticos/render-mrz.mjs";
import { crearLectorMrz, type LectorMrz, type ResultadoLectorMrz } from "../../src/mrz/lector.js";

const RAIZ = resolve(fileURLToPath(new URL("../../../..", import.meta.url)));
const MODELO = join(RAIZ, "models", "tesseract");
const REF = { fechaReferencia: "2026-10-06" };
const P = generarMrzTd1(PERSONA_BASE, { semilla: 1 });

let R: Uint8Array;
let F: Uint8Array;
let lector: LectorMrz;
let vacio: string;

function lecturaCorrecta(r: ResultadoLectorMrz, v = P): void {
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(r.resultado.ok).toBe(true);
  const d = r.resultado.digitosControl;
  expect([d.serial.estado, d.nacimiento.estado, d.vencimiento.estado, d.compuesto.estado]).toStrictEqual(["valido", "valido", "valido", "valido"]);
  expect(r.resultado.lineasCorregidas).toStrictEqual([...v.lineasSinErrores]);
}

/** Listado recursivo: ruta relativa -> tamaño y fecha de modificación. */
function listado(dir: string, excluir: (rel: string) => boolean = () => false): Record<string, string> {
  const r: Record<string, string> = {};
  const recorrer = (actual: string): void => {
    for (const e of readdirSync(actual, { withFileTypes: true })) {
      const ruta = join(actual, e.name);
      const rel = relative(dir, ruta);
      if (excluir(rel)) continue;
      if (e.isDirectory()) recorrer(ruta);
      else {
        const s = statSync(ruta);
        r[rel] = `${s.size}:${s.mtimeMs}`;
      }
    }
  };
  recorrer(dir);
  return r;
}

// Rutas que otras pruebas del mismo `npm test` (o agentes en paralelo) crean y borran: no las crea el lector.
const AJENAS = /^(node_modules|\.git|test-results|coverage|reports|\.stryker-tmp[^\\/]*|server|apps|e2e|openspec|docs)([\\/]|$)|tmp-prueba-|[\\/]src[\\/](flujo|navegador)([\\/]|$)/u;

beforeAll(async () => {
  if (!existsSync(join(MODELO, "mrz.traineddata"))) throw new Error("falta el modelo: ejecuta npm run modelos:mrz");
  const render = await crearRenderizador();
  R = (await render.render(P.lineas)).bytes;
  F = (await render.render(P.lineas, { foto: true })).bytes;
  await render.cerrar();
  lector = crearLectorMrz({ rutaModelo: MODELO });
  vacio = mkdtempSync(join(tmpdir(), "mrz-sin-modelo-"));
}, 60_000);

afterAll(async () => {
  await lector?.terminar();
  if (vacio) rmSync(vacio, { recursive: true, force: true });
}, 60_000);

describe("Lector MRZ con el modelo real", { timeout: 120_000 }, () => {
  it("LMI-07 No escribe a disco", async () => {
    // Proceso hijo con `cwd` en un directorio de trabajo vacío (Tesseract.js escribe su caché relativa a `cwd`;
    // `process.chdir` no existe en los workers de Vitest/Stryker). Usa el dist construido por `tsc -b`.
    const trabajo = mkdtempSync(join(tmpdir(), "mrz-trabajo-"));
    const entrada = mkdtempSync(join(tmpdir(), "mrz-entrada-"));
    try {
      writeFileSync(join(entrada, "r.png"), R);
      const codigo = [
        `import { readFileSync } from "node:fs";`,
        `const { crearLectorMrz } = await import(${JSON.stringify(pathToFileURL(join(RAIZ, "packages", "capture", "dist", "index.js")).href)});`,
        `const l = crearLectorMrz({ rutaModelo: ${JSON.stringify(MODELO)} });`,
        `const r = await l.leer(new Uint8Array(readFileSync(${JSON.stringify(join(entrada, "r.png"))})), ${JSON.stringify(REF)});`,
        `await l.terminar();`,
        `process.stdout.write(JSON.stringify(r.ok ? r.resultado.lineasCorregidas : r));`,
      ].join("\n");
      const antes = [listado(RAIZ, (rel) => AJENAS.test(rel)), listado(trabajo), listado(entrada), listado(MODELO)];
      // Asíncrono: un spawnSync largo bloquea el worker de Vitest.
      const hijo = await promisify(execFile)(process.execPath, ["--input-type=module", "-e", codigo], { cwd: trabajo, encoding: "utf8", timeout: 90_000 });
      expect(JSON.parse(hijo.stdout)).toStrictEqual([...P.lineasSinErrores]);
      expect(hijo.stderr).toBe("");
      const despues = [listado(RAIZ, (rel) => AJENAS.test(rel)), listado(trabajo), listado(entrada), listado(MODELO)];
      expect(despues).toStrictEqual(antes);
      expect(Object.keys(antes[1] ?? {})).toHaveLength(0);
    } finally {
      rmSync(trabajo, { recursive: true, force: true });
      rmSync(entrada, { recursive: true, force: true });
    }
  });

  it("LMI-07 Sin consola ni red", async () => {
    const espias = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m));
    const fetch = vi.spyOn(globalThis, "fetch");
    try {
      const local = crearLectorMrz({ rutaModelo: MODELO });
      lecturaCorrecta(await local.leer(R, REF));
      await local.terminar();
      for (const e of espias) expect(e).not.toHaveBeenCalled();
      const urls = fetch.mock.calls.map((c) => String(c[0]));
      expect(urls.filter((u) => /^https?:/u.test(u))).toStrictEqual([]);
    } finally {
      for (const e of espias) e.mockRestore();
      fetch.mockRestore();
    }
  });

  it("LMI-02 Modelo ausente sin red", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    try {
      const sinModelo = crearLectorMrz({ rutaModelo: vacio });
      expect(await sinModelo.leer(R, REF)).toStrictEqual({ ok: false, error: "modelo-no-disponible" });
      await sinModelo.terminar();
      expect(fetch.mock.calls.map((c) => String(c[0])).filter((u) => /^https?:/u.test(u))).toStrictEqual([]);
    } finally {
      fetch.mockRestore();
    }
  });

  it("LMI-05 Errores literales", async () => {
    const blanco = new PNG({ width: 800, height: 600 });
    blanco.data.fill(255);
    const pngBlanco = new Uint8Array(PNG.sync.write(blanco));
    expect(await lector.leer(null, REF)).toStrictEqual({ ok: false, error: "entrada-invalida" });
    expect(await lector.leer(new Uint8Array([1, 2, 3]), REF)).toStrictEqual({ ok: false, error: "imagen-ilegible" });
    expect(await lector.leer(pngBlanco, REF)).toStrictEqual({ ok: false, error: "mrz-no-encontrada" });
    expect(await lector.leer(R, { fechaReferencia: "06/10/2026" })).toStrictEqual({ ok: false, error: "fecha-referencia-invalida" });
  });

  it("LMI-06 Reverso sintético R", async () => {
    lecturaCorrecta(await lector.leer(R, REF));
  });

  it("LMI-06 Foto sintética completa", async () => {
    lecturaCorrecta(await lector.leer(F, REF));
  });
});
