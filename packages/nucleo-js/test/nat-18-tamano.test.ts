// NAT-18 (sdk-nativo): `npm run check:tamano-nativo` mide el bundle real contra su tope (design.md, decisión 5 del
// orquestador: la medida de la fase 0 más un 10 %, dentro del techo de 409 600 B de la spec) y falla con un fixture más
// grande; informa el AAR y el XCFramework y falla si crecen más de un 10 % frente al registro anterior.
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, open, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { gzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error: script .mjs sin tipos.
import { LIMITE_NUCLEO_GZIP, TECHO_NUCLEO_GZIP } from "../../../tools/tamano-nativo.mjs";

const ejecutar = promisify(execFile);
const SCRIPT = fileURLToPath(new URL("../../../tools/tamano-nativo.mjs", import.meta.url));
let dir = "";

async function correr(args: string[]): Promise<{ codigo: number; salida: string }> {
  try {
    const r = await ejecutar(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });
    return { codigo: 0, salida: r.stdout + r.stderr };
  } catch (e) {
    const err = e as { code?: number; stdout?: string; stderr?: string };
    return { codigo: err.code ?? -1, salida: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

/** Archivo cuyo gzip nivel 9 mide al menos `bytes` (bytes aleatorios: incompresibles). */
async function fixtureGzip(nombre: string, bytes: number): Promise<string> {
  const ruta = join(dir, nombre);
  let datos = randomBytes(bytes);
  while (gzipSync(datos, { level: 9 }).byteLength < bytes) datos = Buffer.concat([datos, randomBytes(64)]);
  await writeFile(ruta, datos);
  return ruta;
}

/** Archivo disperso de `bytes` B (no ocupa disco). */
async function artefacto(nombre: string, bytes: number): Promise<string> {
  const ruta = join(dir, nombre);
  const f = await open(ruta, "w");
  await f.truncate(bytes);
  await f.close();
  return ruta;
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "tamano-nativo-"));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("NAT-18 Presupuesto de tamaño", { timeout: 60_000 }, () => {
  it("NAT-18 El tope está dentro del techo de la spec", () => {
    expect(TECHO_NUCLEO_GZIP).toBe(409_600);
    expect(LIMITE_NUCLEO_GZIP).toBeLessThanOrEqual(TECHO_NUCLEO_GZIP);
  });

  it("NAT-18 Bundle en presupuesto: el real pasa", async () => {
    const r = await correr([]);
    expect(r.salida).toMatch(/@lector-cedula\/nucleo-js: \d+ B gzip/u);
    expect(r.codigo).toBe(0);
  });

  it("NAT-18 Bundle en presupuesto: un fixture de 409 601 B falla", async () => {
    const r = await correr(["--bundle", await fixtureGzip("techo.js", 409_601)]);
    expect(r.codigo).not.toBe(0);
    expect(r.salida).toContain("EXCEDE");
  });

  it("NAT-18 Bundle en presupuesto: un fixture de tope + 1 B falla", async () => {
    const r = await correr(["--bundle", await fixtureGzip("tope.js", (LIMITE_NUCLEO_GZIP as number) + 1)]);
    expect(r.codigo).not.toBe(0);
  });

  it("NAT-18 Crecimiento de artefactos", async () => {
    const registro = join(dir, "registro.json");
    await writeFile(registro, JSON.stringify({ artefactos: { "lector-cedula-android.aar": 10_000_000 } }));
    const grande = await artefacto("a.aar", 11_000_001);
    const r = await correr(["--registro", registro, "--artefacto", `lector-cedula-android.aar=${grande}`]);
    expect(r.codigo).not.toBe(0);
    expect(r.salida).toContain("lector-cedula-android.aar");
    expect(r.salida).toContain("11000001");
  });

  it("NAT-18 Un crecimiento del 10 % justo pasa y un artefacto nuevo solo se informa", async () => {
    const registro = join(dir, "registro2.json");
    await writeFile(registro, JSON.stringify({ artefactos: { "lector-cedula-android.aar": 10_000_000 } }));
    const justo = await artefacto("b.aar", 11_000_000);
    const nuevo = await artefacto("c.xcframework.zip", 123);
    const r = await correr(["--registro", registro, "--artefacto", `lector-cedula-android.aar=${justo}`, "--artefacto", `LectorCedula.xcframework=${nuevo}`]);
    expect(r.codigo).toBe(0);
    expect(r.salida).toContain("LectorCedula.xcframework: 123 B (sin registro anterior");
  });

  it("NAT-18 Uso incorrecto", async () => {
    expect((await correr(["--artefacto", "sin-igual"])).codigo).toBe(64);
    expect((await correr(["--bundle"])).codigo).toBe(64);
    expect((await correr(["--registro", join(dir, "no-existe.json"), "--artefacto", `x=${join(dir, "no-existe.aar")}`])).codigo).not.toBe(0);
  });
});
