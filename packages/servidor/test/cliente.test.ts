import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ErrorLector, crearCliente } from "../src/index.js";
import { AUT, KT, SRV } from "./ayudas.js";

interface Llamada { url: string; init: RequestInit }

function fetchFalso(respuesta: () => Response | Promise<Response>) {
  const llamadas: Llamada[] = [];
  const fn = (async (url: string | URL | Request, init?: RequestInit) => {
    llamadas.push({ url: String(url), init: init ?? {} });
    return respuesta();
  }) as typeof fetch;
  return { fn, llamadas };
}

const ID = "val_0123456789abcdef0123456789abcdef";
const CREADA = {
  id: ID,
  object: "validation",
  sandbox: true,
  status: "pending",
  hosted_url: `${SRV}/v/${"a".repeat(43)}`,
  return_url: "https://app-a.example/volver",
  upload: { url: `${SRV}/v1/validations/${ID}/images?token=x`, expires_at: "2026-10-06T16:20:00Z" },
  expires_at: null,
};

function json(cuerpo: unknown, estado = 200, tipo = "application/json") {
  return new Response(JSON.stringify(cuerpo), { status: estado, headers: { "content-type": tipo } });
}

function problema(slug: string, estado: number, errors?: unknown) {
  return json({ type: `https://lector-cedula.example/problemas/${slug}`, title: "x", status: estado, ...(errors ? { errors } : {}) }, estado, "application/problem+json");
}

function cabecera(l: Llamada, nombre: string): string | null {
  return new Headers(l.init.headers).get(nombre);
}

describe("SDK-18 paquete sin dependencias", () => {
  it("SDK-18 Sin dependencias", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    expect(pkg.dependencies === undefined || Object.keys(pkg.dependencies).length === 0).toBe(true);
    expect(pkg.name).toBe("@lector-cedula/servidor");
    expect(pkg.license).toBe("MIT");
    expect(pkg.version).toBe("0.1.0");
    expect(Object.keys(pkg.exports).sort()).toEqual([".", "./express", "./fastify", "./nest", "./next"]);
  });

  it("SDK-18 Clave oculta (JSON.stringify, toString y error de red)", async () => {
    const { fn } = fetchFalso(() => Promise.reject(new TypeError(`fallo de red con ${KT}`)));
    const cliente = crearCliente({ servidor: SRV, clave: KT, fetch: fn });
    const serializado = JSON.stringify(cliente);
    expect(serializado).not.toContain("sk_test_");
    expect(String(cliente)).not.toContain("sk_test_");
    let error: unknown;
    try {
      await cliente.crearSesion({ autorizacion: AUT, tipoDocumento: "co_national-id-2000" });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ErrorLector);
    const e = error as ErrorLector;
    expect(e.estado).toBe(0);
    expect(e.tipo).toBe("network-error");
    for (const salida of [String(e), e.message, e.stack ?? "", JSON.stringify(e), JSON.stringify(e.cause ?? null)]) expect(salida).not.toContain("sk_test_");
  });

  it("SDK-18 crearCliente valida servidor y clave sin revelar la clave", () => {
    expect(() => crearCliente({ servidor: "ftp://x", clave: KT })).toThrow(TypeError);
    expect(() => crearCliente({ servidor: "no es url", clave: KT })).toThrow(TypeError);
    expect(() => crearCliente({ servidor: SRV, clave: "" })).toThrow(TypeError);
    try {
      crearCliente({ servidor: "mal", clave: KT });
    } catch (e) {
      expect(String(e)).not.toContain("sk_test_");
    }
    expect(() => crearCliente({ servidor: "http://localhost:8000/", clave: KT })).not.toThrow();
  });
});

describe("SDK-19 crearSesion, obtenerResultado y suprimir (fetch falso)", () => {
  it("SDK-19 crearSesion hace POST /v1/validations con Bearer, Idempotency-Key y cuerpo en snake_case", async () => {
    const { fn, llamadas } = fetchFalso(() => json(CREADA, 201));
    const cliente = crearCliente({ servidor: `${SRV}/`, clave: KT, fetch: fn });
    const sesion = await cliente.crearSesion({
      autorizacion: AUT,
      tipoDocumento: "co_national-id-2000",
      urlRetorno: "https://app-a.example/volver",
      urlWebhook: "https://hooks.example.com/lector",
      claveIdempotencia: "idem-0001",
    });
    expect(sesion).toEqual({ id: ID, urlAlojada: CREADA.hosted_url, expiraEn: "2026-10-06T16:20:00Z", sandbox: true });
    expect(llamadas).toHaveLength(1);
    const l = llamadas[0] as Llamada;
    expect(l.url).toBe(`${SRV}/v1/validations`);
    expect(l.init.method).toBe("POST");
    expect(cabecera(l, "authorization")).toBe(`Bearer ${KT}`);
    expect(cabecera(l, "idempotency-key")).toBe("idem-0001");
    expect(cabecera(l, "content-type")).toBe("application/json");
    expect(JSON.parse(String(l.init.body))).toEqual({
      document_type: "co_national-id-2000",
      autorizacion: AUT,
      return_url: "https://app-a.example/volver",
      webhook_url: "https://hooks.example.com/lector",
    });
  });

  it("SDK-19 sin opcionales no envía return_url ni webhook_url y genera un UUID v4 distinto cada vez", async () => {
    const { fn, llamadas } = fetchFalso(() => json(CREADA, 201));
    const cliente = crearCliente({ servidor: SRV, clave: KT, fetch: fn });
    await cliente.crearSesion({ autorizacion: AUT, tipoDocumento: "co_national-id-2000" });
    await cliente.crearSesion({ autorizacion: AUT, tipoDocumento: "co_national-id-2000" });
    const [a, b] = llamadas.map((l) => cabecera(l, "idempotency-key"));
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a).not.toBe(b);
    expect(JSON.parse(String(llamadas[0]?.init.body))).toEqual({ document_type: "co_national-id-2000", autorizacion: AUT });
  });

  it("SDK-19 Error tipado (RFC 9457 a ErrorLector)", async () => {
    const errores = [{ pointer: "/return_url", code: "return_url_not_allowed" }];
    const { fn } = fetchFalso(() => problema("invalid-request", 422, errores));
    const cliente = crearCliente({ servidor: SRV, clave: KT, fetch: fn });
    const p = cliente.crearSesion({ autorizacion: AUT, tipoDocumento: "co_national-id-2000", urlRetorno: "https://app-b.example/fin" });
    await expect(p).rejects.toBeInstanceOf(ErrorLector);
    await expect(p).rejects.toMatchObject({ estado: 422, tipo: "invalid-request", errores });
    const e = await p.catch((x: unknown) => x as ErrorLector);
    expect(e.name).toBe("ErrorLector");
    expect(e.message).toContain("422");
    expect(e.message).toContain("invalid-request");
  });

  it("SDK-19 error sin problem+json o sin errors da tipo http-error o errores vacíos", async () => {
    const { fn } = fetchFalso(() => new Response("<html>", { status: 502 }));
    const cliente = crearCliente({ servidor: SRV, clave: KT, fetch: fn });
    await expect(cliente.obtenerResultado(ID)).rejects.toMatchObject({ estado: 502, tipo: "http-error", errores: [] });
    const c2 = crearCliente({ servidor: SRV, clave: KT, fetch: fetchFalso(() => problema("not-found", 404)).fn });
    await expect(c2.obtenerResultado(ID)).rejects.toMatchObject({ estado: 404, tipo: "not-found", errores: [] });
    const c3 = crearCliente({ servidor: SRV, clave: KT, fetch: fetchFalso(() => json({ type: 5, errors: "x" }, 400, "application/problem+json")).fn });
    await expect(c3.obtenerResultado(ID)).rejects.toMatchObject({ estado: 400, tipo: "http-error", errores: [] });
  });

  it("SDK-19 respuesta 2xx que no es JSON se convierte en ErrorLector respuesta-invalida", async () => {
    const { fn } = fetchFalso(() => new Response("hola", { status: 201 }));
    const cliente = crearCliente({ servidor: SRV, clave: KT, fetch: fn });
    await expect(cliente.crearSesion({ autorizacion: AUT, tipoDocumento: "co_national-id-2000" })).rejects.toMatchObject({ estado: 201, tipo: "invalid-response" });
  });

  it("SDK-19 obtenerResultado hace GET con Bearer y devuelve la validación", async () => {
    const terminada = { ...CREADA, status: "success" };
    const { fn, llamadas } = fetchFalso(() => json(terminada));
    const cliente = crearCliente({ servidor: SRV, clave: KT, fetch: fn });
    expect(await cliente.obtenerResultado(ID)).toEqual(terminada);
    const l = llamadas[0] as Llamada;
    expect(l.url).toBe(`${SRV}/v1/validations/${ID}`);
    expect(l.init.method).toBe("GET");
    expect(cabecera(l, "authorization")).toBe(`Bearer ${KT}`);
  });

  it("SDK-19 el id se codifica en la ruta", async () => {
    const { fn, llamadas } = fetchFalso(() => json({}));
    const cliente = crearCliente({ servidor: SRV, clave: KT, fetch: fn });
    await cliente.obtenerResultado("../x?y");
    expect(llamadas[0]?.url).toBe(`${SRV}/v1/validations/..%2Fx%3Fy`);
  });

  it("SDK-19 suprimir hace DELETE y resuelve sin valor con 204", async () => {
    const { fn, llamadas } = fetchFalso(() => new Response(null, { status: 204 }));
    const cliente = crearCliente({ servidor: SRV, clave: KT, fetch: fn });
    await expect(cliente.suprimir(ID)).resolves.toBeUndefined();
    expect(llamadas[0]?.init.method).toBe("DELETE");
    expect(llamadas[0]?.url).toBe(`${SRV}/v1/validations/${ID}`);
    const c2 = crearCliente({ servidor: SRV, clave: KT, fetch: fetchFalso(() => problema("not-found", 404)).fn });
    await expect(c2.suprimir(ID)).rejects.toMatchObject({ estado: 404, tipo: "not-found" });
  });

  it("SDK-19 usa el fetch global si no se inyecta", async () => {
    const original = globalThis.fetch;
    const { fn, llamadas } = fetchFalso(() => json({ ok: 1 }));
    globalThis.fetch = fn;
    try {
      const cliente = crearCliente({ servidor: SRV, clave: KT });
      await cliente.obtenerResultado(ID);
      expect(llamadas).toHaveLength(1);
    } finally {
      globalThis.fetch = original;
    }
  });
});
