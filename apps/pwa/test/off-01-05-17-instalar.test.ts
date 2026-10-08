// Service worker puro (pwa-lectura-offline, tarea 4.3): instalación verificada en caché pendiente (OFF-01, OFF-02,
// OFF-17), activación (OFF-05, OFF-17), estado de la precaché (OFF-03) y respuesta a fetch limitada a las rutas del
// manifiesto (OFF-04, OFF-05; hallazgo del revisor de privacidad). Cachés y red simuladas en memoria.
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { activar, estadoPrecache, instalar, rutaPrecacheada, responderFetch, type AlmacenCaches } from "../src/precache/instalar";
import type { ManifiestoPrecache } from "../src/precache/manifiesto";

const b = (s: string) => new TextEncoder().encode(s);
const sha = (s: string) => createHash("sha256").update(b(s)).digest("hex");
const CONTENIDOS: Record<string, string> = { "/": "<html>", "/index.html": "<html>", "/assets/a-1.js": "a", "/assets/mrz-1.traineddata": "modelo" };
const MANIFIESTO: ManifiestoPrecache = { version: "v1", entradas: Object.entries(CONTENIDOS).map(([ruta, c]) => ({ ruta, bytes: b(c).length, sha256: sha(c) })) };

function almacen(inicial: Record<string, Record<string, string>> = {}) {
  const datos = new Map<string, Map<string, Response>>();
  for (const [n, c] of Object.entries(inicial)) datos.set(n, new Map(Object.entries(c).map(([k, v]) => [k, new Response(v)])));
  const a: AlmacenCaches = {
    async open(nombre) {
      let c = datos.get(nombre);
      if (c === undefined) datos.set(nombre, (c = new Map()));
      const cache = c;
      return {
        put: async (ruta, r) => void cache.set(ruta, r),
        match: async (ruta) => cache.get(ruta)?.clone(),
        keys: async () => [...cache.keys()],
      };
    },
    keys: async () => [...datos.keys()],
    delete: async (nombre) => datos.delete(nombre),
  };
  const claves = (n: string) => [...(datos.get(n)?.keys() ?? [])].sort();
  return { a, datos, claves };
}

function red(alterar: (ruta: string, c: string) => string | null = (_r, c) => c) {
  return vi.fn(async (ruta: string, opciones?: RequestInit) => {
    expect(opciones).toStrictEqual({ cache: "no-store" });
    const c = CONTENIDOS[ruta];
    const final = c === undefined ? null : alterar(ruta, c);
    return final === null ? new Response("no", { status: 404 }) : new Response(final, { headers: { "content-type": "text/x-prueba" } });
  });
}

describe("OFF-01/OFF-02/OFF-17 instalar", () => {
  it("OFF-01 precachea todas las rutas verificadas en lector-<version> y borra la pendiente", async () => {
    const { a, datos, claves } = almacen();
    const fetch = red();
    await instalar(MANIFIESTO, { almacen: a, descargar: fetch, registrar: vi.fn() });
    expect([...datos.keys()]).toStrictEqual(["lector-v1"]);
    expect(claves("lector-v1")).toStrictEqual(Object.keys(CONTENIDOS).sort());
    expect(fetch).toHaveBeenCalledTimes(4);
    const r = await (await a.open("lector-v1")).match("/assets/a-1.js");
    expect(await r?.text()).toBe("a");
    expect(r?.headers.get("content-type")).toBe("text/x-prueba");
    expect(r?.status).toBe(200);
  });

  it("OFF-02 Recurso alterado: rechaza, no deja ninguna caché lector-* y registra solo la ruta", async () => {
    const { a, datos } = almacen();
    const registrar = vi.fn();
    const alterada = red((ruta, c) => (ruta === "/assets/a-1.js" ? "b" : c));
    await expect(instalar(MANIFIESTO, { almacen: a, descargar: alterada, registrar })).rejects.toThrow("integridad-fallida");
    expect([...datos.keys()]).toStrictEqual([]);
    expect(registrar).toHaveBeenCalledWith("integridad-fallida", "/assets/a-1.js");
    expect(JSON.stringify(registrar.mock.calls)).not.toContain('"b"');
  });

  it("OFF-01 Activación bloqueada si falta un recurso (404) o la red falla", async () => {
    for (const fetch of [red((ruta, c) => (ruta === "/assets/mrz-1.traineddata" ? null : c)), vi.fn(async () => Promise.reject(new TypeError("red")))]) {
      const { a, datos } = almacen();
      const registrar = vi.fn();
      await expect(instalar(MANIFIESTO, { almacen: a, descargar: fetch, registrar })).rejects.toThrow();
      expect([...datos.keys()]).toStrictEqual([]);
      expect(registrar).toHaveBeenCalledTimes(1);
      expect(registrar.mock.calls[0]?.[0]).toBe("descarga-fallida");
    }
  });

  it("OFF-17 Actualización fallida: la caché de la versión anterior queda intacta", async () => {
    const { a, datos, claves } = almacen({ "lector-v0": { "/": "viejo" } });
    await expect(instalar(MANIFIESTO, { almacen: a, descargar: red((r, c) => (r === "/" ? null : c)), registrar: vi.fn() })).rejects.toThrow();
    expect([...datos.keys()]).toStrictEqual(["lector-v0"]);
    expect(claves("lector-v0")).toStrictEqual(["/"]);
  });
});

describe("OFF-05/OFF-17 activar", () => {
  it("borra todas las cachés salvo lector-<version> (incluidas pendientes y del shell anterior)", async () => {
    const { a, datos } = almacen({ "lector-v0": {}, "lector-v1": {}, "lector-v2-pendiente": {}, "shell-abc": {}, otra: {} });
    await activar(MANIFIESTO, a);
    expect([...datos.keys()]).toStrictEqual(["lector-v1"]);
  });
});

describe("OFF-03 estadoPrecache", () => {
  it("lista solo si todas las rutas están en lector-<version>", async () => {
    const completo = almacen({ "lector-v1": CONTENIDOS });
    expect(await estadoPrecache(MANIFIESTO, completo.a)).toBe("lista");
    const incompleto = almacen({ "lector-v1": { "/": "<html>" } });
    expect(await estadoPrecache(MANIFIESTO, incompleto.a)).toBe("pendiente");
    const otraVersion = almacen({ "lector-v0": CONTENIDOS });
    expect(await estadoPrecache(MANIFIESTO, otraVersion.a)).toBe("pendiente");
    expect([...otraVersion.datos.keys()]).toStrictEqual(["lector-v0"]);
  });
});

describe("OFF-04/OFF-05 respuesta a fetch solo para rutas del manifiesto", () => {
  const ORIGEN = "https://pwa.prueba";
  const rutas = new Set(Object.keys(CONTENIDOS));

  it("rutaPrecacheada: GET del mismo origen con ruta del manifiesto (ignora la query)", () => {
    expect(rutaPrecacheada({ url: `${ORIGEN}/assets/a-1.js`, method: "GET" }, ORIGEN, rutas)).toBe("/assets/a-1.js");
    expect(rutaPrecacheada({ url: `${ORIGEN}/assets/mrz-1.traineddata?/mrz.traineddata`, method: "GET" }, ORIGEN, rutas)).toBe("/assets/mrz-1.traineddata");
    expect(rutaPrecacheada({ url: `${ORIGEN}/`, method: "GET" }, ORIGEN, rutas)).toBe("/");
  });

  it("ninguna petición fuera de la lista pasa por respondWith", () => {
    const fuera = [
      { url: `${ORIGEN}/assets/otro.js`, method: "GET" },
      { url: `${ORIGEN}/sw.js`, method: "GET" },
      { url: `${ORIGEN}/api/leer`, method: "GET" },
      { url: `${ORIGEN}/assets/a-1.js`, method: "POST" },
      { url: `https://cdn.jsdelivr.net/assets/a-1.js`, method: "GET" },
      { url: `https://pwa.prueba.evil/assets/a-1.js`, method: "GET" },
    ];
    for (const p of fuera) {
      const red = vi.fn();
      expect(responderFetch(p, ORIGEN, rutas, almacen({ "lector-v1": CONTENIDOS }).a, "v1", red)).toBeNull();
      expect(red).not.toHaveBeenCalled();
    }
  });

  it("ruta del manifiesto: responde desde lector-<version>; si falta, va a la red solo para esa ruta", async () => {
    const { a } = almacen({ "lector-v1": { "/assets/a-1.js": "a" } });
    const redFn = vi.fn(async (ruta: string) => new Response(`red:${ruta}`));
    const cacheada = responderFetch({ url: `${ORIGEN}/assets/a-1.js`, method: "GET" }, ORIGEN, rutas, a, "v1", redFn);
    expect(await (await cacheada)?.text()).toBe("a");
    expect(redFn).not.toHaveBeenCalled();
    const faltante = responderFetch({ url: `${ORIGEN}/index.html`, method: "GET" }, ORIGEN, rutas, a, "v1", redFn);
    expect(await (await faltante)?.text()).toBe("red:/index.html");
    expect(redFn).toHaveBeenCalledWith("/index.html");
  });
});

describe("OFF-17 reinstalación de la misma versión", () => {
  it("un fallo no borra la caché activa de esa misma versión", async () => {
    const { a, datos, claves } = almacen({ "lector-v1": CONTENIDOS });
    await expect(instalar(MANIFIESTO, { almacen: a, descargar: red((r, c) => (r === "/" ? null : c)), registrar: vi.fn() })).rejects.toThrow();
    expect([...datos.keys()]).toStrictEqual(["lector-v1"]);
    expect(claves("lector-v1")).toStrictEqual(Object.keys(CONTENIDOS).sort());
  });
});
