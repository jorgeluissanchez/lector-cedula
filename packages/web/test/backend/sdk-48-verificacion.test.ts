// SDK-48, SDK-54, SDK-59 (unidad): cliente del protocolo en vivo (`verificar`) y lector de líneas NDJSON incremental.
import fc from "fast-check";
import { validarEvento } from "@lector-cedula/protocolo";
import { describe, expect, it } from "vitest";
import { crearLectorNdjson, verificar, type DatosVerificacion, type SalidaVerificacion } from "../../src/verificacion.js";
import { crearBack, crearReloj, DOCUMENTO_BASE, drenar, type Guion } from "./back-falso.js";

const IMAGEN = new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" });

function datos(g: Guion | Guion[], extra: Partial<DatosVerificacion> = {}) {
  const back = crearBack(...(Array.isArray(g) ? g : [g]));
  const reloj = crearReloj();
  const etapas: unknown[] = [];
  const d: DatosVerificacion = {
    backend: "/api/cedula",
    imagen: IMAGEN,
    cliente: { tipo: "cedula-ciudadania", campos: DOCUMENTO_BASE.campos },
    streaming: true,
    fetch: back.fetch,
    tiempoLimiteMs: 30_000,
    inactividadMs: 15_000,
    temporizar: reloj.temporizar,
    senal: new AbortController().signal,
    alEvento: (e) => etapas.push(e),
    ...extra,
  };
  return { back, reloj, etapas, d };
}

describe("SDK-48 verificar", () => {
  it("SDK-46/SDK-45 guion ok: eventos en orden, una petición multipart con cabeceras y política de red", async () => {
    const { back, etapas, d } = datos("ok", { encabezados: async () => ({ Authorization: "Bearer prueba-sintetica" }) });
    const r = await verificar(d);
    expect(r).toStrictEqual({ tipo: "ok", documento: DOCUMENTO_BASE });
    expect(etapas).toStrictEqual([{ etapa: "recibido" }, { etapa: "leyendo", progreso: 0.5 }, { etapa: "fraude" }, { etapa: "comparando" }]);
    expect(back.peticiones).toHaveLength(1);
    const p = primera(back);
    expect(p.url).toBe("/api/cedula");
    expect(p.init).toMatchObject({ method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error" });
    const h = new Headers(p.init.headers);
    expect(h.get("authorization")).toBe("Bearer prueba-sintetica");
    expect(h.get("accept")).toBe("application/x-ndjson");
    expect(h.has("content-type")).toBe(false);
    const cuerpo = p.init.body as FormData;
    expect(cuerpo).toBeInstanceOf(FormData);
    expect([...cuerpo.keys()].sort()).toStrictEqual(["cliente", "imagen"]);
    expect(JSON.parse(String(cuerpo.get("cliente")))).toStrictEqual({ tipo: "cedula-ciudadania", campos: DOCUMENTO_BASE.campos });
  });

  it("encabezados como objeto y sin cliente (front ligero)", async () => {
    const { back, d } = datos("ok", { encabezados: { "X-Empresa": "a" }, cliente: undefined });
    await verificar(d);
    const p = primera(back);
    expect(new Headers(p.init.headers).get("x-empresa")).toBe("a");
    expect([...(p.init.body as FormData).keys()]).toStrictEqual(["imagen"]);
  });

  it("encabezados que lanzan: backend-no-disponible sin petición", async () => {
    const { back, d } = datos("ok", {
      encabezados: () => {
        throw new Error("x");
      },
    });
    expect(await verificar(d)).toStrictEqual({ tipo: "fallo", codigo: "backend-no-disponible" });
    expect(back.peticiones).toHaveLength(0);
  });

  it("SDK-48 Líneas partidas entre fragmentos", async () => {
    const final = JSON.stringify({ etapa: "resultado", ok: true, documento: DOCUMENTO_BASE });
    const { etapas, d } = datos({ fragmentos: ['{"etapa":"recibido"}\n{"etapa":"ley', 'endo","progreso":0.5}\n\n', `${final}\n`] });
    expect((await verificar(d)).tipo).toBe("ok");
    expect(etapas).toStrictEqual([{ etapa: "recibido" }, { etapa: "leyendo", progreso: 0.5 }]);
  });

  it("SDK-47 rechazo con diferencias", async () => {
    const { d } = datos("rechazo:no-coincide");
    expect(await verificar(d)).toStrictEqual({ tipo: "rechazo", rechazo: { motivo: "no-coincide", diferencias: ["campos.nuip"] } });
  });

  it("SDK-47 Motivo desconocido es protocolo-invalido", async () => {
    const { d } = datos({ fragmentos: ['{"etapa":"resultado","ok":false,"rechazo":{"motivo":"otro"}}\n'] });
    expect(await verificar(d)).toStrictEqual({ tipo: "fallo", codigo: "protocolo-invalido" });
  });

  it("SDK-48 Backend 503 y fallo de red: backend-no-disponible", async () => {
    expect(await verificar(datos("503").d)).toStrictEqual({ tipo: "fallo", codigo: "backend-no-disponible" });
    expect(await verificar(datos({ red: true }).d)).toStrictEqual({ tipo: "fallo", codigo: "backend-no-disponible" });
    expect(await verificar(datos({ estado: 500 }).d)).toStrictEqual({ tipo: "fallo", codigo: "backend-no-disponible" });
  });

  it("SDK-54 Estado 401 y otros: backend-rechazo-http; 413 es rechazo demasiado-grande", async () => {
    expect(await verificar(datos({ estado: 401 }).d)).toStrictEqual({ tipo: "fallo", codigo: "backend-rechazo-http" });
    expect(await verificar(datos({ estado: 404 }).d)).toStrictEqual({ tipo: "fallo", codigo: "backend-rechazo-http" });
    expect(await verificar(datos({ estado: 202 }).d)).toStrictEqual({ tipo: "fallo", codigo: "backend-rechazo-http" });
    expect(await verificar(datos({ estado: 413 }).d)).toStrictEqual({ tipo: "rechazo", rechazo: { motivo: "demasiado-grande" } });
  });

  it("SDK-48 Backend colgado: inactividad aborta", async () => {
    const { back, reloj, d } = datos("colgado", { inactividadMs: 200 });
    const p = verificar(d);
    await drenar();
    reloj.avanzar(199);
    await drenar(2);
    expect(primera(back).senal.aborted).toBe(false);
    reloj.avanzar(2);
    expect(await p).toStrictEqual({ tipo: "fallo", codigo: "backend-tiempo-agotado" });
    expect(primera(back).senal.aborted).toBe(true);
    expect(reloj.pendientes).toBe(0);
  });

  it("la inactividad se reinicia con cada fragmento", async () => {
    let enviar: (s: string) => void = () => undefined;
    const { reloj, d } = datos("ok", { inactividadMs: 200 });
    const cod = new TextEncoder();
    d.fetch = (async (_u: unknown, init: RequestInit) => {
      const cuerpo = new ReadableStream<Uint8Array>({
        start(c) {
          enviar = (s) => c.enqueue(cod.encode(s));
          init.signal?.addEventListener("abort", () => c.error(new DOMException("a", "AbortError")));
        },
      });
      return new Response(cuerpo, { headers: { "content-type": "application/x-ndjson" } });
    }) as typeof fetch;
    const p = verificar(d);
    await drenar();
    reloj.avanzar(150);
    enviar('{"etapa":"recibido"}\n');
    await drenar();
    reloj.avanzar(150);
    enviar(`${JSON.stringify({ etapa: "resultado", ok: true, documento: DOCUMENTO_BASE })}\n`);
    await drenar();
    reloj.avanzar(1000);
    // Tras el final, el cierre por inactividad no convierte el éxito en fallo.
    expect((await p).tipo).toBe("ok");
  });

  it("SDK-54 Tiempo total agotado", async () => {
    let enviar: (s: string) => void = () => undefined;
    const { reloj, d } = datos("ok", { tiempoLimiteMs: 1000 });
    let senal: AbortSignal | null = null;
    d.fetch = (async (_u: unknown, init: RequestInit) => {
      senal = init.signal ?? null;
      const cuerpo = new ReadableStream<Uint8Array>({
        start(c) {
          enviar = (s) => c.enqueue(new TextEncoder().encode(s));
          init.signal?.addEventListener("abort", () => c.error(new DOMException("a", "AbortError")));
        },
      });
      return new Response(cuerpo, { headers: { "content-type": "application/x-ndjson" } });
    }) as typeof fetch;
    const p = verificar(d);
    await drenar();
    for (let t = 0; t < 10; t++) {
      enviar('{"etapa":"leyendo"}\n');
      await drenar(2);
      reloj.avanzar(100);
    }
    reloj.avanzar(1);
    expect(await p).toStrictEqual({ tipo: "fallo", codigo: "backend-tiempo-agotado" });
    expect(senal?.aborted).toBe(true);
  });

  it("SDK-48 Línea que no es JSON aborta la petición", async () => {
    const { back, d } = datos("basura");
    expect(await verificar(d)).toStrictEqual({ tipo: "fallo", codigo: "protocolo-invalido" });
    expect(primera(back).senal.aborted).toBe(true);
  });

  it("SDK-48 Content-Type incorrecto", async () => {
    expect(await verificar(datos({ tipo: "text/html", fragmentos: ["<html>"] }).d)).toStrictEqual({ tipo: "fallo", codigo: "protocolo-invalido" });
  });

  it("SDK-54 Stream cerrado sin evento final, etapa desconocida y evento tras el final", async () => {
    expect(await verificar(datos({ fragmentos: ['{"etapa":"recibido"}\n'] }).d)).toStrictEqual({ tipo: "fallo", codigo: "protocolo-invalido" });
    expect(await verificar(datos({ fragmentos: ['{"etapa":"otra"}\n'] }).d)).toStrictEqual({ tipo: "fallo", codigo: "protocolo-invalido" });
    const final = `${JSON.stringify({ etapa: "resultado", ok: true, documento: DOCUMENTO_BASE })}\n`;
    expect(await verificar(datos({ fragmentos: [final, '{"etapa":"recibido"}\n'] }).d)).toStrictEqual({ tipo: "fallo", codigo: "protocolo-invalido" });
    // Último evento sin salto de línea final: se acepta al cerrar.
    expect((await verificar(datos({ fragmentos: [final.trimEnd()] }).d)).tipo).toBe("ok");
  });

  it("SDK-48 Cancelar: la señal externa aborta la petición", async () => {
    const externa = new AbortController();
    const { back, d } = datos("colgado", { senal: externa.signal });
    const p = verificar(d);
    await drenar();
    externa.abort();
    expect(await p).toStrictEqual({ tipo: "cancelado" });
    expect(primera(back).senal.aborted).toBe(true);
  });

  it("señal externa ya abortada: sin petición", async () => {
    const externa = new AbortController();
    externa.abort();
    const { back, d } = datos("ok", { senal: externa.signal });
    expect(await verificar(d)).toStrictEqual({ tipo: "cancelado" });
    expect(back.peticiones).toHaveLength(0);
  });

  it("SDK-59 Streaming desactivado", async () => {
    const final = JSON.stringify({ etapa: "resultado", ok: true, documento: DOCUMENTO_BASE });
    const { back, etapas, d } = datos({ tipo: "application/json", fragmentos: [final] }, { streaming: false });
    expect(await verificar(d)).toStrictEqual({ tipo: "ok", documento: DOCUMENTO_BASE });
    expect(new Headers(primera(back).init.headers).get("accept")).toBe("application/json");
    expect(etapas).toStrictEqual([]);
  });

  it("SDK-59 Respuesta incoherente con streaming desactivado", async () => {
    const { d } = datos("ok", { streaming: false });
    expect(await verificar(d)).toStrictEqual({ tipo: "fallo", codigo: "protocolo-invalido" });
    const intermedio = datos({ tipo: "application/json", fragmentos: ['{"etapa":"recibido"}'] }, { streaming: false });
    expect(await verificar(intermedio.d)).toStrictEqual({ tipo: "fallo", codigo: "protocolo-invalido" });
    const basura = datos({ tipo: "application/json", fragmentos: ["{no"] }, { streaming: false });
    expect(await verificar(basura.d)).toStrictEqual({ tipo: "fallo", codigo: "protocolo-invalido" });
  });

  it("SDK-59 streaming desactivado colgado: tiempo agotado", async () => {
    const { reloj, d } = datos({ tipo: "application/json", fragmentos: ["colgar"] }, { streaming: false, inactividadMs: 100 });
    const p = verificar(d);
    await drenar();
    reloj.avanzar(101);
    expect(await p).toStrictEqual({ tipo: "fallo", codigo: "backend-tiempo-agotado" });
  });

  it("documento sin campos es protocolo-invalido", async () => {
    const { d } = datos({ fragmentos: ['{"etapa":"resultado","ok":true,"documento":{"tipo":"x"}}\n'] });
    expect(await verificar(d)).toStrictEqual({ tipo: "fallo", codigo: "protocolo-invalido" });
  });
});

const evento = fc.oneof(
  fc.record({ etapa: fc.constantFrom("recibido", "leyendo", "fraude", "comparando") }),
  fc.record({ etapa: fc.constantFrom("recibido", "leyendo", "fraude", "comparando"), progreso: fc.double({ min: 0, max: 1, noNaN: true }) }),
);
const final = fc.oneof(
  fc.record({ etapa: fc.constant("resultado"), ok: fc.constant(true), documento: fc.record({ tipo: fc.constant("cedula-ciudadania"), campos: fc.record({ apellidos: fc.constantFrom("PRUEBA ÑANDÚ", "MUÑOZ", "€😀") }) }) }),
  fc.record({ etapa: fc.constant("resultado"), ok: fc.constant(false), rechazo: fc.record({ motivo: fc.constantFrom("fraude", "ilegible") }) }),
);

function cortar(bytes: Uint8Array, cortes: number[]): Uint8Array[] {
  const pos = [...new Set(cortes.map((c) => c % (bytes.length + 1)))].sort((a, b) => a - b);
  const partes: Uint8Array[] = [];
  let i = 0;
  for (const p of pos) {
    partes.push(bytes.slice(i, p));
    i = p;
  }
  partes.push(bytes.slice(i));
  return partes;
}

describe("SDK-48 Propiedad del lector de líneas", () => {
  it("eventos válidos cortados en fragmentos arbitrarios (también dentro de la Ñ) se decodifican iguales", () => {
    fc.assert(
      fc.property(fc.array(evento, { maxLength: 8 }), final, fc.array(fc.nat(), { maxLength: 12 }), fc.boolean(), (intermedios, fin, cortes, vacias) => {
        const lista = [...intermedios, fin];
        const texto = lista.map((e) => JSON.stringify(e)).join(vacias ? "\n\n" : "\n") + "\n";
        const l = crearLectorNdjson();
        const vistos: unknown[] = [];
        for (const parte of cortar(new TextEncoder().encode(texto), cortes)) {
          const r = l.empujar(parte);
          expect(r.invalido).toBe(false);
          vistos.push(...r.eventos);
        }
        const cierre = l.terminar();
        expect(cierre.invalido).toBe(false);
        vistos.push(...cierre.eventos);
        expect(vistos).toStrictEqual(JSON.parse(JSON.stringify(lista)));
      }),
      { numRuns: 1000 },
    );
  });

  it("bytes arbitrarios: eventos válidos o protocolo-invalido, nunca lanza", () => {
    fc.assert(
      fc.property(fc.array(fc.uint8Array({ maxLength: 64 }), { maxLength: 6 }), (partes) => {
        const l = crearLectorNdjson();
        let invalido = false;
        for (const p of [...partes]) {
          const r = l.empujar(p);
          for (const e of r.eventos) expect(validarEvento(e)).toBe(true);
          if (r.invalido) {
            invalido = true;
            break;
          }
        }
        if (!invalido) {
          const r = l.terminar();
          for (const e of r.eventos) expect(validarEvento(e)).toBe(true);
          // Sin evento final, cerrar es inválido.
          if (!r.invalido) expect(l.final).not.toBeNull();
        }
      }),
      { numRuns: 1000 },
    );
  });

  it("tras un inválido el lector queda inválido", () => {
    const l = crearLectorNdjson();
    expect(l.empujar(new TextEncoder().encode("{x\n")).invalido).toBe(true);
    expect(l.empujar(new TextEncoder().encode('{"etapa":"recibido"}\n'))).toStrictEqual({ eventos: [], invalido: true });
    expect(l.terminar().invalido).toBe(true);
  });
});

export type { SalidaVerificacion };

function primera(b: { peticiones: readonly { url: string; init: RequestInit; senal: AbortSignal }[] }): { url: string; init: RequestInit; senal: AbortSignal } {
  const p = b.peticiones[0];
  if (p === undefined) throw new Error("sin peticiones");
  return p;
}
