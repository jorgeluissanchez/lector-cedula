// MOT-12 y MOT-13 (Next): el ejemplo construido con `next build` (webpack) responde en POST /api/cedula con el motor
// real en el route handler (`runtime = "nodejs"`, `.next()`). Si no hay build, la prueba lo construye.
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { crearMotor } from "@lector-cedula/motor";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { amarilla, digital, NUIP } from "../../../packages/motor/test/ayudas/imagenes.js";

const DIR = fileURLToPath(new URL("..", import.meta.url));
const NEXT = fileURLToPath(new URL("../../../node_modules/next/dist/bin/next", import.meta.url));
let proceso: ChildProcess | null = null;
let base = "";

function puertoLibre(): Promise<number> {
  return new Promise((resolver) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const puerto = (s.address() as { port: number }).port;
      s.close(() => resolver(puerto));
    });
  });
}

beforeAll(async () => {
  if (!existsSync(`${DIR}/.next/BUILD_ID`)) {
    const r = spawnSync(process.execPath, ["../copiar-recursos.mjs", "public/lector-cedula"], { cwd: DIR, encoding: "utf8" });
    expect(r.status).toBe(0);
    const b = spawnSync(process.execPath, [NEXT, "build", "--webpack"], { cwd: DIR, encoding: "utf8", timeout: 400_000 });
    expect(b.status, b.stderr).toBe(0);
  }
  const puerto = await puertoLibre();
  base = `http://127.0.0.1:${puerto}`;
  proceso = spawn(process.execPath, [NEXT, "start", "--port", String(puerto), "--hostname", "127.0.0.1"], { cwd: DIR, env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" } });
  // Espera por condición (expect.poll no está disponible en beforeAll): el servidor responde 405 a GET.
  const limite = Date.now() + 60_000;
  let estado = 0;
  while (estado !== 405 && Date.now() < limite) {
    estado = (await fetch(`${base}/api/cedula`).catch(() => null))?.status ?? 0;
    if (estado !== 405) await new Promise((r) => setTimeout(r, 500));
  }
  expect(estado).toBe(405);
}, 600_000);

afterAll(() => {
  proceso?.kill();
});

async function cliente(imagen: Uint8Array) {
  const m = await crearMotor({ hilos: 0 });
  try {
    const r = await m.leerDocumento(imagen, { fraude: false });
    if (!r.ok) throw new Error("lectura local fallida");
    return { tipo: r.tipoDocumento, campos: r.campos };
  } finally {
    await m.cerrar();
  }
}

async function enviar(imagen: Uint8Array, c?: unknown) {
  const fd = new FormData();
  fd.set("imagen", new Blob([imagen], { type: "image/png" }), "foto.png");
  if (c !== undefined) fd.set("cliente", JSON.stringify(c));
  const r = await fetch(`${base}/api/cedula`, { method: "POST", body: fd });
  const texto = await r.text();
  return { estado: r.status, tipo: r.headers.get("content-type"), eventos: texto.trim().split("\n").map((l) => JSON.parse(l) as Record<string, unknown>) };
}

describe("MOT-12 y MOT-13 ejemplo backend Next", { timeout: 300_000 }, () => {
  it("MOT-12 Next route handler: amarilla en multipart da 200 con el NUIP", async () => {
    const A = await amarilla();
    const r = await enviar(A, await cliente(A));
    expect(r.estado).toBe(200);
    expect(r.tipo).toBe("application/x-ndjson; charset=utf-8");
    expect(r.eventos.at(-1)).toMatchObject({ etapa: "resultado", ok: true, documento: { campos: { nuip: NUIP } } });
  });

  it("MOT-13 Next route handler con digital", async () => {
    const D = await digital();
    const r = await enviar(D, await cliente(D));
    expect(r.eventos.at(-1)).toMatchObject({ ok: true, documento: { campos: { nuip: NUIP } } });
  });

  it("MOT-13 Next con cliente manipulado: no-coincide", async () => {
    const A = await amarilla();
    const c = await cliente(A);
    const r = await enviar(A, { ...c, campos: { ...c.campos, nuip: "9999123457" } });
    expect(r.eventos.at(-1)).toStrictEqual({ etapa: "resultado", ok: false, rechazo: { motivo: "no-coincide", diferencias: ["campos.nuip"] } });
  });

  it("MOT-13 Demasiado grande: 413", async () => {
    const r = await fetch(`${base}/api/cedula`, { method: "POST", body: new Uint8Array(10_485_761), headers: { "content-type": "image/png" } });
    expect(r.status).toBe(413);
  });
});
