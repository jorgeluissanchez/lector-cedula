import { describe, expect, it } from "vitest";
import { enviarCaptura } from "../src/envio.js";
import { crearLector, type EstadoLector } from "../src/index.js";
import { AMARILLA, crearFalsos, esperar, VIDEO, type Lectura } from "./falsos.js";

const SRV = "https://api.lector-cedula.example";
const TOKEN = "tok_sintetico_1";
const IMG = new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" });

interface Llamada {
  url: string;
  init: RequestInit | undefined;
}

type Respuesta = Response | "rechazo";

function servidorFalso(inicio: Respuesta, subida: Respuesta = new Response(null, { status: 202 })): { fetch: typeof fetch; llamadas: Llamada[] } {
  const llamadas: Llamada[] = [];
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    llamadas.push({ url: String(url), init });
    const r = llamadas.length === 1 ? inicio : subida;
    if (r === "rechazo") throw new TypeError("Failed to fetch");
    return r;
  }) as typeof fetch;
  return { fetch: f, llamadas };
}

const json = (cuerpo: unknown, status = 200): Response => new Response(JSON.stringify(cuerpo), { status, headers: { "content-type": "application/json" } });
const problema = (status: number, type: string): Response => new Response(JSON.stringify({ type, status }), { status, headers: { "content-type": "application/problem+json" } });
const INICIO_OK = (): Response => json({ validation_id: "val_123", upload: { url: `${SRV}/v1/validations/val_123/images?token=t` } });

describe("SDK-38 Envío opcional al microservicio", () => {
  it("SDK-38 Servidor caído: resultado local conservado y envio fallido servidor-no-disponible", async () => {
    const s = servidorFalso("rechazo");
    const c = crearLector({ servidor: SRV, sesion: TOKEN }, crearFalsos({ fetch: s.fetch }).deps);
    const vistos: EstadoLector[] = [];
    c.suscribir((e) => vistos.push(e));
    await c.iniciar(VIDEO);
    const e = await esperar(c.obtenerEstado, (x) => x.envio?.estado === "fallido");
    expect(e.fase).toBe("resultado");
    expect(e.resultado?.campos.nuip).toBe("9999123456");
    expect(e.resultado?.validacion_id).toBeNull();
    expect(e.envio).toStrictEqual({ estado: "fallido", codigo: "servidor-no-disponible" });
    // El resultado local llega antes que el envío.
    const primero = vistos.find((x) => x.fase === "resultado");
    expect(primero?.envio).toStrictEqual({ estado: "enviando" });
  });

  it("SDK-38 Envío correcto: enviando -> enviado y validacion_id", async () => {
    const s = servidorFalso(INICIO_OK());
    const c = crearLector({ servidor: `${SRV}/`, sesion: TOKEN }, crearFalsos({ fetch: s.fetch }).deps);
    const estados: (string | undefined)[] = [];
    c.suscribir((e) => estados.push(e.envio?.estado));
    await c.iniciar(VIDEO);
    const e = await esperar(c.obtenerEstado, (x) => x.envio?.estado === "enviado");
    expect(estados.filter((x) => x !== undefined)).toStrictEqual(["enviando", "enviado"]);
    expect(e.resultado?.validacion_id).toBe("val_123");
    expect(e.resultado?.confiable).toBe(false);
    expect(s.llamadas[0]?.url).toBe(`${SRV}/v/${TOKEN}/inicio`);
    expect(s.llamadas[0]?.init?.method).toBe("POST");
    expect(s.llamadas[1]?.url).toBe(`${SRV}/v1/validations/val_123/images?token=t`);
    const cuerpo = s.llamadas[1]?.init?.body as FormData;
    // SDK-17: solo imágenes, nunca campos del documento.
    expect([...cuerpo.keys()].sort()).toStrictEqual(["back", "front"]);
    for (const v of cuerpo.values()) expect(v).toBeInstanceOf(Blob);
  });

  it("SDK-38 Sin servidor, envio es null y no hay fetch", async () => {
    const s = servidorFalso(INICIO_OK());
    const c = crearLector({}, crearFalsos({ fetch: s.fetch }).deps);
    await c.iniciar(VIDEO);
    const e = await esperar(c.obtenerEstado, (x) => x.fase === "resultado");
    expect(e.envio).toBeNull();
    expect(s.llamadas).toHaveLength(0);
  });

  it.each([
    ["inicio 401", problema(401, "https://x/problems/unauthorized"), undefined, "sesion-invalida"],
    ["inicio 403", problema(403, "https://x/problems/forbidden"), undefined, "sesion-invalida"],
    ["inicio 404", problema(404, "https://x/problems/not-found"), undefined, "sesion-invalida"],
    ["inicio 410", problema(410, "https://x/problems/gone"), undefined, "sesion-vencida"],
    ["inicio vencido", problema(403, "https://x/problems/upload-token-expired"), undefined, "sesion-vencida"],
    ["inicio 500", problema(500, "https://x/problems/internal"), undefined, "servidor-no-disponible"],
    ["inicio sin json", new Response("x", { status: 200 }), undefined, "servidor-no-disponible"],
    ["inicio sin upload", json({ validation_id: "v" }), undefined, "sesion-invalida"],
    ["subida 403 origen", INICIO_OK(), problema(403, "https://x/problems/origin-not-allowed"), "subida-fallida"],
    ["subida vencida", INICIO_OK(), problema(403, "https://x/problems/upload-token-expired"), "sesion-vencida"],
    ["subida 422 sin cuerpo", INICIO_OK(), new Response(null, { status: 422 }), "subida-fallida"],
    ["subida caída", INICIO_OK(), "rechazo" as const, "servidor-no-disponible"],
  ])("SDK-38 código de fallo: %s", async (_n, inicio, subida, codigo) => {
    const s = servidorFalso(inicio, subida);
    expect(await enviarCaptura({ servidor: SRV, sesion: TOKEN, imagen: IMG, fetch: s.fetch })).toStrictEqual({ estado: "fallido", codigo });
  });

  it("SDK-38 acepta `id` como identificador y no envía credenciales", async () => {
    const s = servidorFalso(json({ id: "val_9", upload: { url: `${SRV}/x` } }));
    expect(await enviarCaptura({ servidor: SRV, sesion: "a b", imagen: IMG, fetch: s.fetch })).toStrictEqual({ estado: "enviado", validacion_id: "val_9" });
    expect(s.llamadas[0]?.url).toBe(`${SRV}/v/a%20b/inicio`);
    for (const l of s.llamadas) expect(l.init?.credentials).toBe("omit");
  });

  it.each([
    ["otro origen", "https://otro.example/subir"],
    ["http del mismo host", "http://api.lector-cedula.example/v1/validations/v/images"],
    ["otro puerto", "https://api.lector-cedula.example:8443/x"],
    ["relativa", "/v1/validations/v/images"],
    ["javascript", "javascript:alert(1)"],
  ])("SDK-42 upload.url de otro origen (%s): no sube y sesion-invalida", async (_n, url) => {
    const s = servidorFalso(json({ validation_id: "v", upload: { url } }));
    expect(await enviarCaptura({ servidor: SRV, sesion: TOKEN, imagen: IMG, fetch: s.fetch })).toStrictEqual({ estado: "fallido", codigo: "sesion-invalida" });
    expect(s.llamadas).toHaveLength(1);
  });

  it.each([
    ["servidor http no local", "http://api.example", "http://api.example/x"],
    ["servidor no es URL", "no-es-url", "https://api.example/x"],
    ["upload numérico", SRV, 5 as unknown as string],
  ])("SDK-42 destino inseguro o inválido (%s): sesion-invalida", async (_n, servidor, url) => {
    const s = servidorFalso(json({ validation_id: "v", upload: { url } }));
    expect(await enviarCaptura({ servidor, sesion: TOKEN, imagen: IMG, fetch: s.fetch })).toStrictEqual({ estado: "fallido", codigo: "sesion-invalida" });
    expect(s.llamadas).toHaveLength(1);
  });

  it("SDK-42 http://127.0.0.1 con el mismo origen se acepta", async () => {
    const s = servidorFalso(json({ validation_id: "v", upload: { url: "http://127.0.0.1:8000/v1/x" } }));
    expect(await enviarCaptura({ servidor: "http://127.0.0.1:8000", sesion: TOKEN, imagen: IMG, fetch: s.fetch })).toStrictEqual({ estado: "enviado", validacion_id: "v" });
    expect(s.llamadas[1]?.url).toBe("http://127.0.0.1:8000/v1/x");
  });

  it("SDK-42 upload.url en http://localhost se acepta si el servidor es el mismo localhost", async () => {
    const s = servidorFalso(json({ validation_id: "v", upload: { url: "http://localhost:8000/v1/x" } }));
    expect(await enviarCaptura({ servidor: "http://localhost:8000", sesion: TOKEN, imagen: IMG, fetch: s.fetch })).toStrictEqual({ estado: "enviado", validacion_id: "v" });
  });

  it.each([
    ["tarjeta de identidad", { ...AMARILLA, tipoDocumento: "tarjeta-identidad" } as Lectura],
    ["menor de edad", { ...AMARILLA, menorDeEdad: true } as Lectura],
  ])("SDK-43 Menor de edad sin envío (%s): resultado local, sin red, menor-no-enviado", async (_n, lectura) => {
    const s = servidorFalso(INICIO_OK());
    const c = crearLector({ servidor: SRV, sesion: TOKEN, admitirTi: true }, crearFalsos({ fetch: s.fetch, lecturas: [lectura] }).deps);
    await c.iniciar(VIDEO);
    const e = await esperar(c.obtenerEstado, (x) => x.envio?.estado === "fallido");
    expect(e.fase).toBe("resultado");
    expect(e.resultado?.campos.nuip).toBe("9999123456");
    expect(e.envio).toStrictEqual({ estado: "fallido", codigo: "menor-no-enviado" });
    expect(s.llamadas).toHaveLength(0);
  });

  it("SDK-43 con enviarMenores: true el envío de la tarjeta de identidad ocurre", async () => {
    const s = servidorFalso(INICIO_OK());
    const ti = { ...AMARILLA, tipoDocumento: "tarjeta-identidad", menorDeEdad: true } as Lectura;
    const c = crearLector({ servidor: SRV, sesion: TOKEN, admitirTi: true, enviarMenores: true }, crearFalsos({ fetch: s.fetch, lecturas: [ti] }).deps);
    await c.iniciar(VIDEO);
    const e = await esperar(c.obtenerEstado, (x) => x.envio?.estado === "enviado");
    expect(e.resultado?.validacion_id).toBe("val_123");
    expect(s.llamadas).toHaveLength(2);
  });

  it("SDK-43 enviarMenores no booleano es opción inválida", () => {
    expect(crearLector({ servidor: SRV, sesion: TOKEN, enviarMenores: "si" as never }, crearFalsos().deps).obtenerEstado().error?.opcion).toBe("enviarMenores");
  });
});
