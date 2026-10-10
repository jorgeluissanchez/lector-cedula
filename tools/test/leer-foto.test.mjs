// Integración de la CLI tools/leer-foto.mjs (cambios leer-pdf417-desde-imagen y leer-mrz-desde-imagen, LPI-06 y LPI-07).
// Los reversos MRZ R se renderizan en el Chromium de Playwright (evals/sinteticos/render-mrz.mjs) con datos sintéticos. Lanza la CLI como
// proceso hijo sobre imágenes SINTÉTICAS generadas en memoria y escritas solo en os.tmpdir() o, de forma transitoria,
// en evals/real/ y packages/capture/ (borradas al final). Requiere los dist construidos (`tsc -b`, parte de check).
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PERSONA_BASE, generarMrzTd1, generarPdf417 } from "@lector-cedula/fixtures";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { imagenSintetica, pngBlanco } from "../../packages/capture/test/pdf417/sintetica.ts";
import { crearRenderizador } from "../../evals/sinteticos/render-mrz.mjs";

const RAIZ = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const CLI = join(RAIZ, "tools", "leer-foto.mjs");
const HOOK = join(RAIZ, "tools", "test", "ayudas", "bloquear-escrituras.mjs");
const MARCA = "ESCRITURA-PROHIBIDA";
const F = generarPdf417(PERSONA_BASE, { semilla: 1 });
const P = generarMrzTd1(PERSONA_BASE, { semilla: 1 });
const CORTO = generarPdf417({ ...PERSONA_BASE, nuip: "99991234" }, { semilla: 1 });
const LUGAR_DESCONOCIDO = generarPdf417({ ...PERSONA_BASE, departamento: "99", municipio: "999" }, { semilla: 1 });
const ALTERADO = generarMrzTd1(PERSONA_BASE, { variante: "cd-compuesto-alterado" });

const temporales = [];
let dirTmp;
let rutaS;
let rutaR;
let rutaCorto;
let rutaLugarDesconocido;
let rutaAlterado;
let modeloVacio;

/**
 * Tope del proceso hijo: una MRZ que nunca da 4 dígitos válidos agota el presupuesto de LMI-13 (40 llamadas o 60 s),
 * más el arranque de Node y Tesseract; con 60 s el hijo moría justo en el límite bajo carga.
 */
const TIEMPO_HIJO_MS = 150_000;

function correr(...args) {
  return correrCon({}, ...args);
}

/** Proceso hijo asíncrono: un spawnSync largo (OCR) bloquea el worker de Vitest y provoca timeouts de su RPC. */
function correrCon(entorno, ...args) {
  return correrNode({ env: entorno }, CLI, ...args);
}

/** Node hijo con opciones: `execArgv` (p. ej. el hook que bloquea escrituras), `cwd` y variables de entorno extra. */
function correrNode({ env: entorno = {}, execArgv = [], cwd = RAIZ }, ...args) {
  return new Promise((resolver, rechazar) => {
    const hijo = spawn(process.execPath, [...execArgv, ...args], { cwd, env: { ...process.env, ...entorno }, timeout: TIEMPO_HIJO_MS });
    let stdout = "";
    let stderr = "";
    hijo.stdout.setEncoding("utf8").on("data", (d) => (stdout += d));
    hijo.stderr.setEncoding("utf8").on("data", (d) => (stderr += d));
    hijo.on("error", rechazar);
    hijo.on("close", (status) => resolver({ status, stdout, stderr }));
  });
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

/** Directorio temporal vacío como cwd, HOME y TMP del hijo, con el hook de bloqueo de escrituras precargado. */
function aislamiento() {
  const dir = mkdtempSync(join(tmpdir(), "leer-foto-aislado-"));
  const env = { HOME: dir, USERPROFILE: dir, TMP: dir, TEMP: dir, TMPDIR: dir };
  return { dir, opciones: { env, cwd: dir, execArgv: ["--import", pathToFileURL(HOOK).href] } };
}

function camposDe(stdout) {
  return JSON.parse(stdout).resultado.campos;
}

beforeAll(async () => {
  dirTmp = mkdtempSync(join(tmpdir(), "leer-foto-"));
  rutaS = escribir(join(dirTmp, "s.png"), await imagenSintetica(F.bytes));
  rutaCorto = escribir(join(dirTmp, "corto.png"), await imagenSintetica(CORTO.bytes));
  rutaLugarDesconocido = escribir(join(dirTmp, "lugar.png"), await imagenSintetica(LUGAR_DESCONOCIDO.bytes));
  const render = await crearRenderizador();
  try {
    rutaR = escribir(join(dirTmp, "r.png"), (await render.render(P.lineas)).bytes);
    rutaAlterado = escribir(join(dirTmp, "r-alterado.png"), (await render.render(ALTERADO.lineas)).bytes);
  } finally {
    await render.cerrar();
  }
  modeloVacio = mkdtempSync(join(tmpdir(), "leer-foto-sin-modelo-"));
}, 60_000);

afterAll(() => {
  for (const t of temporales) rmSync(t, { force: true });
  rmSync(dirTmp, { recursive: true, force: true });
  if (modeloVacio) rmSync(modeloVacio, { recursive: true, force: true });
});

describe("LPI-06 CLI leer-foto", { timeout: 60_000 }, () => {
  it("LPI-06 Lectura de imagen sintética", async () => {
    const r = await correr("--sin-mascara", rutaS);
    expect(r.status).toBe(0);
    const salida = JSON.parse(r.stdout);
    expect(salida).toMatchObject({ ok: true, tipo: "pdf417", intento: "original", enmascarado: false });
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

  it("MOT-02 --resultado --sin-mascara imprime el RESULTADO del motor (@lector-cedula/motor)", async () => {
    const r = await correr("--sin-mascara", "--resultado", rutaS);
    expect(r.status).toBe(0);
    const salida = JSON.parse(r.stdout);
    expect(salida).toMatchObject({ ok: true, tipoDocumento: "cedula-ciudadania", fuente: "pdf417", campos: { nuip: "9999123456" }, confiable: false });
    expect(salida.riesgo).toMatchObject({ version: 1 });
    expect(r.stdout.trim().split("\n")).toHaveLength(1);
  });

  it("MOT-02 --resultado exige --sin-mascara", async () => {
    const r = await correr("--resultado", rutaS);
    expect(r.status).toBe(64);
    expect(r.stdout).toBe("");
  });

  it("MOT-02 --resultado sin documento: RESULTADO con sin-lectura y código 1", async () => {
    const r = await correr("--sin-mascara", "--resultado", escribir(join(dirTmp, "blanco-resultado.png"), pngBlanco(800, 600)));
    expect(r.status).toBe(1);
    expect(JSON.parse(r.stdout)).toStrictEqual({ ok: false, error: { codigo: "sin-lectura", tipo: "mrz" }, confiable: false, riesgo: null });
  });

  it("LPI-06 Máscara por defecto", async () => {
    const r = await correr(rutaS);
    expect(r.status).toBe(0);
    const salida = JSON.parse(r.stdout);
    expect(salida.enmascarado).toBe(true);
    expect(salida.tipo).toBe("pdf417");
    expect(camposDe(r.stdout)).toMatchObject({
      numeroDocumento: "********56",
      primerApellido: "P*****",
      segundoApellido: "E******",
      primerNombre: "F*******",
      segundoNombre: "L**",
      fechaNacimiento: "1985-03-14",
    });
    expect(r.stdout).not.toContain("9999123456");
    expect(r.stdout).not.toMatch(/9999\*/u);
    expect(r.stdout).not.toContain("PRUEBA");
  });

  it("LPI-06 Máscara de cédula antigua de 8 dígitos", async () => {
    const r = await correr(rutaCorto);
    expect(r.status).toBe(0);
    expect(camposDe(r.stdout).numeroDocumento).toBe("******34");
    expect(r.stdout).not.toContain("99991234");
    expect(r.stdout).not.toContain("9999");
  });

  it("LPI-08 Lugar conocido", async () => {
    for (const args of [[rutaS], ["--sin-mascara", rutaS]]) {
      const r = await correr(...args);
      expect(r.status).toBe(0);
      const salida = JSON.parse(r.stdout);
      expect(salida.resultado.campos.lugarNacimiento).toStrictEqual({ codigo: "16001", departamento: "BOGOTA D.C", municipio: "BOGOTA, D.C." });
      expect(salida.resultado.warnings).not.toContain("lugar-nacimiento-no-resuelto");
    }
  });

  it("LPI-08 Lugar desconocido", async () => {
    const r = await correr("--sin-mascara", rutaLugarDesconocido);
    expect(r.status).toBe(0);
    const salida = JSON.parse(r.stdout);
    expect(salida.resultado.campos.lugarNacimiento).toBeNull();
    expect(salida.resultado.warnings).toContain("lugar-nacimiento-no-resuelto");
  });

  it("LPI-06 la opción puede ir después de la ruta", async () => {
    const r = await correr(rutaS, "--sin-mascara");
    expect(r.status).toBe(0);
    expect(camposDe(r.stdout).numeroDocumento).toBe("9999123456");
  });

  it("LPI-06 Uso incorrecto", async () => {
    const inexistente = join(tmpdir(), `no-existe-${randomUUID()}.png`);
    for (const args of [[], [inexistente], [rutaS, rutaS]]) {
      const r = await correr(...args);
      expect(r.status).toBe(64);
      expect(r.stdout).toBe("");
      expect(r.stderr).not.toContain("no-existe-");
      expect(r.stderr).not.toContain(dirTmp);
    }
  });

  it("LPI-06 Opción desconocida", async () => {
    const r = await correr("--otra", rutaS);
    expect(r.status).toBe(64);
    expect(r.stdout).toBe("");
    expect(r.stderr).not.toContain(dirTmp);
  });

  it("LPI-06 Sin documento", async () => {
    const r = await correr(escribir(join(dirTmp, "blanco.png"), pngBlanco(800, 600)));
    expect(r.status).toBe(1);
    expect(r.stdout).toBe('{"ok":false,"error":"documento-no-encontrado"}\n');
  });

  it("LPI-06 Detección de MRZ", async () => {
    const r = await correr("--sin-mascara", "--fecha-referencia", "2026-10-06", rutaR);
    expect(r.status).toBe(0);
    const salida = JSON.parse(r.stdout);
    expect(salida).toMatchObject({ ok: true, tipo: "mrz", enmascarado: false });
    expect(["proyeccion", "recorte-inferior"]).toContain(salida.intento);
    expect(salida.resultado.valido).toBe(true);
    expect(salida.resultado.lineasCorregidas).toStrictEqual([...P.lineasSinErrores]);
  });

  it("LPI-06 Máscara MRZ por defecto", async () => {
    const r = await correr("--fecha-referencia", "2026-10-06", rutaR);
    expect(r.status).toBe(0);
    const salida = JSON.parse(r.stdout);
    expect(salida.enmascarado).toBe(true);
    expect(salida.resultado.campos.nuip).toBe("********56");
    expect(salida.resultado.campos.serial).toBe("*******45");
    expect(salida.resultado.campos.apellidos).toBe("P***** E******");
    expect(salida.resultado.lineasCorregidas).toBeNull();
    expect(salida.resultado.correcciones).toBeNull();
    for (const prohibido of ["9999123456", "999912345", "PRUEBA"]) expect(r.stdout).not.toContain(prohibido);
  });

  it("LPI-06 MRZ con dígito de control inválido", async () => {
    const r = await correr("--fecha-referencia", "2026-10-06", rutaAlterado);
    expect(r.status).toBe(2);
    expect(r.stdout).toBe('{"ok":false,"tipo":"mrz","error":"mrz-no-valida","digitosValidos":3}\n');
  }, 180_000);

  it("LPI-06 Modelo MRZ ausente", async () => {
    const r = await correrCon({ LECTOR_CEDULA_RUTA_MODELO_MRZ: modeloVacio }, rutaR);
    expect(r.status).toBe(3);
    expect(r.stdout).toBe('{"ok":false,"tipo":"mrz","error":"modelo-no-disponible"}\n');
    expect(r.stderr).toContain("npm run modelos:mrz");
    expect(r.stderr).not.toContain(dirTmp);
  });

  it("LPI-06 Fecha de referencia mal formada, ausente o inexistente: 64", async () => {
    for (const args of [["--fecha-referencia", "06/10/2026", rutaR], [rutaR, "--fecha-referencia"], ["--fecha-referencia", "2026-02-30", rutaR]]) {
      const r = await correr(...args);
      expect(r.status).toBe(64);
      expect(r.stdout).toBe("");
      expect(r.stderr).not.toContain(dirTmp);
    }
  });

  it("LPI-06 archivo que no es imagen: imagen-ilegible con código 1", async () => {
    const r = await correr(escribir(join(dirTmp, "texto.png"), new Uint8Array([1, 2, 3])));
    expect(r.status).toBe(1);
    expect(r.stdout).toBe('{"ok":false,"error":"imagen-ilegible"}\n');
  });

  it("LPI-06 parser con ok:false da código 2", async () => {
    const vacio = await imagenSintetica(new Uint8Array(Array.from({ length: 40 }, (_, i) => 0x41 + (i % 26))));
    const r = await correr(escribir(join(dirTmp, "otro.png"), vacio));
    expect(r.status).toBe(2);
    const salida = JSON.parse(r.stdout);
    expect(salida.ok).toBe(false);
    expect(typeof salida.error).toBe("string");
  });
});

describe("LPI-07 Privacidad de la CLI y del decodificador", { timeout: 60_000 }, () => {
  it("LPI-07 Ruta dentro del repo", async () => {
    const ruta = escribir(join(RAIZ, "packages", "capture", `.tmp-prueba-${randomUUID()}.png`), await imagenSintetica(F.bytes));
    const r = await correr(ruta);
    expect(r.status).toBe(64);
    expect(r.stderr).toContain("ruta-dentro-del-repo");
    expect(r.stdout).toBe("");
  });

  it("LPI-07 Ruta bajo evals/real", async () => {
    mkdirSync(join(RAIZ, "evals", "real"), { recursive: true });
    const ruta = escribir(join(RAIZ, "evals", "real", `tmp-prueba-${randomUUID()}.png`), await imagenSintetica(F.bytes));
    expect((await correr(ruta)).status).toBe(0);
  });

  /**
   * Backlog F1: en vez de comparar el repositorio entero (que Playwright, Lighthouse y otras pruebas modifican en la misma
   * corrida), el hijo corre con un hook que hace fallar toda escritura de node:fs y la marca en stderr, con cwd, HOME y
   * TMP en un directorio temporal propio que además se compara antes y después.
   */
  it("LPI-07 No escribe a disco", async () => {
    const aislado = aislamiento();
    try {
      const antesTmp = listado(dirTmp);
      const antesAislado = listado(aislado.dir);
      const r = await correrNode(aislado.opciones, CLI, rutaS);
      expect(r.stderr).not.toContain(MARCA);
      expect(r.status).toBe(0);
      expect(JSON.parse(r.stdout).ok).toBe(true);
      expect(listado(dirTmp)).toStrictEqual(antesTmp);
      expect(listado(aislado.dir)).toStrictEqual(antesAislado);
    } finally {
      rmSync(aislado.dir, { recursive: true, force: true });
    }
  });

  // Mutantes del detector: una escritura real por cada familia de API debe quedar bloqueada y marcada.
  it.each([
    ["writeFileSync", `import { writeFileSync } from "node:fs"; try { writeFileSync("x.txt", "a"); } catch {}`],
    ["promises.writeFile", `import { writeFile } from "node:fs/promises"; await writeFile("x.txt", "a").catch(() => {});`],
    ["createWriteStream", `import fs from "node:fs"; try { fs.createWriteStream("x.txt"); } catch {}`],
    ["openSync", `import { openSync } from "node:fs"; try { openSync("x.txt", "w"); } catch {}`],
    ["mkdirSync", `import { mkdirSync } from "node:fs"; try { mkdirSync("d"); } catch {}`],
  ])("LPI-07 El detector bloquea y marca %s", async (api, codigo) => {
    const aislado = aislamiento();
    try {
      const r = await correrNode(aislado.opciones, "--input-type=module", "-e", codigo);
      expect(r.stderr).toContain(`${MARCA}: ${api}`);
      expect(listado(aislado.dir)).toStrictEqual({});
    } finally {
      rmSync(aislado.dir, { recursive: true, force: true });
    }
  });

  it("LPI-07 El detector deja leer", async () => {
    const aislado = aislamiento();
    try {
      const codigo = `import { readFileSync } from "node:fs"; process.stdout.write(String(readFileSync(${JSON.stringify(CLI)}).length > 0));`;
      const r = await correrNode(aislado.opciones, "--input-type=module", "-e", codigo);
      expect(r.stderr).not.toContain(MARCA);
      expect(r.stdout).toBe("true");
    } finally {
      rmSync(aislado.dir, { recursive: true, force: true });
    }
  });
});

describe("DC-10 Atribución CC BY-SA en la salida PDF417", { timeout: 60_000 }, () => {
  const FUENTES = "Datos: DANE y Registraduría, CC BY-SA 4.0; ver --licencias";

  it("DC-10 Campo fuentes en la salida PDF417", async () => {
    for (const args of [[rutaS], ["--sin-mascara", rutaS]]) {
      const r = await correr(...args);
      expect(r.status).toBe(0);
      expect(JSON.parse(r.stdout).fuentes).toBe(FUENTES);
    }
  });

  it("DC-10 Consulado de 2018 en la CLI", async () => {
    const consulado = generarPdf417({ ...PERSONA_BASE, departamento: "88", municipio: "690" }, { semilla: 1 });
    const ruta = escribir(join(dirTmp, "consulado.png"), await imagenSintetica(consulado.bytes));
    const r = await correr(ruta);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).resultado.campos.lugarNacimiento).toStrictEqual({ codigo: "88690", departamento: "CONSULADOS", municipio: "VIETNAM" });
  });

  it("DC-10 Errores sin cambios", async () => {
    const r = await correr(escribir(join(dirTmp, "blanco-dc10.png"), pngBlanco(800, 600)));
    expect(r.stdout).toBe('{"ok":false,"error":"documento-no-encontrado"}\n');
  });
});
