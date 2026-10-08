// SDK-21: manejarWebhook y adaptadores. Express y Fastify se prueban con servidores reales mínimos en un puerto efímero;
// Next con Request construidas; Nest con su contrato (DynamicModule + MiddlewareConsumer) montado sobre Express,
// que es la plataforma por defecto de Nest. La entrega real desde el sandbox es la tarea 2.5 (comando C).
import express from "express";
import Fastify from "fastify";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { manejarWebhook, type EventoWebhook } from "../src/index.js";
import { webhookExpress } from "../src/express.js";
import { webhookFastify } from "../src/fastify.js";
import { WebhookLectorModule } from "../src/nest.js";
import { webhookNext } from "../src/next.js";
import { CUERPO_AV25, firmarReferencia, SECRETO } from "./ayudas.js";

const RUTA = "/webhooks/lector";

function firmaActual(cuerpo: string | Uint8Array = CUERPO_AV25): string {
  return firmarReferencia(cuerpo, SECRETO, Math.floor(Date.now() / 1000));
}

function firmaRota(): string {
  const f = firmaActual();
  const ultimo = f.at(-1) === "0" ? "1" : "0";
  return f.slice(0, -1) + ultimo;
}

function registro(comportamiento: "resuelve" | "rechaza" = "resuelve") {
  const recibidos: EventoWebhook[] = [];
  const alRecibir = async (evento: EventoWebhook) => {
    recibidos.push(evento);
    if (comportamiento === "rechaza") throw new Error("fallo del integrador");
  };
  return { recibidos, alRecibir };
}

async function enviar(base: string, firma: string | null, cuerpo: string = CUERPO_AV25) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (firma !== null) headers["x-lector-signature"] = firma;
  const r = await fetch(`${base}${RUTA}`, { method: "POST", headers, body: cuerpo });
  return { estado: r.status, texto: await r.text() };
}

type Escenario = "resuelve" | "rechaza";
interface Montaje { base: string; cerrar: () => Promise<void> }
const abiertos: Montaje[] = [];
afterEach(async () => {
  while (abiertos.length) await abiertos.pop()?.cerrar();
});

function escuchar(app: express.Express): Promise<Montaje> {
  return new Promise((resolver) => {
    const servidor: Server = app.listen(0, "127.0.0.1", () => {
      const { port } = servidor.address() as AddressInfo;
      const m = { base: `http://127.0.0.1:${port}`, cerrar: () => new Promise<void>((r) => servidor.close(() => r())) };
      abiertos.push(m);
      resolver(m);
    });
  });
}

type Nombre = "express" | "nest" | "next" | "fastify";
const montajes: Record<Nombre, (opciones: { secreto: string; alRecibir: (e: EventoWebhook) => Promise<void> }, jsonGlobal?: boolean) => Promise<Montaje>> = {
  async express(opciones, jsonGlobal = false) {
    const app = express();
    if (jsonGlobal) app.use(express.json());
    app.post(RUTA, webhookExpress(opciones));
    return escuchar(app);
  },
  async nest(opciones, jsonGlobal = false) {
    // Reproduce lo que hace Nest con un NestModule: llama configure(consumer) y monta el middleware en la ruta.
    const app = express();
    if (jsonGlobal) app.use(express.json());
    const modulo = WebhookLectorModule.registrar({ ruta: RUTA, ...opciones });
    const instancia = new modulo.module();
    instancia.configure({
      apply: (...middlewares: express.RequestHandler[]) => ({
        forRoutes: (...rutas: (string | { path: string; method: number })[]) => {
          for (const r of rutas) app.post(typeof r === "string" ? r : r.path, ...middlewares);
          return undefined as never;
        },
      }),
    } as never);
    return escuchar(app);
  },
  async fastify(opciones) {
    const app = Fastify();
    await app.register(webhookFastify({ ruta: RUTA, ...opciones }));
    // Otra ruta JSON fuera del plugin conserva el parser JSON de Fastify (encapsulación).
    app.post("/otra", async (req) => ({ recibido: req.body }));
    await app.listen({ port: 0, host: "127.0.0.1" });
    const { port } = app.server.address() as AddressInfo;
    const m = { base: `http://127.0.0.1:${port}`, cerrar: () => app.close() };
    abiertos.push(m);
    return m;
  },
  async next(opciones) {
    const POST = webhookNext(opciones);
    // Envuelve el route handler (Request estándar a Response estándar) sin servidor: base ficticia.
    const m: Montaje = { base: "next://", cerrar: async () => undefined };
    fetchNext = (req) => POST(req);
    return m;
  },
};

let fetchNext: ((req: Request) => Promise<Response>) | null = null;
async function enviarA(nombre: string, m: Montaje, firma: string | null, cuerpo: string = CUERPO_AV25) {
  if (nombre !== "next") return enviar(m.base, firma, cuerpo);
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (firma !== null) headers["x-lector-signature"] = firma;
  const r = await (fetchNext as (req: Request) => Promise<Response>)(new Request(`https://app-a.example${RUTA}`, { method: "POST", headers, body: cuerpo }));
  return { estado: r.status, texto: await r.text() };
}

describe("SDK-21 adaptadores de framework", { timeout: 60_000 }, () => {
  for (const nombre of ["express", "nest", "next", "fastify"] as const) {
    it(`SDK-21 Webhook válido en cada adaptador (${nombre})`, async () => {
      const { recibidos, alRecibir } = registro();
      const m = await montajes[nombre]({ secreto: SECRETO, alRecibir });
      const r = await enviarA(nombre, m, firmaActual());
      expect(r).toEqual({ estado: 204, texto: "" });
      expect(recibidos).toHaveLength(1);
      expect(recibidos[0]?.data.validation_id).toBe("val_0123456789abcdef0123456789abcdef");
    });

    it(`SDK-21 Firma inválida (${nombre})`, async () => {
      const { recibidos, alRecibir } = registro();
      const m = await montajes[nombre]({ secreto: SECRETO, alRecibir });
      expect(await enviarA(nombre, m, firmaRota())).toEqual({ estado: 400, texto: "" });
      expect(await enviarA(nombre, m, null)).toEqual({ estado: 400, texto: "" });
      expect(recibidos).toHaveLength(0);
    });

    it(`SDK-21 alRecibir rechaza da 500 sin datos (${nombre})`, async () => {
      const { recibidos, alRecibir } = registro("rechaza" satisfies Escenario);
      const m = await montajes[nombre]({ secreto: SECRETO, alRecibir });
      expect(await enviarA(nombre, m, firmaActual())).toEqual({ estado: 500, texto: "" });
      expect(recibidos).toHaveLength(1);
    });

    it(`SDK-21 verifica los bytes crudos: un cuerpo con espacios firmado tal cual pasa (${nombre})`, async () => {
      const { recibidos, alRecibir } = registro();
      const m = await montajes[nombre]({ secreto: SECRETO, alRecibir });
      const conEspacios = CUERPO_AV25.replace('"sandbox":true', '"sandbox": true');
      expect((await enviarA(nombre, m, firmaActual(conEspacios), conEspacios)).estado).toBe(204);
      expect(recibidos).toHaveLength(1);
    });
  }

  for (const nombre of ["express", "nest"] as const) {
    it(`SDK-21 Cuerpo ya parseado por middleware (${nombre} con express.json() global)`, async () => {
      const { recibidos, alRecibir } = registro();
      const m = await montajes[nombre]({ secreto: SECRETO, alRecibir }, true);
      expect((await enviar(m.base, firmaActual())).estado).toBe(204);
      expect(await enviar(m.base, firmaRota())).toEqual({ estado: 400, texto: "" });
      expect(recibidos).toHaveLength(1);
    });
  }

  it("SDK-21 Nest: registrar devuelve un DynamicModule cuya clase aplica el middleware a POST en la ruta", () => {
    const modulo = WebhookLectorModule.registrar({ ruta: RUTA, secreto: SECRETO, alRecibir: async () => undefined });
    expect(typeof modulo.module).toBe("function");
    const rutas: unknown[] = [];
    let aplicados = 0;
    new modulo.module().configure({
      apply: (...m: unknown[]) => {
        aplicados = m.length;
        return { forRoutes: (...r: unknown[]) => rutas.push(...r) };
      },
    } as never);
    expect(aplicados).toBe(1);
    expect(rutas).toEqual([{ path: RUTA, method: 1 }]);
    // Cada registro crea su propia clase (dos webhooks con secretos distintos no se pisan).
    expect(WebhookLectorModule.registrar({ ruta: "/b", secreto: "s", alRecibir: async () => undefined }).module).not.toBe(modulo.module);
  });

  it("SDK-21 Nest con rawBody: true usa req.rawBody", async () => {
    const { recibidos, alRecibir } = registro();
    const app = express();
    app.use(express.json({ verify: (req, _res, buf) => { (req as unknown as { rawBody: Buffer }).rawBody = Buffer.from(buf); } }));
    const instancia = new (WebhookLectorModule.registrar({ ruta: RUTA, secreto: SECRETO, alRecibir }).module)();
    instancia.configure({ apply: (mw: express.RequestHandler) => ({ forRoutes: () => app.post(RUTA, mw) }) } as never);
    const m = await escuchar(app);
    const conEspacios = CUERPO_AV25.replace('"sandbox":true', '"sandbox":  true');
    expect((await enviar(m.base, firmaActual(conEspacios), conEspacios)).estado).toBe(204);
    expect(recibidos).toHaveLength(1);
  });

  it("SDK-21 Express: cuerpo como Buffer o texto ya leído por otro middleware", async () => {
    const { recibidos, alRecibir } = registro();
    const app = express();
    app.post("/buf", express.raw({ type: "*/*" }), webhookExpress({ secreto: SECRETO, alRecibir }));
    app.post("/txt", express.text({ type: "*/*" }), webhookExpress({ secreto: SECRETO, alRecibir }));
    const m = await escuchar(app);
    for (const ruta of ["/buf", "/txt"]) {
      const r = await fetch(`${m.base}${ruta}`, { method: "POST", headers: { "content-type": "application/json", "x-lector-signature": firmaActual() }, body: CUERPO_AV25 });
      expect(r.status, ruta).toBe(204);
    }
    expect(recibidos).toHaveLength(2);
  });

  it("SDK-21 Fastify mantiene el parser JSON fuera del plugin", async () => {
    const m = await montajes.fastify({ secreto: SECRETO, alRecibir: async () => undefined });
    const r = await fetch(`${m.base}/otra`, { method: "POST", headers: { "content-type": "application/json" }, body: '{"a":1}' });
    expect(await r.json()).toEqual({ recibido: { a: 1 } });
  });

  it("SDK-21 manejarWebhook: Request estándar a Response estándar", async () => {
    const { recibidos, alRecibir } = registro();
    const manejar = manejarWebhook({ secreto: SECRETO, alRecibir });
    const peticion = (firma: string) => new Request(`https://app-a.example${RUTA}`, { method: "POST", headers: { "x-lector-signature": firma }, body: CUERPO_AV25 });
    const ok = await manejar(peticion(firmaActual()));
    expect(ok.status).toBe(204);
    expect(await ok.text()).toBe("");
    expect((await manejar(peticion(firmaRota()))).status).toBe(400);
    expect((await manejar(peticion(firmarReferencia(CUERPO_AV25, SECRETO, 1791300000)))).status).toBe(400);
    expect(recibidos).toHaveLength(1);
  });

  it("SDK-21 manejarWebhook: alRecibir que lanza de forma síncrona da 500", async () => {
    const manejar = manejarWebhook({
      secreto: SECRETO,
      alRecibir: () => {
        throw new Error("x");
      },
    });
    const r = await manejar(new Request(`https://a.example${RUTA}`, { method: "POST", headers: { "x-lector-signature": firmaActual() }, body: CUERPO_AV25 }));
    expect(r.status).toBe(500);
    expect(await r.text()).toBe("");
  });

  it("SDK-21 manejarWebhook: fallo al leer el cuerpo da 400", async () => {
    const manejar = manejarWebhook({ secreto: SECRETO, alRecibir: async () => undefined });
    const rota = { headers: new Headers({ "x-lector-signature": firmaActual() }), arrayBuffer: () => Promise.reject(new Error("stream")) } as unknown as Request;
    expect((await manejar(rota)).status).toBe(400);
  });

  it("SDK-21 los adaptadores viven en subrutas: el índice no importa frameworks", async () => {
    const { readFileSync } = await import("node:fs");
    for (const archivo of ["index", "webhook", "cliente", "manejar", "express", "nest", "next", "fastify", "nodo"]) {
      const fuente = readFileSync(new URL(`../src/${archivo}.ts`, import.meta.url), "utf8");
      expect(fuente, archivo).not.toMatch(/from\s+["'](express|fastify|@nestjs\/[a-z-]+|next(\/[a-z]+)?)["']/);
    }
  });
});
