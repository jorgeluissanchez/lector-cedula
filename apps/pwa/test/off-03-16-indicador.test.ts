// OFF-03 (indicador de disponibilidad sin conexión) y OFF-16 (cuota) con un entorno simulado (pwa-lectura-offline,
// tarea 5.1). El registro del service worker solo ocurre si la cuota libre basta.
import { describe, expect, it, vi } from "vitest";
import { iniciarIndicador, PRESUPUESTO_PRECACHE, TEXTOS_OFFLINE, type EntornoIndicador } from "../src/precache/indicador";

function entorno(opciones: { quota?: number; usage?: number; sinSw?: boolean; sinStorage?: boolean; fallaRegistro?: boolean } = {}) {
  const oyentes: ((e: { data: unknown }) => void)[] = [];
  const activo = { postMessage: vi.fn() };
  const sw = {
    register: vi.fn(async () => (opciones.fallaRegistro === true ? Promise.reject(new Error("x")) : {})),
    ready: Promise.resolve({ active: activo }),
    addEventListener: (_t: "message", f: (e: { data: unknown }) => void) => void oyentes.push(f),
  };
  const persist = vi.fn(async () => false);
  const e: EntornoIndicador = {
    serviceWorker: opciones.sinSw === true ? undefined : sw,
    storage: opciones.sinStorage === true ? undefined : { estimate: async () => ({ quota: opciones.quota ?? 1e10, usage: opciones.usage ?? 0 }), persist },
  };
  const emitir = (data: unknown) => oyentes.forEach((f) => f({ data }));
  return { e, sw, activo, persist, emitir };
}

describe("OFF-03 y OFF-16 indicador sin conexión", () => {
  it("OFF-03 textos fijos", () => {
    expect(TEXTOS_OFFLINE).toStrictEqual({ lista: "Lista para usar sin conexión", pendiente: "Sin conexión no disponible todavía" });
    expect(PRESUPUESTO_PRECACHE).toBe(20_971_520);
  });

  it("OFF-03 Primera visita completa: registra, pregunta el estado y pasa a lista solo con la respuesta del SW", async () => {
    const { e, sw, activo, persist, emitir } = entorno();
    const estados: string[] = [];
    await iniciarIndicador(e, (s) => estados.push(s));
    expect(estados).toStrictEqual(["pendiente"]);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(sw.register).toHaveBeenCalledWith("/sw.js", { scope: "/" });
    expect(activo.postMessage).toHaveBeenCalledWith({ tipo: "estado-precache" });
    emitir({ tipo: "otro", estado: "lista" });
    emitir({ tipo: "estado-precache", estado: "raro" });
    expect(estados).toStrictEqual(["pendiente"]);
    emitir({ tipo: "estado-precache", estado: "lista" });
    expect(estados).toStrictEqual(["pendiente", "lista"]);
    emitir({ tipo: "estado-precache", estado: "pendiente" });
    expect(estados).toStrictEqual(["pendiente", "lista", "pendiente"]);
  });

  it("OFF-03 Navegador sin service worker: pendiente y sin errores", async () => {
    const { e } = entorno({ sinSw: true });
    const estados: string[] = [];
    await iniciarIndicador(e, (s) => estados.push(s));
    expect(estados).toStrictEqual(["pendiente"]);
  });

  it("OFF-16 Cuota insuficiente: pendiente y sin registrar el service worker", async () => {
    for (const c of [{ quota: 1_000_000, usage: 0 }, { quota: PRESUPUESTO_PRECACHE + 10, usage: 11 }]) {
      const { e, sw, persist } = entorno(c);
      const estados: string[] = [];
      await iniciarIndicador(e, (s) => estados.push(s));
      expect(estados).toStrictEqual(["pendiente"]);
      expect(sw.register).not.toHaveBeenCalled();
      expect(persist).not.toHaveBeenCalled();
    }
  });

  it("OFF-16 cuota justa o sin API de almacenamiento: registra", async () => {
    for (const op of [{ quota: PRESUPUESTO_PRECACHE + 10, usage: 10 }, { sinStorage: true }]) {
      const { e, sw } = entorno(op);
      await iniciarIndicador(e, () => undefined);
      expect(sw.register).toHaveBeenCalledTimes(1);
    }
  });

  it("un fallo del registro deja pendiente sin lanzar", async () => {
    const { e, activo } = entorno({ fallaRegistro: true });
    const estados: string[] = [];
    await iniciarIndicador(e, (s) => estados.push(s));
    expect(estados).toStrictEqual(["pendiente"]);
    expect(activo.postMessage).not.toHaveBeenCalled();
  });
});
