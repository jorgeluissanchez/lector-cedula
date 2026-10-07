// Integración de la CLI tools/leer-foto.mjs (cambio leer-pdf417-desde-imagen, LPI-06 y LPI-07). Lanza la CLI como
// proceso hijo sobre imágenes SINTÉTICAS generadas en memoria y escritas solo en os.tmpdir() o, de forma transitoria,
// en evals/real/ y packages/capture/ (borradas al final). Requiere los dist construidos (`tsc -b`, parte de check).
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PERSONA_BASE, generarPdf417 } from "@lector-cedula/fixtures";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { imagenSintetica, pngBlanco } from "../../packages/capture/test/pdf417/sintetica.ts";

const RAIZ = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const CLI = join(RAIZ, "tools", "leer-foto.mjs");
const F = generarPdf417(PERSONA_BASE, { semilla: 1 });

const temporales = [];
let dirTmp;
let rutaS;

function correr(...args) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd: RAIZ, encoding: "utf8", timeout: 60_000 });
}

function escribir(ruta, bytes) {
  writeFileSync(ruta, bytes);
  temporales.push(ruta);
  return ruta;
}

/** Listado recursivo: ruta relativa -> tamaño y fecha de modificación. */
function listado(dir, excluir = new Set()) {
  const r = {};
  const recorrer = (actual) => {
    for (const e of readdirSync(actual, { withFileTypes: true })) {
      if (excluir.has(e.name)) continue;
      const ruta = join(actual, e.name);
      if (e.isDirectory()) recorrer(ruta);
      else {
        const s = statSync(ruta);
        r[relative(dir, ruta)] = `${s.size}:${s.mtimeMs}`;
      }
    }
  };
  recorrer(dir);
  return r;
}

function camposDe(stdout) {
  return JSON.parse(stdout).resultado.campos;
}

beforeAll(async () => {
  dirTmp = mkdtempSync(join(tmpdir(), "leer-foto-"));
  rutaS = escribir(join(dirTmp, "s.png"), await imagenSintetica(F.bytes));
}, 60_000);

afterAll(() => {
  for (const t of temporales) rmSync(t, { force: true });
  rmSync(dirTmp, { recursive: true, force: true });
});

describe("LPI-06 CLI leer-foto", { timeout: 60_000 }, () => {
  it("LPI-06 Lectura de imagen sintética", () => {
    const r = correr("--sin-mascara", rutaS);
    expect(r.status).toBe(0);
    const salida = JSON.parse(r.stdout);
    expect(salida).toMatchObject({ ok: true, intento: "original", enmascarado: false });
    const e = F.esperado;
    expect(salida.resultado.campos).toMatchObject({
      numeroDocumento: e.nuip,
      primerApellido: e.primerApellido,
      segundoApellido: e.segundoApellido,
      primerNombre: e.primerNombre,
      segundoNombre: e.segundoNombre,
      sexo: e.sexo,
      fechaNacimiento: e.fechaNacimiento,
      rh: e.rh,
    });
    expect(r.stdout.endsWith("}\n")).toBe(true);
    expect(r.stdout.trim().split("\n")).toHaveLength(1);
  });

  it("LPI-06 Máscara por defecto", () => {
    const r = correr(rutaS);
    expect(r.status).toBe(0);
    const salida = JSON.parse(r.stdout);
    expect(salida.enmascarado).toBe(true);
    expect(camposDe(r.stdout)).toMatchObject({
      numeroDocumento: "9999****56",
      primerApellido: "P*****",
      segundoApellido: "E******",
      primerNombre: "F*******",
      segundoNombre: "L**",
      fechaNacimiento: "1985-03-14",
    });
    expect(r.stdout).not.toContain("9999123456");
    expect(r.stdout).not.toContain("PRUEBA");
  });

  it("LPI-06 la opción puede ir después de la ruta", () => {
    const r = correr(rutaS, "--sin-mascara");
    expect(r.status).toBe(0);
    expect(camposDe(r.stdout).numeroDocumento).toBe("9999123456");
  });

  it("LPI-06 Uso incorrecto", () => {
    const inexistente = join(tmpdir(), `no-existe-${randomUUID()}.png`);
    for (const args of [[], [inexistente], [rutaS, rutaS]]) {
      const r = correr(...args);
      expect(r.status).toBe(64);
      expect(r.stdout).toBe("");
      expect(r.stderr).not.toContain("no-existe-");
      expect(r.stderr).not.toContain(dirTmp);
    }
  });

  it("LPI-06 Opción desconocida", () => {
    const r = correr("--otra", rutaS);
    expect(r.status).toBe(64);
    expect(r.stdout).toBe("");
    expect(r.stderr).not.toContain(dirTmp);
  });

  it("LPI-06 Sin PDF417", () => {
    const r = correr(escribir(join(dirTmp, "blanco.png"), pngBlanco(800, 600)));
    expect(r.status).toBe(1);
    expect(r.stdout).toBe('{"ok":false,"error":"pdf417-no-encontrado"}\n');
  });

  it("LPI-06 archivo que no es imagen: imagen-ilegible con código 1", () => {
    const r = correr(escribir(join(dirTmp, "texto.png"), new Uint8Array([1, 2, 3])));
    expect(r.status).toBe(1);
    expect(r.stdout).toBe('{"ok":false,"error":"imagen-ilegible"}\n');
  });

  it("LPI-06 parser con ok:false da código 2", async () => {
    const vacio = await imagenSintetica(new Uint8Array(Array.from({ length: 40 }, (_, i) => 0x41 + (i % 26))));
    const r = correr(escribir(join(dirTmp, "otro.png"), vacio));
    expect(r.status).toBe(2);
    const salida = JSON.parse(r.stdout);
    expect(salida.ok).toBe(false);
    expect(typeof salida.error).toBe("string");
  });
});

describe("LPI-07 Privacidad de la CLI y del decodificador", { timeout: 60_000 }, () => {
  it("LPI-07 Ruta dentro del repo", async () => {
    const ruta = escribir(join(RAIZ, "packages", "capture", `.tmp-prueba-${randomUUID()}.png`), await imagenSintetica(F.bytes));
    const r = correr(ruta);
    expect(r.status).toBe(64);
    expect(r.stderr).toContain("ruta-dentro-del-repo");
    expect(r.stdout).toBe("");
  });

  it("LPI-07 Ruta bajo evals/real", async () => {
    mkdirSync(join(RAIZ, "evals", "real"), { recursive: true });
    const ruta = escribir(join(RAIZ, "evals", "real", `tmp-prueba-${randomUUID()}.png`), await imagenSintetica(F.bytes));
    expect(correr(ruta).status).toBe(0);
  });

  it("LPI-07 No escribe a disco", () => {
    const excluir = new Set(["node_modules", ".git"]);
    const antesRepo = listado(RAIZ, excluir);
    const antesTmp = listado(dirTmp);
    const r = correr(rutaS);
    expect(r.status).toBe(0);
    expect(listado(dirTmp)).toStrictEqual(antesTmp);
    expect(listado(RAIZ, excluir)).toStrictEqual(antesRepo);
  });
});
