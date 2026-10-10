// MOT-19 (adaptadores equivalentes) y MOT-21 (cliente cancela) con servidores reales en un puerto efímero: Express,
// Nest (su plataforma por defecto es Express: el controlador recibe @Req()/@Res() y delega en `.nest()`; la app Nest
// completa es la tarea 1.3), Next (route handler: Request/Response) y Fastify (plugin encapsulado).
import express from "express";
import Fastify from "fastify";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { crearLectorServidor, type ManejadorNode } from "../../src/index.js";
import { base64url, CLIENTE, imagenSintetica, motorFalso, multipart, type ConfigMotorFalso } from "./ayudas-lector.js";

const RUTA = "/api/cedula";
const abiertos: (() => Promise<void>)[] = [];
afterEach(async () => {
  while (abiertos.length) await abiertos.pop()?.();
}, 60_000);

function escuchar(servidor: Server): Promise<string> {
  return new Promise((resolver) => {
    servidor.listen(0, "127.0.0.1", () => {
      abiertos.push(() => new Promise<void>((r) => { servidor.closeAllConnections(); servidor.close(() => r()); }));
      resolver(`http://127.0.0.1:${(servidor.address() as AddressInfo).port}`);
    });
  });
}

type Montaje = "express" | "nest" | "fastify";

async function montar(tipo: Montaje, config: ConfigMotorFalso = {}) {
  const motor = motorFalso(config);
  const alConfirmar = vi.fn();
  const lector = crearLectorServidor({ alConfirmar, motor });
  let base: string;
  if (tipo === "fastify") {
    // fetch (undici) reutiliza conexiones: sin forzar el cierre, app.close() espera a que caduquen.
    const app = Fastify({ forceCloseConnections: true });
    await app.register(lector.fastify({ ruta: RUTA }));
    await app.listen({ port: 0, host: "127.0.0.1" });
    abiertos.push(() => app.close());
    base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  } else {
    const app = express();
    // Un JSON global antes del manejador no debe romperlo (solo consume application/json).
    app.use(express.json());
    if (tipo === "express") app.all(RUTA, lector.express() as unknown as express.RequestHandler);
    else {
      const manejador: ManejadorNode = lector.nest();
      // Controlador Nest: @Post("cedula") leer(@Req() req, @Res() res) { return manejador(req, res); }
      const controlador = { leer: (req: unknown, res: unknown) => manejador(req as Parameters<ManejadorNode>[0], res as Parameters<ManejadorNode>[1]) };
      app.all(RUTA, (req, res) => void controlador.leer(req, res));
    }
    base = await escuchar(createServer(app));
  }
  return { base, motor, alConfirmar, lector };
}

async function texto(r: Response | Promise<Response>): Promise<string> {
  return (await r).text();
}

describe("MOT-19 adaptadores equivalentes", { timeout: 60_000 }, () => {
  it.each(["express", "nest", "fastify"] as const)("MOT-19 Adaptadores equivalentes: %s da la misma secuencia que manejar", async (tipo) => {
    const referencia = crearLectorServidor({ alConfirmar: () => undefined, motor: motorFalso({ progresos: [0.5] }) });
    const esperado = await texto(referencia.manejar(new Request(`http://x${RUTA}`, { method: "POST", body: multipart(imagenSintetica(), CLIENTE) })));
    const { base, alConfirmar } = await montar(tipo, { progresos: [0.5] });
    const r = await fetch(`${base}${RUTA}`, { method: "POST", body: multipart(imagenSintetica(), CLIENTE) });
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/x-ndjson; charset=utf-8");
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(await r.text()).toBe(esperado);
    expect(alConfirmar).toHaveBeenCalledTimes(1);
    const bin = await fetch(`${base}${RUTA}`, {
      method: "POST",
      body: imagenSintetica(),
      headers: { "content-type": "image/png", "x-lector-cliente": base64url(JSON.stringify(CLIENTE)) },
    });
    expect(await bin.text()).toBe(esperado);
    const json = await fetch(`${base}${RUTA}?streaming=0`, { method: "POST", body: multipart(imagenSintetica(), CLIENTE) });
    expect(json.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(`${await json.text()}\n`).toBe(esperado.split("\n").at(-2) + "\n");
    const get = await fetch(`${base}${RUTA}`);
    expect(get.status).toBe(405);
    const grande = await fetch(`${base}${RUTA}`, { method: "POST", body: imagenSintetica(10_485_761), headers: { "content-type": "image/png" } });
    expect(grande.status).toBe(413);
  });

  it("MOT-19 Adaptadores equivalentes: next es manejar", async () => {
    const lector = crearLectorServidor({ alConfirmar: () => undefined, motor: motorFalso() });
    const POST = lector.next();
    const a = await texto(POST(new Request(`http://x${RUTA}`, { method: "POST", body: multipart(imagenSintetica(), CLIENTE) })));
    const b = await texto(lector.manejar(new Request(`http://x${RUTA}`, { method: "POST", body: multipart(imagenSintetica(), CLIENTE) })));
    expect(a).toBe(b);
  });

  it.each(["express", "nest", "fastify"] as const)("MOT-20 %s envía cada evento en cuanto ocurre (sin búfer)", async (tipo) => {
    const { base } = await montar(tipo, { demora: 600 });
    const inicio = performance.now();
    const r = await fetch(`${base}${RUTA}`, { method: "POST", body: multipart(imagenSintetica(), CLIENTE) });
    const lector = r.body?.getReader();
    const { value } = (await lector?.read()) ?? {};
    expect(new TextDecoder().decode(value)).toContain('{"etapa":"recibido"}');
    expect(performance.now() - inicio).toBeLessThan(400);
    await lector?.cancel();
  });

  it.each(["express", "nest", "fastify"] as const)("MOT-21 Cliente cancela (%s): se cancela la tarea y no se confirma", async (tipo) => {
    const { base, motor, alConfirmar } = await montar(tipo, { demora: 3_000 });
    const control = new AbortController();
    const r = await fetch(`${base}${RUTA}`, { method: "POST", body: multipart(imagenSintetica(), CLIENTE), signal: control.signal });
    const lector = r.body?.getReader();
    let visto = "";
    while (!visto.includes('"leyendo"')) visto += new TextDecoder().decode((await lector?.read())?.value);
    control.abort();
    await expect.poll(() => motor.senales[0]?.aborted, { timeout: 5_000 }).toBe(true);
    expect(alConfirmar).not.toHaveBeenCalled();
    expect([...(motor.llamadas[0]?.imagen ?? [1])].every((b) => b === 0)).toBe(true);
  });
});
