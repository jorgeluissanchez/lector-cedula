import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ESTADO_INICIAL, iguales, normalizarGuia } from "../src/estado.js";
import { permitida, transicion, TRANSICIONES, type EventoLector } from "../src/maquina.js";
import { crearLector, type EstadoLector, type FaseLector } from "../src/index.js";
import { opcionInvalida } from "../src/opciones.js";
import { AMARILLA, crearFalsos, NO_ENCONTRADO, VIDEO } from "./falsos.js";

const LISTA_SPEC = [
  "inicio>permiso", "permiso>activo", "permiso>error", "activo>listo", "listo>activo", "listo>leyendo", "activo>leyendo",
  "leyendo>resultado", "leyendo>activo", "leyendo>error", "activo>error", "listo>error", "permiso>inicio", "activo>inicio", "listo>inicio", "leyendo>inicio",
  "resultado>permiso", "error>permiso",
];

const FASES: FaseLector[] = ["inicio", "permiso", "activo", "listo", "leyendo", "resultado", "error"];

const frame = fc.record({
  score: fc.integer({ min: -10, max: 120 }),
  motivo: fc.constantFrom(null, "oscuro", "sobreexpuesto", "reflejo", "desenfocado", "acerca" as const),
  guia: fc.record({ x: fc.nat(2000), y: fc.nat(2000), ancho: fc.nat(2000), alto: fc.nat(2000) }),
  anchoVideo: fc.integer({ min: 0, max: 4000 }),
  altoVideo: fc.integer({ min: 0, max: 4000 }),
  contenido: fc.constantFrom("pdf417" as const, "mrz" as const, null),
});

const evento: fc.Arbitrary<EventoLector> = fc.oneof(
  fc.constant({ tipo: "iniciar" } as const),
  fc.constant({ tipo: "camara-lista" } as const),
  fc.constant({ tipo: "fallo", error: { codigo: "lectura-fallida", mensaje: "x" } } as const),
  fc.record({ tipo: fc.constant("calidad" as const), frame, apto: fc.boolean() }),
  fc.constant({ tipo: "leyendo", contenido: null } as const),
  fc.record({ tipo: fc.constant("progreso" as const), valor: fc.double({ min: -1, max: 2, noNaN: true }) }),
  fc.constant({ tipo: "resultado", resultado: { tipo: "cedula-ciudadania", campos: AMARILLA.ok ? AMARILLA.campos : (null as never), warnings: [], confiable: false, validacion_id: null }, contenido: "pdf417", envio: null } as const),
  fc.constant({ tipo: "reintento-automatico" } as const),
  fc.constant({ tipo: "cancelar" } as const),
  fc.constant({ tipo: "reintentar" } as const),
  fc.constant({ tipo: "envio", envio: { estado: "enviado", validacion_id: "val_1" } } as const),
);

describe("SDK-27 máquina de estados pura", () => {
  it("SDK-27 TRANSICIONES es exactamente la lista de la spec", () => {
    expect([...TRANSICIONES].sort()).toStrictEqual([...LISTA_SPEC].sort());
    for (const a of FASES) for (const b of FASES) expect(permitida(a, b)).toBe(a === b || LISTA_SPEC.includes(`${a}>${b}`));
  });

  it("SDK-27 Transiciones inválidas (propiedad de la máquina): solo pares permitidos, estado congelado, nunca lanza", () => {
    let utiles = 0;
    fc.assert(
      fc.property(fc.array(evento, { maxLength: 50 }), (resto) => {
        const eventos: EventoLector[] = [{ tipo: "iniciar" }, { tipo: "camara-lista" }, ...resto];
        let e = ESTADO_INICIAL;
        let cambios = 0;
        for (const ev of eventos) {
          const s = transicion(e, ev);
          expect(permitida(e.fase, s.fase)).toBe(true);
          expect(Object.isFrozen(s)).toBe(true);
          expect(s.intento).toBeGreaterThanOrEqual(1);
          if (s.progreso !== null) expect(s.progreso >= 0 && s.progreso <= 1).toBe(true);
          if (s.calidad !== null) expect(s.calidad.score >= 0 && s.calidad.score <= 100).toBe(true);
          if (s.resultado !== null) expect(s.resultado.confiable).toBe(false);
          if (s !== e) expect(iguales(s, e)).toBe(false);
          if (s.fase !== e.fase) cambios++;
          e = s;
        }
        if (cambios > 2) utiles++;
      }),
      { numRuns: 1000 },
    );
    // Proporción útil: más de la mitad de las secuencias pasan de activo.
    expect(utiles).toBeGreaterThan(500);
  });

  it("SDK-28 Propiedad: guía normalizada en [0,1] e igual a guía/dimensiones del vídeo", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 4000 }), fc.integer({ min: 1, max: 4000 }), fc.double({ min: 0, max: 1, noNaN: true }), fc.double({ min: 0, max: 1, noNaN: true }), (w, h, fx, fy) => {
        const g = { x: Math.floor(w * fx * 0.5), y: Math.floor(h * fy * 0.5), ancho: Math.floor(w * 0.5), alto: Math.floor(h * 0.5) };
        const n = normalizarGuia(g, w, h);
        expect(n?.video).toStrictEqual(g);
        const r = n?.normalizada;
        expect(r).toStrictEqual({ x: g.x / w, y: g.y / h, ancho: g.ancho / w, alto: g.alto / h });
        for (const v of Object.values(r ?? {})) expect(v >= 0 && v <= 1).toBe(true);
      }),
      { numRuns: 1000 },
    );
    expect(normalizarGuia({ x: 0, y: 0, ancho: 1, alto: 1 }, 0, 10)).toBeNull();
    expect(normalizarGuia({ x: 50, y: -5, ancho: 30, alto: 1 }, 10, 10)?.normalizada).toStrictEqual({ x: 1, y: 0, ancho: 1, alto: 0.1 });
  });

  it("SDK-28 cambios en el estado (tabla)", () => {
    const permiso = transicion(ESTADO_INICIAL, { tipo: "iniciar" });
    expect(permiso).toMatchObject({ fase: "permiso", intento: 1 });
    const activo = transicion(permiso, { tipo: "camara-lista" });
    const f = { score: 75, motivo: null, guia: { x: 1, y: 1, ancho: 2, alto: 2 }, anchoVideo: 4, altoVideo: 4, contenido: "mrz" as const };
    const listo = transicion(activo, { tipo: "calidad", frame: f, apto: true });
    expect(listo).toMatchObject({ fase: "listo", contenido: "mrz-td1", calidad: { score: 75, motivo: null } });
    expect(transicion(listo, { tipo: "calidad", frame: { ...f, contenido: null }, apto: false })).toMatchObject({ fase: "activo", contenido: "mrz-td1" });
    const leyendo = transicion(listo, { tipo: "leyendo", contenido: "pdf417" });
    expect(leyendo).toMatchObject({ fase: "leyendo", progreso: 0, contenido: "pdf417" });
    expect(transicion(leyendo, { tipo: "progreso", valor: 0.4 }).progreso).toBe(0.4);
    expect(transicion(transicion(leyendo, { tipo: "progreso", valor: 0.4 }), { tipo: "progreso", valor: 0.2 }).progreso).toBe(0.4);
    const reint = transicion(leyendo, { tipo: "reintento-automatico" });
    expect(reint).toMatchObject({ fase: "activo", intento: 2, calidad: null, guia: null, contenido: null, progreso: null });
    const cancel = transicion(reint, { tipo: "cancelar" });
    expect(cancel).toMatchObject({ fase: "inicio", intento: 1, error: null });
    const err = transicion(leyendo, { tipo: "fallo", error: { codigo: "lectura-fallida", mensaje: "m" } });
    expect(err).toMatchObject({ fase: "error", progreso: null, error: { codigo: "lectura-fallida" } });
    expect(transicion(err, { tipo: "reintentar" })).toMatchObject({ fase: "permiso", intento: 2, error: null });
    expect(transicion(activo, { tipo: "fallo", error: { codigo: "calidad-error", mensaje: "m" } })).toMatchObject({ fase: "error", error: { codigo: "calidad-error" } });
    expect(transicion(permiso, { tipo: "cancelar" })).toMatchObject({ fase: "inicio", intento: 1, error: null });
    expect(transicion(ESTADO_INICIAL, { tipo: "fallo", error: { codigo: "calidad-error", mensaje: "m" } })).toBe(ESTADO_INICIAL);
    const res = transicion(leyendo, { tipo: "resultado", resultado: { tipo: "cedula-ciudadania", campos: {} as never, warnings: [], confiable: false, validacion_id: null }, contenido: null, envio: { estado: "enviando" } });
    expect(res).toMatchObject({ fase: "resultado", progreso: 1, contenido: "pdf417", envio: { estado: "enviando" } });
    const enviado = transicion(res, { tipo: "envio", envio: { estado: "enviado", validacion_id: "val_9" } });
    expect(enviado.resultado?.validacion_id).toBe("val_9");
    const fallido = transicion(res, { tipo: "envio", envio: { estado: "fallido", codigo: "subida-fallida" } });
    expect(fallido.resultado?.validacion_id).toBeNull();
    expect(fallido.envio).toStrictEqual({ estado: "fallido", codigo: "subida-fallida" });
    expect(transicion(activo, { tipo: "envio", envio: { estado: "enviando" } })).toBe(activo);
  });

  it("SDK-28 iguales compara estructura", () => {
    expect(iguales({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
    expect(iguales({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    expect(iguales({ a: 1 }, { b: 1 })).toBe(false);
    expect(iguales([1], { 0: 1 })).toBe(false);
    expect(iguales(null, {})).toBe(false);
    expect(iguales(1, 2)).toBe(false);
  });
});

describe("SDK-27 opciones", () => {
  it.each([
    [{}, null],
    [{ servidor: "ftp://x" }, "servidor"],
    [{ servidor: "http://ejemplo.com" }, "servidor"],
    [{ servidor: "no es url" }, "servidor"],
    [{ servidor: "http://localhost:8000" }, null],
    [{ servidor: "http://127.0.0.1:8000" }, null],
    [{ servidor: "https://api.lector-cedula.example" }, null],
    [{ sesion: "tok" }, "servidor"],
    [{ servidor: "https://a.example", sesion: "tok_1-A" }, null],
    [{ servidor: "https://a.example", sesion: "a/b" }, "sesion"],
    [{ servidor: "https://a.example", sesion: 3 }, "sesion"],
    [{ recursos: 3 }, "recursos"],
    [{ recursos: "/lector-cedula/" }, null],
    [{ recursos: "http://[" }, "recursos"],
    [{ documentos: [] }, "documentos"],
    [{ documentos: ["pasaporte", "x"] }, "documentos"],
    [{ documentos: ["pasaporte", "cedula-ciudadania", "cedula-extranjeria", "tarjeta-identidad"] }, null],
    [{ admitirTi: "si" }, "admitirTi"],
    [{ admitirTi: true }, null],
    [{ idioma: "fr" }, "idioma"],
    [{ idioma: "en" }, null],
    [null, "opciones"],
  ])("SDK-27 opcionInvalida(%j) = %s", (o, esperado) => {
    expect(opcionInvalida(o)).toBe(esperado);
  });

  it("SDK-38 Sesión sin servidor", () => {
    const c = crearLector({ sesion: "tok" }, crearFalsos().deps);
    expect(c.obtenerEstado()).toMatchObject({ fase: "error", error: { codigo: "opcion-invalida", opcion: "servidor" } });
  });

  it("SDK-27 opciones arbitrarias nunca lanzan", () => {
    fc.assert(fc.property(fc.anything(), (o) => {
      expect(() => crearLector(o as never, crearFalsos().deps)).not.toThrow();
    }), { numRuns: 1000 });
  });
});

describe("SDK-27 propiedad del controlador", { timeout: 60_000 }, () => {
  // Con permiso→inicio directo, cancelar recorre menos fases: más frames mantienen útil más de la mitad de los casos.
  const ordenes = fc.constantFrom("iniciar", "cancelar", "reintentar", "destruir", "frame", "frame", "frame", "frame", "frame", "resolver-ok", "resolver-fallo");
  it("SDK-27 Transiciones inválidas: secuencias de hasta 50 eventos solo producen TRANSICIONES y nunca lanzan", async () => {
    let pares = 0;
    await fc.assert(
      fc.asyncProperty(fc.array(ordenes, { maxLength: 50 }), fc.array(fc.integer({ min: 50, max: 100 }), { minLength: 1, maxLength: 8 }), async (resto, scores) => {
        const seq = ["iniciar", ...resto];
        let cambios = 0;
        const f = crearFalsos({ scores, lecturas: ["pendiente"], manual: true });
        const c = crearLector({}, f.deps);
        const vistos: EstadoLector[] = [c.obtenerEstado()];
        c.suscribir((e) => vistos.push(e));
        for (const o of seq) {
          if (o === "iniciar") void c.iniciar(VIDEO);
          else if (o === "cancelar") c.cancelar();
          else if (o === "reintentar") c.reintentar();
          else if (o === "destruir") c.destruir();
          else if (o === "resolver-ok") f.resolverPendiente(AMARILLA);
          else if (o === "resolver-fallo") f.resolverPendiente(NO_ENCONTRADO);
          if (o === "frame") f.tick();
          for (let i = 0; i < 12; i++) await Promise.resolve();
        }
        c.destruir();
        for (let i = 1; i < vistos.length; i++) {
          const a = vistos[i - 1] as EstadoLector;
          const b = vistos[i] as EstadoLector;
          expect(permitida(a.fase, b.fase), `${a.fase}>${b.fase}`).toBe(true);
          if (a.fase !== b.fase) cambios++;
        }
        if (cambios >= 3) pares++;
      }),
      { numRuns: 1000 },
    );
    // Proporción útil: más de la mitad de las secuencias recorren al menos tres transiciones.
    expect(pares).toBeGreaterThan(500);
  });
});
