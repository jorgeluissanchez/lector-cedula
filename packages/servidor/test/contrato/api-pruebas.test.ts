// SDK-19 (contrato del paquete contra la API real): `crearSesion`, errores tipados e idempotencia contra
// `api-pruebas` en Docker (comando `C` de design.md). Datos sintéticos: claves y URL de la spec.
//
//   docker compose -f server/compose.yaml up -d --wait api-pruebas
//   LECTOR_CONTRATO_OBLIGATORIO=1 npx vitest run packages/servidor/test/contrato
//
// Sin la API levantada, la suite se omite salvo con LECTOR_CONTRATO_OBLIGATORIO=1, que la hace fallar.
import express from "express";
import Fastify from "fastify";
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearCliente, ErrorLector, verificarWebhook, type EventoWebhook } from "../../src/index.js";
import { webhookExpress } from "../../src/express.js";
import { webhookFastify } from "../../src/fastify.js";
import { WebhookLectorModule } from "../../src/nest.js";
import { webhookNext } from "../../src/next.js";
import { AUT, KT, SECRETO } from "../ayudas.js";

const SERVIDOR = process.env["LECTOR_API_PRUEBAS"] ?? "http://localhost:8000";
const OBLIGATORIO = process.env["LECTOR_CONTRATO_OBLIGATORIO"] === "1";

async function apiDisponible(): Promise<boolean> {
  try {
    const r = await fetch(`${SERVIDOR}/salud`, { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch {
    return false;
  }
}

const disponible = await apiDisponible();
if (OBLIGATORIO && !disponible) throw new Error(`api-pruebas no responde en ${SERVIDOR}/salud`);

describe.skipIf(!disponible)("SDK-19 contrato contra api-pruebas", { timeout: 60_000 }, () => {
  const cliente = crearCliente({ servidor: SERVIDOR, clave: KT });

  it("SDK-19 Contrato contra el servidor real", async () => {
    const sesion = await cliente.crearSesion({
      autorizacion: AUT,
      tipoDocumento: "co_national-id-2000",
      urlRetorno: "https://app-a.example/volver",
    });
    expect(sesion.id).toMatch(/^val_[0-9a-f]{32}$/);
    expect(sesion.urlAlojada).toMatch(/^https:\/\/api\.lector-cedula\.example\/v\/[A-Za-z0-9_-]{43,}$/);
    expect(sesion.sandbox).toBe(true);
    expect(sesion.expiraEn).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);

    const validacion = await cliente.obtenerResultado(sesion.id);
    expect(validacion["status"]).toBe("pending");
    expect(validacion["return_url"]).toBe("https://app-a.example/volver");
    expect(validacion["hosted_url"]).toBe(sesion.urlAlojada);

    await cliente.suprimir(sesion.id);
    await expect(cliente.obtenerResultado(sesion.id)).rejects.toMatchObject({ estado: 404, tipo: "not-found" });
  });

  it("SDK-19 Error tipado", async () => {
    const error = await cliente
      .crearSesion({ autorizacion: AUT, tipoDocumento: "co_national-id-2000", urlRetorno: "https://app-b.example/fin" })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorLector);
    expect(error).toMatchObject({
      estado: 422,
      tipo: "invalid-request",
      errores: [{ pointer: "/return_url", code: "return_url_not_allowed" }],
    });
    expect(String((error as Error).message)).not.toContain("sk_test_");
  });

  it("SDK-19 Idempotencia", async () => {
    // Clave única por ejecución: la API guarda la respuesta 86 400 s y la suite puede repetirse.
    const claveIdempotencia = `idem-0001-${Date.now()}`;
    const entrada = { autorizacion: AUT, tipoDocumento: "co_national-id-2000", claveIdempotencia };
    const primera = await cliente.crearSesion(entrada);
    const segunda = await cliente.crearSesion(entrada);
    expect(segunda.id).toBe(primera.id);
  });

  it("SDK-16 Petición de servidor sin Origin y clave desconocida", async () => {
    const ajeno = crearCliente({ servidor: SERVIDOR, clave: "sk_test_99999999999999999999999999999999" });
    await expect(ajeno.crearSesion({ autorizacion: AUT, tipoDocumento: "co_national-id-2000" })).rejects.toMatchObject({
      estado: 401,
      tipo: "unauthorized",
    });
  });
});

// SDK-20 (diferencial) y SDK-21 (adaptadores): el sandbox entrega webhooks reales a receptores locales gracias a
// WEBHOOK_DESTINOS_PRUEBA (SDK-40, solo ENTORNO=pruebas). Puertos fijos: los lista server/compose.yaml.
const RUTA_WEBHOOK = "/webhook";
const PUERTOS = { directo: 8091, express: 8092, nest: 8093, next: 8094, fastify: 8095 } as const;
type Receptor = keyof typeof PUERTOS;
const ADAPTADORES = ["express", "nest", "next", "fastify"] as const;
// Sintéticas: el motor sandbox no lee el contenido; la API solo comprueba la firma del formato.
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 0xff, 0xd9]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

describe.skipIf(!disponible)("SDK-20/SDK-21 webhooks reales del sandbox", { timeout: 60_000 }, () => {
  const cliente = crearCliente({ servidor: SERVIDOR, clave: KT });
  const recibidos: Record<Receptor, EventoWebhook[]> = { directo: [], express: [], nest: [], next: [], fastify: [] };
  const crudos: { cuerpo: Uint8Array; firma: string }[] = [];
  const cierres: (() => Promise<unknown>)[] = [];
  const opciones = (r: Receptor) => ({ secreto: SECRETO, alRecibir: async (e: EventoWebhook) => void recibidos[r].push(e) });

  function escuchar(servidor: Server, puerto: number) {
    return new Promise<void>((ok) => {
      servidor.listen(puerto, "0.0.0.0", () => ok());
      cierres.push(() => new Promise((r) => servidor.close(r)));
    });
  }

  beforeAll(async () => {
    // Receptor directo: guarda los bytes exactos y la firma para la verificación diferencial.
    await escuchar(
      createServer(async (req, res) => {
        const trozos: Buffer[] = [];
        for await (const t of req) trozos.push(t as Buffer);
        const cuerpo = new Uint8Array(Buffer.concat(trozos));
        const firma = String(req.headers["x-lector-signature"] ?? "");
        crudos.push({ cuerpo, firma });
        const r = await verificarWebhook({ cuerpo, firma, secreto: SECRETO });
        if (r.valido) recibidos.directo.push(r.evento);
        res.statusCode = r.valido ? 204 : 400;
        res.end();
      }),
      PUERTOS.directo,
    );
    // Express con express.json() global antes del adaptador (escenario "Cuerpo ya parseado por middleware").
    const appExpress = express();
    appExpress.use(express.json());
    appExpress.post(RUTA_WEBHOOK, webhookExpress(opciones("express")));
    await escuchar(createServer(appExpress), PUERTOS.express);
    // Nest: el DynamicModule aplicado como lo hace MiddlewareConsumer sobre la plataforma Express.
    const appNest = express();
    appNest.use(express.json());
    const instancia = new (WebhookLectorModule.registrar({ ruta: RUTA_WEBHOOK, ...opciones("nest") }).module)();
    instancia.configure({
      apply: (...m: express.RequestHandler[]) => ({
        forRoutes: (...rutas: { path: string }[]) => {
          for (const r of rutas) appNest.post(r.path, ...m);
          return undefined as never;
        },
      }),
    } as never);
    await escuchar(createServer(appNest), PUERTOS.nest);
    // Next: route handler POST (Request a Response estándar) servido por node:http.
    const POST = webhookNext(opciones("next"));
    await escuchar(
      createServer(async (req, res) => {
        const trozos: Buffer[] = [];
        for await (const t of req) trozos.push(t as Buffer);
        const cabeceras = new Headers();
        for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") cabeceras.set(k, v);
        const respuesta = await POST(new Request(`http://localhost${req.url}`, { method: "POST", headers: cabeceras, body: Buffer.concat(trozos) }));
        res.statusCode = respuesta.status;
        res.end();
      }),
      PUERTOS.next,
    );
    const appFastify = Fastify();
    await appFastify.register(webhookFastify({ ruta: RUTA_WEBHOOK, ...opciones("fastify") }));
    await appFastify.listen({ port: PUERTOS.fastify, host: "0.0.0.0" });
    cierres.push(() => appFastify.close());
  });

  afterAll(async () => {
    for (const cerrar of cierres) await cerrar();
  });

  async function validacionTerminada(receptor: Receptor): Promise<string> {
    const sesion = await cliente.crearSesion({
      autorizacion: AUT,
      tipoDocumento: "co_national-id-2000",
      urlWebhook: `http://host.docker.internal:${PUERTOS[receptor]}${RUTA_WEBHOOK}`,
    });
    const upload = (await cliente.obtenerResultado(sesion.id))["upload"] as { url: string };
    const destino = new URL(upload.url);
    const formulario = new FormData();
    formulario.append("front", new Blob([JPEG], { type: "image/jpeg" }), "front.jpg");
    formulario.append("back", new Blob([PNG], { type: "image/png" }), "back.png");
    const subida = await fetch(`${SERVIDOR}${destino.pathname}${destino.search}`, { method: "POST", body: formulario });
    expect(subida.status).toBe(200);
    return sesion.id;
  }

  async function esperar(receptor: Receptor, id: string): Promise<EventoWebhook[]> {
    for (let i = 0; i < 100; i++) {
      const propios = recibidos[receptor].filter((e) => e.data.validation_id === id);
      if (propios.length > 0) return propios;
      await new Promise((r) => setTimeout(r, 100));
    }
    return [];
  }

  it("SDK-20 diferencial: el 100 % de los webhooks reales verifican con verificarWebhook", async () => {
    const id = await validacionTerminada("directo");
    const eventos = await esperar("directo", id);
    expect(eventos).toHaveLength(1);
    expect(crudos.length).toBeGreaterThan(0);
    for (const { cuerpo, firma } of crudos) expect((await verificarWebhook({ cuerpo, firma, secreto: SECRETO })).valido).toBe(true);
  });

  for (const adaptador of ADAPTADORES) {
    it(`SDK-21 Webhook válido en ${adaptador}: alRecibir una vez con el id creado`, async () => {
      const id = await validacionTerminada(adaptador);
      const eventos = await esperar(adaptador, id);
      expect(eventos).toHaveLength(1);
      expect(eventos[0]?.data.validation_id).toBe(id);
    });

    it(`SDK-21 Firma inválida en ${adaptador}: 400 y alRecibir no se llama`, async () => {
      const real = crudos[0];
      expect(real).toBeDefined();
      const { cuerpo, firma } = real as { cuerpo: Uint8Array; firma: string };
      const rota = firma.slice(0, -1) + (firma.endsWith("0") ? "1" : "0");
      const antes = recibidos[adaptador].length;
      const r = await fetch(`http://127.0.0.1:${PUERTOS[adaptador]}${RUTA_WEBHOOK}`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-lector-signature": rota },
        body: cuerpo,
      });
      expect(r.status).toBe(400);
      expect(recibidos[adaptador].length).toBe(antes);
    });
  }
});
