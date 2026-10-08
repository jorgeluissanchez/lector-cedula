// MS-16 "Equivalencia con la CLI" (cambio motor-real-servidor): sobre la imagen sintética S (PDF417) y el reverso R
// renderizado (MRZ) de PERSONA_BASE, el lector del servidor (server/lector/leer.mjs) seguido del intérprete
// (server/interprete/interpretar.mjs) da los mismos campos que tools/leer-foto.mjs --sin-mascara.
// Datos sintéticos (skill fixture-sintetico); las imágenes temporales viven fuera del repositorio y se borran.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PERSONA_BASE, generarMrzTd1, generarPdf417 } from "@lector-cedula/fixtures";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { imagenSintetica } from "../../packages/capture/test/pdf417/sintetica.ts";
import { crearRenderizador } from "../../evals/sinteticos/render-mrz.mjs";

const RAIZ = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const CLI = join(RAIZ, "tools", "leer-foto.mjs");
const LECTOR = join(RAIZ, "server", "lector", "leer.mjs");
const INTERPRETE = join(RAIZ, "server", "interprete", "interpretar.mjs");
const FECHA = "2026-10-06";
const ENTORNO = {
  LECTOR_CEDULA_RUTA_MODELO_MRZ: join(RAIZ, "models", "tesseract"),
  RUTA_PARSERS: join(RAIZ, "packages", "parsers", "dist", "index.js"),
};
const TIEMPO_HIJO_MS = 150_000;

/** Proceso hijo asíncrono (un spawnSync largo bloquea el RPC de Vitest). */
function correr(args, entrada = "") {
  return new Promise((resolver, rechazar) => {
    const hijo = spawn(process.execPath, args, { cwd: RAIZ, env: { ...process.env, ...ENTORNO }, timeout: TIEMPO_HIJO_MS });
    let stdout = "";
    hijo.stdout.setEncoding("utf8").on("data", (d) => (stdout += d));
    hijo.on("error", rechazar);
    hijo.on("close", (status) => resolver({ status, salida: stdout ? JSON.parse(stdout) : null }));
    hijo.stdin.end(entrada);
  });
}

async function servidor(tipo, imagen) {
  const lectura = await correr([LECTOR], JSON.stringify({ tipo, fecha_referencia: FECHA, imagenes_b64: [Buffer.from(imagen).toString("base64")] }));
  expect(lectura.status).toBe(0);
  expect(lectura.salida.ok).toBe(true);
  const peticion = lectura.salida.pdf417_b64
    ? { fuente: "pdf417", datos_b64: lectura.salida.pdf417_b64 }
    : { fuente: "mrz", lineas: lectura.salida.mrz, fecha_referencia: FECHA };
  const interpretacion = await correr([INTERPRETE], JSON.stringify(peticion));
  expect(interpretacion.status).toBe(0);
  return interpretacion.salida;
}

let dir;
let imagenS;
let imagenR;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "lector-servidor-"));
  imagenS = await imagenSintetica(generarPdf417(PERSONA_BASE, { semilla: 1 }).bytes);
  const render = await crearRenderizador();
  try {
    imagenR = (await render.render(generarMrzTd1(PERSONA_BASE, { semilla: 1 }).lineas)).bytes;
  } finally {
    await render.cerrar();
  }
}, 60_000);

afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe("MS-16 Equivalencia con la CLI", { timeout: 300_000 }, () => {
  it("MS-16 PDF417: mismos campos que leer-foto", async () => {
    const ruta = join(dir, "s.png");
    writeFileSync(ruta, imagenS);
    const cli = await correr([CLI, "--sin-mascara", "--fecha-referencia", FECHA, ruta]);
    expect(cli.status).toBe(0);
    const camposCli = { ...cli.salida.resultado.campos };
    delete camposCli.lugarNacimiento;
    const srv = await servidor("co_national-id-2000", imagenS);
    expect(srv.ok).toBe(true);
    expect(srv.campos).toStrictEqual(camposCli);
    expect(srv.warnings).toStrictEqual(cli.salida.resultado.warnings.filter((w) => w !== "lugar-nacimiento-no-resuelto"));
  });

  it("MS-16 MRZ: mismos campos que leer-foto", async () => {
    const ruta = join(dir, "r.png");
    writeFileSync(ruta, imagenR);
    const cli = await correr([CLI, "--sin-mascara", "--fecha-referencia", FECHA, ruta]);
    expect(cli.status).toBe(0);
    const c = cli.salida.resultado.campos;
    const srv = await servidor("co_national-id-2020", imagenR);
    expect(srv.ok).toBe(true);
    expect(srv.valido).toBe(true);
    expect(srv.campos).toStrictEqual({
      nuip: c.nuip,
      apellidos: c.apellidos,
      nombres: c.nombres,
      sexo: c.sexo,
      fechaNacimiento: c.fechaNacimiento,
      fechaVencimiento: c.fechaVencimiento,
    });
    expect(srv.warnings).toStrictEqual(cli.salida.resultado.warnings);
  });
});
