import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { baseRecursos, cargarMotor, ErrorMotor, motorMemorizado, NOMBRE_CACHE, type AlmacenMinimo, type CacheMinima } from "../src/cargador.js";
import { leerManifiesto, verificarRecurso } from "../src/integridad.js";
import { VERSION } from "../src/version.js";

const REC = "https://app-a.example/lector-cedula/";
const sha = (b: Uint8Array): string => createHash("sha256").update(b).digest("hex");

const WASM = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]);
const JS = new TextEncoder().encode("self.onmessage=null;");

function manifiesto(archivos: Record<string, { datos: Uint8Array; tipo: string }>): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({ version: VERSION, recursos: Object.entries(archivos).map(([archivo, a]) => ({ archivo, bytes: a.datos.byteLength, sha256: sha(a.datos), tipo: a.tipo })) }),
  );
}

const ARCHIVOS = { "zxing_reader.wasm": { datos: WASM, tipo: "application/wasm" }, "lector.js": { datos: JS, tipo: "text/javascript" } };

function red(contenido: Record<string, Uint8Array | number>): { fetch: (u: string) => Promise<Response>; pedidas: string[]; offline: boolean } {
  const r = {
    pedidas: [] as string[],
    offline: false,
    fetch: async (u: string): Promise<Response> => {
      r.pedidas.push(u);
      if (r.offline) throw new TypeError("Failed to fetch");
      const v = contenido[u.slice(REC.length)];
      if (v === undefined) return new Response("no", { status: 404 });
      if (typeof v === "number") return new Response("x", { status: v });
      return new Response(v.slice(), { status: 200 });
    },
  };
  return r;
}

function almacen(previas: string[] = []): AlmacenMinimo & { datos: Map<string, Map<string, Response>> } {
  const datos = new Map<string, Map<string, Response>>(previas.map((n) => [n, new Map()]));
  return {
    datos,
    async open(n) {
      if (!datos.has(n)) datos.set(n, new Map());
      const m = datos.get(n) as Map<string, Response>;
      const c: CacheMinima = {
        async match(u) {
          return m.get(u)?.clone();
        },
        async put(u, r) {
          m.set(u, r);
        },
      };
      return c;
    },
    async keys() {
      return [...datos.keys()];
    },
    async delete(n) {
      return datos.delete(n);
    },
  };
}

const crearUrl = (() => {
  let i = 0;
  return () => `blob:https://app-a.example/${++i}`;
})();

describe("SDK-39 Integridad de los recursos", () => {
  it("SDK-39 hash correcto, alterado y ausente (unitaria)", async () => {
    const e = { archivo: "a.wasm", bytes: WASM.byteLength, sha256: sha(WASM), tipo: "application/wasm" };
    expect(await verificarRecurso(e, WASM)).toBe(true);
    const alterado = WASM.slice();
    alterado[3] = 0x6e;
    expect(await verificarRecurso(e, alterado)).toBe(false);
    expect(await verificarRecurso({ ...e, sha256: "" }, WASM)).toBe(false);
    expect(await verificarRecurso({ ...e, sha256: sha(WASM).toUpperCase() }, WASM)).toBe(false);
    expect(await verificarRecurso({ ...e, bytes: 9 }, WASM)).toBe(false);
  });

  it.each([
    [null],
    [{}],
    [{ version: "0.1.0", recursos: [] }],
    [{ version: 1, recursos: [{ archivo: "a", bytes: 1, sha256: "0".repeat(64), tipo: "x" }] }],
    [{ version: "0.1.0", recursos: [{ archivo: "../a", bytes: 1, sha256: "0".repeat(64), tipo: "x" }] }],
    [{ version: "0.1.0", recursos: [{ archivo: ".a", bytes: 1, sha256: "0".repeat(64), tipo: "x" }] }],
    [{ version: "0.1.0", recursos: [{ archivo: "a", bytes: -1, sha256: "0".repeat(64), tipo: "x" }] }],
    [{ version: "0.1.0", recursos: [{ archivo: "a", bytes: 1.5, sha256: "0".repeat(64), tipo: "x" }] }],
    [{ version: "0.1.0", recursos: [{ archivo: "a", bytes: 1, sha256: "0".repeat(63), tipo: "x" }] }],
    [{ version: "0.1.0", recursos: [{ archivo: "a", bytes: 1, sha256: "0".repeat(64) }] }],
    [{ version: "0.1.0", recursos: [null] }],
  ])("SDK-39 manifiesto inválido %j", (m) => {
    expect(leerManifiesto(m)).toBeNull();
  });

  it("SDK-39 Recurso alterado: motor-no-disponible y la caché no contiene esa URL", async () => {
    const alterado = WASM.slice();
    alterado[7] = 9;
    const r = red({ "manifest.json": manifiesto(ARCHIVOS), "zxing_reader.wasm": alterado, "lector.js": JS });
    const a = almacen();
    const p = cargarMotor(REC, { fetch: r.fetch, caches: a, crearUrl });
    await expect(p).rejects.toBeInstanceOf(ErrorMotor);
    await expect(p).rejects.toMatchObject({ codigo: "motor-no-disponible", motivo: "integridad-fallida" });
    expect([...(a.datos.get(NOMBRE_CACHE)?.keys() ?? [])]).toStrictEqual([]);
  });
});

describe("SDK-06 Caché offline del motor (lógica)", () => {
  it("SDK-06 Contenido de la caché y segunda carga sin red", async () => {
    const r = red({ "manifest.json": manifiesto(ARCHIVOS), "zxing_reader.wasm": WASM, "lector.js": JS });
    const a = almacen();
    const m = await cargarMotor(REC, { fetch: r.fetch, caches: a, crearUrl });
    expect(Object.keys(m.urls).sort()).toStrictEqual(["lector.js", "zxing_reader.wasm"]);
    const cache = a.datos.get(NOMBRE_CACHE) as Map<string, Response>;
    expect([...cache.keys()].sort()).toStrictEqual([`${REC}lector.js`, `${REC}manifest.json`, `${REC}zxing_reader.wasm`]);
    for (const [u, resp] of cache) {
      const tipo = resp.headers.get("content-type") ?? "";
      expect(u.startsWith(REC)).toBe(true);
      expect(tipo.startsWith("image/")).toBe(false);
      if (tipo === "application/json") expect(u).toBe(`${REC}manifest.json`);
    }
    r.offline = true;
    r.pedidas.length = 0;
    const m2 = await cargarMotor(REC, { fetch: r.fetch, caches: a, crearUrl });
    expect(Object.keys(m2.urls).sort()).toStrictEqual(["lector.js", "zxing_reader.wasm"]);
    expect(r.pedidas).toStrictEqual([`${REC}manifest.json`]);
  });

  it("SDK-06 Limpieza de versiones previas (sin tocar cachés ajenas)", async () => {
    const r = red({ "manifest.json": manifiesto(ARCHIVOS), "zxing_reader.wasm": WASM, "lector.js": JS });
    const a = almacen(["lector-cedula-sdk-0.0.1", "otra-app"]);
    await cargarMotor(REC, { fetch: r.fetch, caches: a, crearUrl });
    expect([...(await a.keys())].sort()).toStrictEqual([`lector-cedula-sdk-${VERSION}`, "otra-app"].sort());
    expect(NOMBRE_CACHE).toBe("lector-cedula-sdk-0.1.0");
  });

  it("SDK-39 entrada cacheada corrupta se descarta y se vuelve a bajar", async () => {
    const r = red({ "manifest.json": manifiesto(ARCHIVOS), "zxing_reader.wasm": WASM, "lector.js": JS });
    const a = almacen();
    const c = await a.open(NOMBRE_CACHE);
    await c.put(`${REC}zxing_reader.wasm`, new Response(new Uint8Array([1, 2, 3])));
    await cargarMotor(REC, { fetch: r.fetch, caches: a, crearUrl });
    expect(r.pedidas).toContain(`${REC}zxing_reader.wasm`);
    const guardado = new Uint8Array(await ((await c.match(`${REC}zxing_reader.wasm`)) as Response).arrayBuffer());
    expect([...guardado]).toStrictEqual([...WASM]);
  });

  it("SDK-07 Recursos no disponibles: 404 del manifiesto rechaza con motor-no-disponible", async () => {
    const r = red({});
    await expect(cargarMotor(REC, { fetch: r.fetch, crearUrl })).rejects.toMatchObject({ codigo: "motor-no-disponible", motivo: "manifiesto-404" });
    const sinRed = red({});
    sinRed.offline = true;
    await expect(cargarMotor(REC, { fetch: sinRed.fetch, caches: almacen(), crearUrl })).rejects.toMatchObject({ motivo: "sin-red" });
    await expect(cargarMotor(REC, { fetch: red({ "manifest.json": new TextEncoder().encode("{") }).fetch, crearUrl })).rejects.toMatchObject({ motivo: "manifiesto-invalido" });
    await expect(cargarMotor(REC, { fetch: red({ "manifest.json": manifiesto(ARCHIVOS), "lector.js": JS }).fetch, crearUrl })).rejects.toMatchObject({ motivo: "descarga-fallida" });
  });

  it("SDK-07 carga memorizada: una sola descarga por URL base y reintento tras fallo", async () => {
    const r = red({ "manifest.json": manifiesto(ARCHIVOS), "zxing_reader.wasm": WASM, "lector.js": JS });
    const base = "https://app-a.example/memo/";
    const rr = { ...r, fetch: (u: string) => r.fetch(u.replace(base, REC)) };
    const [a, b] = await Promise.all([motorMemorizado(base, { fetch: rr.fetch, crearUrl }), motorMemorizado("https://app-a.example/memo", { fetch: rr.fetch, crearUrl })]);
    expect(a).toBe(b);
    expect(r.pedidas.filter((u) => u.endsWith("manifest.json"))).toHaveLength(1);
    const malo = "https://app-a.example/malo/";
    await expect(motorMemorizado(malo, { fetch: async () => new Response("", { status: 404 }), crearUrl })).rejects.toBeInstanceOf(ErrorMotor);
    await expect(motorMemorizado(malo, { fetch: (u: string) => r.fetch(u.replace(malo, REC)), crearUrl })).resolves.toBeDefined();
  });

  it("SDK-06 baseRecursos añade la barra final", () => {
    expect(baseRecursos("https://a.example/x")).toBe("https://a.example/x/");
    expect(baseRecursos("https://a.example/x/")).toBe("https://a.example/x/");
  });
});
