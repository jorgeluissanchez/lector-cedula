// Cliente del Worker lector (pwa-lectura-offline, OFF-06, OFF-11, OFF-14): transferencia de una copia de los píxeles,
// cancelación con AbortSignal (mensaje `cancelar` al Worker) y error del Worker como `motor`. Puerto falso en memoria.
import { describe, expect, it } from "vitest";
import { crearClienteLector, type PuertoLector } from "../src/lectura";

interface Enviado {
  mensaje: Record<string, unknown>;
  transferir: Transferable[];
}

function puerto() {
  const enviados: Enviado[] = [];
  const oyentes: Record<string, ((e: unknown) => void)[]> = { message: [], error: [] };
  const p: PuertoLector = {
    postMessage: (mensaje: unknown, transferir: Transferable[] = []) => void enviados.push({ mensaje: mensaje as Record<string, unknown>, transferir }),
    addEventListener: (tipo: "message" | "error", f: (e: never) => void) => void oyentes[tipo]?.push(f as (e: unknown) => void),
    terminate: () => undefined,
  };
  const emitir = (tipo: "message" | "error", e: unknown) => oyentes[tipo]?.forEach((f) => f(e));
  return { p, enviados, emitir };
}

const captura = (valor = 7) => ({ ancho: 2, alto: 1, pixeles: new Uint8ClampedArray(8).fill(valor) });

describe("Cliente del Worker lector", () => {
  it("OFF-06 envía una copia transferida de los píxeles y resuelve con la respuesta de su id", async () => {
    const { p, enviados, emitir } = puerto();
    const c = crearClienteLector(p);
    const cap = captura();
    const promesa = c.leer(cap, "2026-10-06");
    expect(enviados).toHaveLength(1);
    const m = enviados[0]?.mensaje ?? {};
    expect(m).toMatchObject({ tipo: "leer", id: 1, ancho: 2, alto: 1, fechaReferencia: "2026-10-06" });
    expect(m.pixeles).toBeInstanceOf(ArrayBuffer);
    expect([...new Uint8Array(m.pixeles as ArrayBuffer)]).toStrictEqual(Array(8).fill(7));
    expect(enviados[0]?.transferir).toStrictEqual([m.pixeles]);
    emitir("message", { data: { tipo: "resultado", id: 99, resultado: { ok: false, error: "motor" } } });
    emitir("message", { data: { tipo: "resultado", id: 1, resultado: { ok: true, tipo: "pdf417", intento: "original", resultado: {} } } });
    expect(await promesa).toStrictEqual({ ok: true, tipo: "pdf417", intento: "original", resultado: {} });
  });

  it("OFF-14 Cancelar: manda `cancelar` con el id y resuelve cancelada sin esperar al Worker", async () => {
    const { p, enviados, emitir } = puerto();
    const c = crearClienteLector(p);
    const control = new AbortController();
    const promesa = c.leer(captura(), "2026-10-06", control.signal);
    control.abort();
    expect(await promesa).toStrictEqual({ ok: false, error: "cancelada" });
    expect(enviados[1]?.mensaje).toStrictEqual({ tipo: "cancelar", id: 1 });
    emitir("message", { data: { tipo: "resultado", id: 1, resultado: { ok: true } } });
  });

  it("OFF-14 señal ya abortada: no envía nada", async () => {
    const { p, enviados } = puerto();
    expect(await crearClienteLector(p).leer(captura(), "2026-10-06", AbortSignal.abort())).toStrictEqual({ ok: false, error: "cancelada" });
    expect(enviados).toHaveLength(0);
  });

  it("OFF-13 un error del Worker resuelve las lecturas pendientes como motor", async () => {
    const { p, emitir } = puerto();
    const c = crearClienteLector(p);
    const a = c.leer(captura(), "2026-10-06");
    const b = c.leer(captura(), "2026-10-06");
    emitir("error", new Event("error"));
    expect(await a).toStrictEqual({ ok: false, error: "motor" });
    expect(await b).toStrictEqual({ ok: false, error: "motor" });
  });

  it("ignora mensajes que no son respuestas", async () => {
    const { p, emitir } = puerto();
    const c = crearClienteLector(p);
    const a = c.leer(captura(), "2026-10-06");
    for (const data of [null, 1, { tipo: "otro", id: 1 }, { tipo: "resultado" }]) emitir("message", { data });
    emitir("message", { data: { tipo: "resultado", id: 1, resultado: { ok: false, error: "mrz-no-encontrada", tipo: "mrz" } } });
    expect(await a).toStrictEqual({ ok: false, error: "mrz-no-encontrada", tipo: "mrz" });
  });
});
