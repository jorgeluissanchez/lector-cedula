// MOT-16 Webhooks opcionales: firma HMAC-SHA256 verificable, cuerpo sin datos personales, fallo del webhook sin efecto
// en el resultado y URL insegura rechazada. Servidor local en 127.0.0.1 (única red permitida, solo con `webhook`).
import { createHmac } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearMotor, TOLERANCIA_WEBHOOK_S, verificarFirmaWebhook, type Motor } from "../src/index.js";
import { amarilla, sinDocumento } from "./ayudas/imagenes.js";

interface Recibido {
  readonly cuerpo: string;
  readonly firma: string | undefined;
  readonly firmaVieja: string | undefined;
  readonly tipo: string | undefined;
  readonly metodo: string | undefined;
}

let A: Uint8Array;
let S: Uint8Array;
const abiertos: Motor[] = [];
const servidores: Server[] = [];

beforeAll(async () => {
  A = await amarilla();
  S = await sinDocumento();
}, 120_000);
afterAll(async () => {
  await Promise.all(abiertos.map((m) => m.cerrar()));
  await Promise.all(servidores.map((s) => new Promise((r) => s.close(r))));
});

async function motor(...args: Parameters<typeof crearMotor>): Promise<Motor> {
  const m = await crearMotor(...args);
  abiertos.push(m);
  return m;
}

/** Receptor local: responde `estado` y entrega cada petición recibida en orden. */
async function receptor(estado: number): Promise<{ url: string; siguiente(): Promise<Recibido> }> {
  const cola: Recibido[] = [];
  const esperando: ((r: Recibido) => void)[] = [];
  const servidor = createServer((req: IncomingMessage, res) => {
    const partes: Buffer[] = [];
    req.on("data", (p: Buffer) => partes.push(p));
    req.on("end", () => {
      const r: Recibido = { cuerpo: Buffer.concat(partes).toString("utf8"), firma: req.headers["x-lector-signature"] as string | undefined, firmaVieja: req.headers["x-lector-firma"] as string | undefined, tipo: req.headers["content-type"], metodo: req.method };
      res.statusCode = estado;
      res.end();
      const espera = esperando.shift();
      if (espera) espera(r);
      else cola.push(r);
    });
  });
  servidores.push(servidor);
  await new Promise<void>((r) => servidor.listen(0, "127.0.0.1", r));
  const { port } = servidor.address() as { port: number };
  return {
    url: `http://127.0.0.1:${port}/hook`,
    siguiente: () => {
      const r = cola.shift();
      if (r) return Promise.resolve(r);
      // Cota de la espera por condición: sin webhook la prueba falla en 30 s, no al agotar su tiempo.
      return new Promise((resolver, rechazar) => {
        const t = setTimeout(() => rechazar(new Error("sin-webhook")), 30_000);
        esperando.push((x) => {
          clearTimeout(t);
          resolver(x);
        });
      });
    },
  };
}

async function codigo(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "resuelve";
  } catch (e) {
    return (e as { codigo?: string }).codigo ?? "sin-codigo";
  }
}

const FECHA = { fechaReferencia: "2026-10-09" };

describe("MOT-16 webhooks opcionales", { timeout: 180_000 }, () => {
  it("MOT-16 Firma verificable: X-Lector-Signature t=,v1= (MOT-26) y sin NUIP ni nombres", async () => {
    const r = await receptor(200);
    const m = await motor({ hilos: 0, webhook: { url: r.url, secreto: "secreto-de-prueba" } });
    const resultado = await m.leerDocumento(A, FECHA);
    expect(resultado.ok).toBe(true);
    const recibido = await r.siguiente();
    expect(recibido.metodo).toBe("POST");
    expect(recibido.tipo).toBe("application/json");
    const partes = /^t=([0-9]+),v1=([0-9a-f]{64})$/u.exec(recibido.firma ?? "");
    expect(partes, recibido.firma).not.toBeNull();
    const t = Number(partes?.[1]);
    expect(partes?.[2]).toBe(createHmac("sha256", "secreto-de-prueba").update(`${t}.${recibido.cuerpo}`).digest("hex"));
    expect(Math.abs(Math.floor(Date.now() / 1000) - t)).toBeLessThanOrEqual(TOLERANCIA_WEBHOOK_S);
    expect(verificarFirmaWebhook(recibido.cuerpo, recibido.firma, "secreto-de-prueba")).toBe(true);
    expect(verificarFirmaWebhook(recibido.cuerpo, recibido.firma, "otro-secreto")).toBe(false);
    expect(verificarFirmaWebhook(recibido.cuerpo, recibido.firma, "secreto-de-prueba", t + TOLERANCIA_WEBHOOK_S + 1)).toBe(false);
    expect(recibido.firmaVieja).toBeUndefined();
    expect(recibido.cuerpo).not.toContain("9999123456");
    expect(recibido.cuerpo).not.toContain("PRUEBA");
    const nivel = resultado.ok ? (resultado.riesgo?.nivel ?? null) : null;
    expect(JSON.parse(recibido.cuerpo)).toStrictEqual({ evento: "lectura", tipo: "cedula-ciudadania", riesgo_nivel: nivel });
  });

  it("MOT-16 una lectura sin documento envía el código, sin tipo ni riesgo", async () => {
    const r = await receptor(200);
    const m = await motor({ hilos: 0, webhook: { url: r.url, secreto: "secreto-de-prueba" } });
    const resultado = await m.leerDocumento(S, FECHA);
    expect(resultado.ok).toBe(false);
    const recibido = await r.siguiente();
    expect(JSON.parse(recibido.cuerpo)).toStrictEqual({ evento: "lectura", tipo: null, riesgo_nivel: null, codigo: resultado.ok ? "" : resultado.error.codigo });
  });

  it("MOT-16 una lectura que lanza también avisa con su código", async () => {
    const r = await receptor(200);
    const m = await motor({ hilos: 0, bytesMaximos: 10, webhook: { url: r.url, secreto: "secreto-de-prueba" } });
    expect(await codigo(m.leerDocumento(A, FECHA))).toBe("imagen-demasiado-grande");
    expect(JSON.parse((await r.siguiente()).cuerpo)).toStrictEqual({ evento: "lectura", tipo: null, riesgo_nivel: null, codigo: "imagen-demasiado-grande" });
  });

  it("MOT-16 Webhook caído: leerDocumento resuelve igual que sin webhook", async () => {
    const r = await receptor(500);
    const conWebhook = await motor({ hilos: 0, webhook: { url: r.url, secreto: "secreto-de-prueba" } });
    const sinWebhook = await motor({ hilos: 0 });
    const a = await conWebhook.leerDocumento(A, FECHA);
    await r.siguiente();
    expect(a).toStrictEqual(await sinWebhook.leerDocumento(A, FECHA));
  });

  it("MOT-16 webhook inalcanzable: la lectura resuelve igual", async () => {
    const r = await receptor(200);
    const libre = r.url;
    await new Promise((fin) => (servidores.pop() as Server).close(fin));
    const m = await motor({ hilos: 0, webhook: { url: libre, secreto: "secreto-de-prueba" } });
    const resultado = await m.leerDocumento(A, FECHA);
    expect(resultado.ok).toBe(true);
  });

  it("MOT-16 URL insegura: crearMotor lanza opciones-invalidas", async () => {
    expect(await codigo(crearMotor({ hilos: 0, webhook: { url: "http://ejemplo.test/hook", secreto: "s" } }))).toBe("opciones-invalidas");
  });

  it.each([
    ["no es URL", { url: "no es una url", secreto: "s" }],
    ["ftp", { url: "ftp://ejemplo.test/hook", secreto: "s" }],
    ["secreto vacío", { url: "https://ejemplo.test/hook", secreto: "" }],
    ["sin secreto", { url: "https://ejemplo.test/hook" }],
    ["http a un host que solo empieza por localhost", { url: "http://localhost.ejemplo.test/hook", secreto: "s" }],
  ])("MOT-16 webhook inválido (%s): opciones-invalidas", async (_n, webhook) => {
    expect(await codigo(crearMotor({ hilos: 0, webhook: webhook as { url: string; secreto: string } }))).toBe("opciones-invalidas");
  });

  it.each(["https://ejemplo.test/hook", "http://localhost:9/hook", "http://127.0.0.1:9/hook", "http://[::1]:9/hook"])("MOT-16 URL admitida sin enviar nada al crear: %s", async (url) => {
    const m = await motor({ hilos: 0, webhook: { url, secreto: "s" } });
    expect(m.estadisticas().tareas).toBe(0);
  });
});
