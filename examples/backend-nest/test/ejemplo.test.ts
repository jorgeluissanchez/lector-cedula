// MOT-13 (Nest): el ejemplo monta crearLectorServidor(...).nest() en un controlador `@All("api/cedula")` de NestJS 12
// sobre @nestjs/platform-express (express 5 anidado, mientras @lector-cedula/servidor se prueba con express 4) con
// `rawBody: true`, y se prueba de punta a punta con fetch contra un puerto efímero y el motor real en proceso.
// Fixtures sintéticos (PERSONA_BASE, NUIP 9999123456).
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { crearMotor, type Motor } from "@lector-cedula/motor";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { amarilla, digital, NUIP } from "../../../packages/motor/test/ayudas/imagenes.js";
import { crearApp, type Confirmaciones } from "../servidor/app.js";

let A: Uint8Array;
let D: Uint8Array;
let base: string;
let cerrarApp: () => Promise<void>;
let confirmaciones: Confirmaciones;
let motor: Motor;
let llamadasMotor = 0;
let cierresMotor = 0;
let appCerrada = false;
let publico: string;

beforeAll(async () => {
  A = await amarilla();
  D = await digital();
  motor = await crearMotor({ hilos: 1 });
  const espia: Motor = {
    ...motor,
    leerDocumento: (...a) => {
      llamadasMotor++;
      return motor.leerDocumento(...a);
    },
    // Solo cuenta: el motor real lo cierra afterAll (lo usa también clienteDe).
    cerrar: async () => {
      cierresMotor++;
    },
  };
  // Front sintético en un directorio temporal: la prueba no depende de haber compilado el front con Vite.
  publico = mkdtempSync(join(tmpdir(), "ejemplo-nest-"));
  writeFileSync(join(publico, "index.html"), '<!doctype html><div id="app"></div>');
  const creado = await crearApp({ motor: espia, registro: false, publico });
  confirmaciones = creado.confirmaciones;
  await creado.app.listen(0, "127.0.0.1");
  base = `http://127.0.0.1:${((creado.app.getHttpServer() as Server).address() as AddressInfo).port}`;
  cerrarApp = () => creado.app.close();
}, 180_000);

afterAll(async () => {
  if (!appCerrada) await cerrarApp?.();
  await motor?.cerrar();
  if (publico) rmSync(publico, { recursive: true, force: true });
});

/** Lectura local del front (mismo motor) en la forma que envía @lector-cedula/web: `{ tipo, campos }`. */
async function clienteDe(imagen: Uint8Array): Promise<{ tipo: string; campos: Record<string, unknown> }> {
  const r = await motor.leerDocumento(imagen, { fraude: false });
  if (!r.ok) throw new Error("lectura local fallida");
  return { tipo: r.tipoDocumento, campos: r.campos as Record<string, unknown> };
}

async function eventosDe(r: Response): Promise<Record<string, unknown>[]> {
  const texto = await r.text();
  return r.headers.get("content-type")?.startsWith("application/x-ndjson")
    ? texto.trim().split("\n").map((l) => JSON.parse(l) as Record<string, unknown>)
    : [JSON.parse(texto) as Record<string, unknown>];
}

async function enviar(imagen: Uint8Array, cliente?: unknown): Promise<{ estado: number; eventos: Record<string, unknown>[] }> {
  const fd = new FormData();
  fd.set("imagen", new Blob([imagen], { type: "image/png" }), "foto.png");
  if (cliente !== undefined) fd.set("cliente", JSON.stringify(cliente));
  const r = await fetch(`${base}/api/cedula`, { method: "POST", body: fd });
  return { estado: r.status, eventos: await eventosDe(r) };
}

describe("MOT-13 ejemplo backend Nest", { timeout: 180_000 }, () => {
  it("MOT-13 la plataforma de Nest usa express 5 (no el express 4 de @lector-cedula/servidor)", () => {
    const desdePlataforma = createRequire(createRequire(import.meta.url).resolve("@nestjs/platform-express"));
    const version = (desdePlataforma("express/package.json") as { version: string }).version;
    expect(version).toMatch(/^5\./u);
  });

  it("MOT-13 Nest coincide (multipart con rawBody: true)", async () => {
    const antes = confirmaciones.total;
    const { estado, eventos } = await enviar(A, await clienteDe(A));
    expect(estado).toBe(200);
    expect(eventos[0]).toStrictEqual({ etapa: "recibido" });
    expect(eventos.at(-1)).toMatchObject({ etapa: "resultado", ok: true, documento: { campos: { nuip: NUIP } } });
    expect(confirmaciones.total - antes).toBe(1);
    expect(confirmaciones.ultimoNuip).toBe(NUIP);
  });

  it("MOT-13 Nest con cliente manipulado: no-coincide y alConfirmar no se llama", async () => {
    const antes = confirmaciones.total;
    const cliente = await clienteDe(A);
    const { estado, eventos } = await enviar(A, { ...cliente, campos: { ...cliente.campos, nuip: "9999123457" } });
    expect(estado).toBe(200);
    expect(eventos.at(-1)).toStrictEqual({ etapa: "resultado", ok: false, rechazo: { motivo: "no-coincide", diferencias: ["campos.nuip"] } });
    expect(confirmaciones.total).toBe(antes);
  });

  it("MOT-13 Nest digital con su cliente", async () => {
    const { eventos } = await enviar(D, await clienteDe(D));
    expect(eventos.at(-1)).toMatchObject({ ok: true, documento: { campos: { nuip: NUIP } } });
  });

  it("MOT-13 Nest binario image/png con X-Lector-Cliente y respuesta JSON (?streaming=0)", async () => {
    const cliente = Buffer.from(JSON.stringify(await clienteDe(D)), "utf8").toString("base64url");
    const r = await fetch(`${base}/api/cedula?streaming=0`, { method: "POST", body: D, headers: { "content-type": "image/png", "x-lector-cliente": cliente } });
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toMatch(/^application\/json/u);
    expect(await r.json()).toMatchObject({ etapa: "resultado", ok: true, documento: { campos: { nuip: NUIP } } });
  });

  it("MOT-13 Nest Demasiado grande: 413 y el motor no se invocó", async () => {
    const antes = llamadasMotor;
    const r = await fetch(`${base}/api/cedula`, { method: "POST", body: new Uint8Array(10_485_761), headers: { "content-type": "image/png" } });
    expect(r.status).toBe(413);
    await r.text();
    expect(llamadasMotor).toBe(antes);
  });

  it("MOT-13 Nest cuerpo JSON ya consumido por el parser de Nest (rawBody): 415 sin colgarse y sin motor", async () => {
    const antes = llamadasMotor;
    const r = await fetch(`${base}/api/cedula`, { method: "POST", body: JSON.stringify({ imagen: "x" }), headers: { "content-type": "application/json" } });
    expect(r.status).toBe(415);
    expect(await eventosDe(r)).toStrictEqual([{ etapa: "resultado", ok: false, rechazo: { motivo: "ilegible" } }]);
    expect(llamadasMotor).toBe(antes);
  });

  it("SDK-51 Nest sirve el front del mismo origen y no expone el código del servidor", async () => {
    const pagina = await fetch(`${base}/`);
    expect(pagina.status).toBe(200);
    expect(await pagina.text()).toContain('<div id="app">');
    const servidor = await fetch(`${base}/servidor/app.js`);
    expect(servidor.status).toBe(404);
    await servidor.text();
  });

  it("MOT-13 Nest app.close() termina el pool del motor una vez (OnApplicationShutdown)", async () => {
    expect(cierresMotor).toBe(0);
    appCerrada = true;
    await cerrarApp();
    expect(cierresMotor).toBe(1);
  });

  it("SDK-51 el ejemplo no registra el cuerpo ni los campos (sin console en el servidor) y documenta la Ley 1581", () => {
    for (const archivo of ["../servidor/app.ts", "../servidor/main.ts"]) {
      const fuente = readFileSync(new URL(archivo, import.meta.url), "utf8");
      expect(fuente, archivo).not.toMatch(/console\./u);
    }
    expect(readFileSync(new URL("../servidor/app.ts", import.meta.url), "utf8")).toContain("Ley 1581");
  });
});
