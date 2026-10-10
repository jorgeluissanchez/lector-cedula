// MOT-13 (Express): el ejemplo monta crearLectorServidor(...).express() en POST /api/cedula con el motor real en proceso
// y se prueba de punta a punta con fetch contra un puerto efímero. Fixtures sintéticos (PERSONA_BASE, NUIP 9999123456).
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { crearMotor, type Motor } from "@lector-cedula/motor";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { amarilla, digital, NUIP } from "../../../packages/motor/test/ayudas/imagenes.js";
// @ts-expect-error módulo JS del ejemplo sin tipos
import { crearApp } from "../servidor.mjs";

interface Montaje {
  confirmaciones: { total: number; ultimoNuip: string | null };
  motor: Motor;
}

let A: Uint8Array;
let D: Uint8Array;
let base: string;
let servidor: Server;
let montaje: Montaje;
let llamadasMotor = 0;

beforeAll(async () => {
  A = await amarilla();
  D = await digital();
  const motor = await crearMotor({ hilos: 1 });
  const espia: Motor = {
    ...motor,
    leerDocumento: (...a) => {
      llamadasMotor++;
      return motor.leerDocumento(...a);
    },
  };
  const creado = crearApp({ motor: espia }) as { app: Parameters<typeof createServer>[1]; confirmaciones: Montaje["confirmaciones"] };
  montaje = { confirmaciones: creado.confirmaciones, motor };
  servidor = createServer(creado.app);
  await new Promise<void>((r) => servidor.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
}, 180_000);

afterAll(async () => {
  servidor.closeAllConnections();
  await new Promise<void>((r) => servidor.close(() => r()));
  await montaje.motor.cerrar();
});

/** Lectura local del front (mismo motor) en la forma que envía @lector-cedula/web: `{ tipo, campos }`. */
async function clienteDe(imagen: Uint8Array): Promise<{ tipo: string; campos: Record<string, unknown> }> {
  const r = await montaje.motor.leerDocumento(imagen, { fraude: false });
  if (!r.ok) throw new Error("lectura local fallida");
  return { tipo: r.tipoDocumento, campos: r.campos as Record<string, unknown> };
}

async function enviar(imagen: Uint8Array, cliente?: unknown): Promise<{ estado: number; eventos: Record<string, unknown>[] }> {
  const fd = new FormData();
  fd.set("imagen", new Blob([imagen], { type: "image/png" }), "foto.png");
  if (cliente !== undefined) fd.set("cliente", JSON.stringify(cliente));
  const r = await fetch(`${base}/api/cedula`, { method: "POST", body: fd });
  const texto = await r.text();
  const eventos = r.headers.get("content-type")?.startsWith("application/x-ndjson") ? texto.trim().split("\n").map((l) => JSON.parse(l) as Record<string, unknown>) : [JSON.parse(texto) as Record<string, unknown>];
  return { estado: r.status, eventos };
}

describe("MOT-13 ejemplo backend Express", { timeout: 180_000 }, () => {
  it("MOT-13 Express coincide", async () => {
    const antes = montaje.confirmaciones.total;
    const { estado, eventos } = await enviar(A, await clienteDe(A));
    expect(estado).toBe(200);
    expect(eventos.at(-1)).toMatchObject({ etapa: "resultado", ok: true, documento: { campos: { nuip: NUIP } } });
    expect(montaje.confirmaciones.total - antes).toBe(1);
    expect(montaje.confirmaciones.ultimoNuip).toBe(NUIP);
  });

  it("MOT-13 cliente manipulado: no-coincide y alConfirmar no se llama", async () => {
    const antes = montaje.confirmaciones.total;
    const cliente = await clienteDe(A);
    const { eventos } = await enviar(A, { ...cliente, campos: { ...cliente.campos, nuip: "9999123457" } });
    expect(eventos.at(-1)).toStrictEqual({ etapa: "resultado", ok: false, rechazo: { motivo: "no-coincide", diferencias: ["campos.nuip"] } });
    expect(montaje.confirmaciones.total).toBe(antes);
  });

  it("MOT-13 digital con su cliente", async () => {
    const { eventos } = await enviar(D, await clienteDe(D));
    expect(eventos.at(-1)).toMatchObject({ ok: true, documento: { campos: { nuip: NUIP } } });
  });

  it("MOT-13 Demasiado grande: 413 y el motor no se invocó", async () => {
    const antes = llamadasMotor;
    const r = await fetch(`${base}/api/cedula`, { method: "POST", body: new Uint8Array(10_485_761), headers: { "content-type": "image/png" } });
    expect(r.status).toBe(413);
    await r.text();
    expect(llamadasMotor).toBe(antes);
  });

  it("SDK-51 el ejemplo no registra el cuerpo ni los campos (sin console en servidor.mjs)", async () => {
    const { readFileSync } = await import("node:fs");
    const fuente = readFileSync(new URL("../servidor.mjs", import.meta.url), "utf8");
    expect(fuente).not.toMatch(/console\./u);
    expect(fuente).toContain("Ley 1581");
  });
});
