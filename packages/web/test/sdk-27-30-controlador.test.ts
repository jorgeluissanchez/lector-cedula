import { describe, expect, it } from "vitest";
import { crearLector, type EstadoLector, type FaseLector } from "../src/index.js";
import { AMARILLA, crearFalsos, DIGITAL, esperar, NO_ENCONTRADO, VIDEO } from "./falsos.js";

function registrar(c: ReturnType<typeof crearLector>): EstadoLector[] {
  const vistos: EstadoLector[] = [];
  c.suscribir((e) => vistos.push(e));
  return vistos;
}

/** Fases consecutivas distintas observadas. */
const fases = (v: readonly EstadoLector[]): FaseLector[] => v.map((e) => e.fase).filter((f, i, a) => i === 0 || a[i - 1] !== f);

describe("SDK-27 Núcleo headless crearLector", () => {
  it("SDK-27 Flujo feliz con dependencias falsas", async () => {
    const f = crearFalsos({ scores: [40, 90, 90] });
    const c = crearLector({}, f.deps);
    const vistos = registrar(c);
    await c.iniciar(VIDEO);
    await esperar(c.obtenerEstado, (e) => e.fase === "resultado");
    expect(fases(vistos)).toStrictEqual(["permiso", "activo", "listo", "leyendo", "resultado"]);
    expect(c.obtenerEstado().envio).toBeNull();
    // SDK-09: medida de la lectura con la User Timing API.
    expect(performance.getEntriesByName("lector-cedula:tiempo", "measure").length).toBeGreaterThan(0);
  });

  it("SDK-27 Permiso denegado", async () => {
    const f = crearFalsos({ camara: { name: "NotAllowedError" } });
    const c = crearLector({}, f.deps);
    const vistos = registrar(c);
    await c.iniciar(VIDEO);
    expect(fases(vistos)).toStrictEqual(["permiso", "error"]);
    const error = c.obtenerEstado().error;
    expect(error).toStrictEqual({ codigo: "camara-denegada", mensaje: expect.any(String) });
    expect(error?.mensaje).toBe("Permite el acceso a la cámara para continuar.");
  });

  it.each([
    ["NotFoundError", "camara-no-disponible"],
    ["NotReadableError", "camara-ocupada"],
    ["Raro", "camara-error"],
  ])("SDK-27 cámara %s da %s", async (name, codigo) => {
    const c = crearLector({}, crearFalsos({ camara: { name } }).deps);
    await c.iniciar(VIDEO);
    expect(c.obtenerEstado().error?.codigo).toBe(codigo);
  });

  it("SDK-27 Servidor inválido", async () => {
    const f = crearFalsos();
    const c = crearLector({ servidor: "ftp://x" }, f.deps);
    expect(c.obtenerEstado()).toMatchObject({ fase: "error", error: { codigo: "opcion-invalida", opcion: "servidor" } });
    expect(c.obtenerEstado().error?.mensaje).not.toBe("");
    await c.iniciar(VIDEO);
    c.reintentar();
    expect(f.camarasAbiertas).toBe(0);
    expect(c.obtenerEstado().fase).toBe("error");
  });

  it("SDK-27 idioma en cambia solo el mensaje", async () => {
    const c = crearLector({ idioma: "en" }, crearFalsos({ camara: { name: "NotAllowedError" } }).deps);
    await c.iniciar(VIDEO);
    expect(c.obtenerEstado().error).toStrictEqual({ codigo: "camara-denegada", mensaje: "Allow camera access to continue." });
  });
});

describe("SDK-28 Estado expuesto por el núcleo", () => {
  it("SDK-28 Guía en ambas coordenadas", async () => {
    const c = crearLector({}, crearFalsos({ scores: [40] }).deps);
    await c.iniciar(VIDEO);
    const e = await esperar(c.obtenerEstado, (x) => x.guia !== null);
    expect(e.guia?.normalizada).toStrictEqual({ x: 0.1, y: 0.2, ancho: 0.8, alto: 0.6 });
    expect(e.guia?.video).toStrictEqual({ x: 192, y: 216, ancho: 1536, alto: 648 });
    c.destruir();
  });

  it("SDK-28 Motivo de calidad", async () => {
    const c = crearLector({}, crearFalsos({ scores: [{ score: 30, motivo: "reflejo" }] }).deps);
    await c.iniciar(VIDEO);
    const e = await esperar(c.obtenerEstado, (x) => x.calidad !== null);
    expect(e.calidad).toStrictEqual({ score: 30, motivo: "reflejo" });
    expect(e.fase).toBe("activo");
    c.destruir();
  });

  it("SDK-28 Contenido detectado y resultado de presentación", async () => {
    const c = crearLector({}, crearFalsos({ contenido: "mrz", lecturas: [DIGITAL] }).deps);
    await c.iniciar(VIDEO);
    const e = await esperar(c.obtenerEstado, (x) => x.fase === "resultado");
    expect(e.contenido).toBe("mrz-td1");
    expect(e.resultado?.campos.nuip).toBe("9999123456");
    expect(e.resultado?.confiable).toBe(false);
    expect(e.resultado?.validacion_id).toBeNull();
    expect(Object.isFrozen(e)).toBe(true);
    expect(Object.isFrozen(e.resultado)).toBe(true);
  });

  it("SDK-28 Reintento automático", async () => {
    const f = crearFalsos({ lecturas: [NO_ENCONTRADO, AMARILLA] });
    const c = crearLector({}, f.deps);
    const vistos = registrar(c);
    await c.iniciar(VIDEO);
    const e = await esperar(c.obtenerEstado, (x) => x.fase === "resultado");
    const fs = fases(vistos);
    const i = fs.indexOf("leyendo");
    expect(fs[i + 1]).toBe("activo");
    expect(fs.slice(-2)).toStrictEqual(["leyendo", "resultado"]);
    expect(e.intento).toBe(2);
    expect(f.camarasAbiertas).toBe(2);
  });

  it("SDK-28 tres fallos agotan los reintentos y dan error lectura-fallida", async () => {
    const c = crearLector({}, crearFalsos({ lecturas: [NO_ENCONTRADO] }).deps);
    await c.iniciar(VIDEO);
    const e = await esperar(c.obtenerEstado, (x) => x.fase === "error");
    expect(e.error?.codigo).toBe("lectura-fallida");
    expect(e.intento).toBe(3);
  });

  it("SDK-28 error del motor no se reintenta", async () => {
    const c = crearLector({}, crearFalsos({ lecturas: [{ ok: false, error: "motor" }] }).deps);
    await c.iniciar(VIDEO);
    const e = await esperar(c.obtenerEstado, (x) => x.fase === "error");
    expect(e.error?.codigo).toBe("motor-no-disponible");
    expect(e.intento).toBe(1);
  });

  it("SDK-28 documento fuera de `documentos` da documento-no-admitido", async () => {
    const c = crearLector({ documentos: ["pasaporte"] }, crearFalsos().deps);
    await c.iniciar(VIDEO);
    const e = await esperar(c.obtenerEstado, (x) => x.fase === "error");
    expect(e.error?.codigo).toBe("documento-no-admitido");
  });

  it("SDK-28 Sin notificaciones redundantes", async () => {
    const c = crearLector({}, crearFalsos({ scores: [{ score: 30, motivo: "oscuro" }] }).deps);
    const vistos = registrar(c);
    await c.iniciar(VIDEO);
    await esperar(c.obtenerEstado, (x) => x.calidad !== null);
    // Varios ciclos más con el mismo valor.
    for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
    expect(vistos.filter((e) => e.calidad?.score === 30)).toHaveLength(1);
    for (let i = 1; i < vistos.length; i++) expect(vistos[i]).not.toBe(vistos[i - 1]);
    c.destruir();
  });
});

describe("SDK-30 Ciclo de vida y liberación", () => {
  it("SDK-30 Cancelar libera la cámara", async () => {
    const f = crearFalsos({ scores: [40] });
    const c = crearLector({}, f.deps);
    await c.iniciar(VIDEO);
    await esperar(c.obtenerEstado, (x) => x.calidad !== null);
    expect(c.obtenerEstado().fase).toBe("activo");
    c.cancelar();
    expect(c.obtenerEstado().fase).toBe("inicio");
    expect(f.pistas.every((p) => p.readyState === "ended")).toBe(true);
    expect(f.terminados.calidad).toBe(1);
  });

  it("SDK-30 Destruir durante la lectura", async () => {
    const f = crearFalsos({ lecturas: ["pendiente"] });
    const c = crearLector({}, f.deps);
    const vistos = registrar(c);
    await c.iniciar(VIDEO);
    await esperar(c.obtenerEstado, (x) => x.fase === "leyendo");
    const antes = vistos.length;
    c.destruir();
    f.resolverPendiente(AMARILLA);
    for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
    expect(vistos.length).toBe(antes);
    expect(f.terminados.lector).toBe(1);
    await expect(c.iniciar(VIDEO)).resolves.toBeUndefined();
    expect(() => c.cancelar()).not.toThrow();
    expect(() => c.reintentar()).not.toThrow();
    expect(() => c.destruir()).not.toThrow();
    expect(vistos.length).toBe(antes);
  });

  it("SDK-30 Reintentar tras error", async () => {
    const f = crearFalsos({ camara: { name: "NotAllowedError" } });
    const c = crearLector({}, f.deps);
    await c.iniciar(VIDEO);
    expect(c.obtenerEstado()).toMatchObject({ fase: "error", intento: 1 });
    const vistos = registrar(c);
    c.reintentar();
    expect(vistos[0]?.fase).toBe("permiso");
    expect(vistos[0]?.intento).toBe(2);
    expect(vistos[0]?.error).toBeNull();
  });

  it("SDK-30 cancelar durante el permiso termina en inicio y apaga la cámara", async () => {
    const f = crearFalsos();
    const c = crearLector({}, f.deps);
    const vistos = registrar(c);
    const p = c.iniciar(VIDEO);
    c.cancelar();
    await p;
    expect(c.obtenerEstado().fase).toBe("inicio");
    expect(fases(vistos)).toStrictEqual(["permiso", "inicio"]);
    expect(f.pistas.every((x) => x.readyState === "ended")).toBe(true);
  });

  it("SDK-30 un suscriptor que lanza no afecta y la desuscripción funciona", async () => {
    const c = crearLector({}, crearFalsos({ camara: { name: "NotAllowedError" } }).deps);
    c.suscribir(() => {
      throw new Error("x");
    });
    const vistos: EstadoLector[] = [];
    const quitar = c.suscribir((e) => vistos.push(e));
    quitar();
    await c.iniciar(VIDEO);
    expect(vistos).toHaveLength(0);
    expect(c.obtenerEstado().fase).toBe("error");
  });
});
