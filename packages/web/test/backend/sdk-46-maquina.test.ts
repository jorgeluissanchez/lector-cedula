// SDK-46, SDK-47, SDK-48, SDK-28 (máquina pura con `verificando`): transiciones, intentos y propiedad.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { congelar, ESTADO_INICIAL } from "../../src/estado.js";
import { permitida, TRANSICIONES, transicion, type EventoLector } from "../../src/maquina.js";
import type { EstadoLector, ResultadoPresentacion } from "../../src/tipos.js";
import { CAMPOS_BASE } from "../falsos.js";

const LOCAL: ResultadoPresentacion = { tipo: "cedula-ciudadania", campos: CAMPOS_BASE, warnings: [], confiable: false, validacion_id: null };
const CONFIABLE: ResultadoPresentacion = { ...LOCAL, confiable: true };
const BASE: EstadoLector = congelar({ ...ESTADO_INICIAL, modo: "front-back", validacion: "estricta", frontActivo: true, modoMotivo: "estricta", intentosVerificacion: { usados: 0, maximo: 3 } });
const en = (fase: EstadoLector["fase"], extra: Partial<EstadoLector> = {}): EstadoLector => congelar({ ...BASE, fase, ...extra });
const RECIBIDO = { etapa: "recibido", progreso: null } as const;

describe("SDK-46 máquina con verificando", () => {
  it("TRANSICIONES incluye las de la spec para el backend", () => {
    for (const par of ["leyendo>verificando", "activo>verificando", "listo>verificando", "verificando>resultado", "verificando>activo", "verificando>error", "verificando>inicio"]) {
      expect(TRANSICIONES.has(par)).toBe(true);
    }
    expect(TRANSICIONES.has("resultado>verificando")).toBe(false);
    expect(permitida("verificando", "permiso")).toBe(false);
  });

  it("leyendo→verificando conserva el resultado local no confiable", () => {
    const e = transicion(en("leyendo", { progreso: 0.5 }), { tipo: "verificar", resultado: LOCAL, contenido: "pdf417", verificacion: RECIBIDO });
    expect(e.fase).toBe("verificando");
    expect(e.resultado).toStrictEqual(LOCAL);
    expect(e.verificacion).toStrictEqual(RECIBIDO);
    expect(e.contenido).toBe("pdf417");
    expect(e.progreso).toBe(1);
  });

  it("SDK-56 listo→verificando sin resultado (front ligero)", () => {
    const e = transicion(en("listo"), { tipo: "verificar", resultado: null, contenido: null, verificacion: { etapa: "en-espera", progreso: null } });
    expect(e).toMatchObject({ fase: "verificando", resultado: null, verificacion: { etapa: "en-espera", progreso: null }, progreso: null });
    expect(transicion(en("activo"), { tipo: "verificar", resultado: null, contenido: null, verificacion: RECIBIDO }).fase).toBe("verificando");
  });

  it("verificar fuera de activo, listo o leyendo no cambia nada", () => {
    for (const f of ["inicio", "permiso", "resultado", "error", "verificando"] as const) {
      const e = en(f);
      expect(transicion(e, { tipo: "verificar", resultado: LOCAL, contenido: null, verificacion: RECIBIDO })).toBe(e);
    }
  });

  it("etapa solo en verificando, con progreso acotado", () => {
    const v = en("verificando", { verificacion: RECIBIDO });
    expect(transicion(v, { tipo: "etapa", verificacion: { etapa: "leyendo", progreso: 0.5 } }).verificacion).toStrictEqual({ etapa: "leyendo", progreso: 0.5 });
    expect(transicion(v, { tipo: "etapa", verificacion: { etapa: "leyendo", progreso: 7 } }).verificacion).toStrictEqual({ etapa: "leyendo", progreso: 1 });
    expect(transicion(v, { tipo: "etapa", verificacion: { etapa: "leyendo", progreso: -1 } }).verificacion).toStrictEqual({ etapa: "leyendo", progreso: 0 });
    const a = en("activo");
    expect(transicion(a, { tipo: "etapa", verificacion: RECIBIDO })).toBe(a);
  });

  it("SDK-28 verificado: confiable, sin verificación ni rechazo, un intento usado", () => {
    const v = en("verificando", { verificacion: RECIBIDO, resultado: LOCAL, rechazo: { motivo: "fraude" }, intentosVerificacion: { usados: 1, maximo: 3 } });
    const e = transicion(v, { tipo: "verificado", resultado: CONFIABLE });
    expect(e).toMatchObject({ fase: "resultado", verificacion: null, rechazo: null, intentosVerificacion: { usados: 2, maximo: 3 } });
    expect(e.resultado?.confiable).toBe(true);
    const l = en("leyendo");
    expect(transicion(l, { tipo: "verificado", resultado: CONFIABLE })).toBe(l);
  });

  it("SDK-47 rechazo con intentos restantes vuelve a activo y conserva el rechazo", () => {
    const v = en("verificando", { verificacion: RECIBIDO, resultado: LOCAL, calidad: { score: 90, motivo: null }, contenido: "pdf417" });
    const e = transicion(v, { tipo: "rechazo", rechazo: { motivo: "no-coincide", diferencias: ["campos.nuip"] } });
    expect(e).toMatchObject({ fase: "activo", rechazo: { motivo: "no-coincide", diferencias: ["campos.nuip"] }, verificacion: null, resultado: null, calidad: null, contenido: null, error: null, intentosVerificacion: { usados: 1, maximo: 3 } });
  });

  it("SDK-47 Tope agotado: error verificacion-rechazada con el último rechazo", () => {
    const v = en("verificando", { resultado: LOCAL, intentosVerificacion: { usados: 1, maximo: 2 } });
    const e = transicion(v, { tipo: "rechazo", rechazo: { motivo: "fraude" }, error: { codigo: "verificacion-rechazada", mensaje: "m" } });
    expect(e).toMatchObject({ fase: "error", rechazo: { motivo: "fraude" }, error: { codigo: "verificacion-rechazada" }, intentosVerificacion: { usados: 2, maximo: 2 }, verificacion: null });
  });

  it("SDK-47 Motivos terminales: menor-de-edad y documento-no-admitido van a error al primer intento", () => {
    for (const motivo of ["menor-de-edad", "documento-no-admitido"] as const) {
      const e = transicion(en("verificando"), { tipo: "rechazo", rechazo: { motivo }, error: { codigo: "verificacion-rechazada", mensaje: "m" } });
      expect(e).toMatchObject({ fase: "error", rechazo: { motivo }, intentosVerificacion: { usados: 1, maximo: 3 } });
    }
    for (const motivo of ["no-coincide", "fraude", "ilegible", "demasiado-grande", "tiempo-agotado", "ocupado", "error-interno"] as const) {
      expect(transicion(en("verificando"), { tipo: "rechazo", rechazo: { motivo }, error: { codigo: "verificacion-rechazada", mensaje: "m" } }).fase).toBe("activo");
    }
  });

  it("SDK-53 rechazo local desde leyendo (menor) va a error", () => {
    const e = transicion(en("leyendo"), { tipo: "rechazo", rechazo: { motivo: "menor-de-edad" }, error: { codigo: "verificacion-rechazada", mensaje: "m" } });
    expect(e).toMatchObject({ fase: "error", intentosVerificacion: { usados: 1, maximo: 3 } });
  });

  it("rechazo sin intentos configurados usa un tope de 1", () => {
    const e = transicion(congelar({ ...ESTADO_INICIAL, fase: "verificando" }), { tipo: "rechazo", rechazo: { motivo: "fraude" }, error: { codigo: "verificacion-rechazada", mensaje: "m" } });
    expect(e).toMatchObject({ fase: "error", intentosVerificacion: { usados: 1, maximo: 1 } });
    const r = transicion(en("resultado"), { tipo: "rechazo", rechazo: { motivo: "fraude" } });
    expect(r.fase).toBe("resultado");
  });

  it("SDK-54 fallo en verificando conserva el resultado local y no consume intentos", () => {
    const e = transicion(en("verificando", { resultado: LOCAL, verificacion: RECIBIDO }), { tipo: "fallo", error: { codigo: "backend-no-disponible", mensaje: "m" } });
    expect(e).toMatchObject({ fase: "error", resultado: LOCAL, verificacion: null, intentosVerificacion: { usados: 0, maximo: 3 } });
  });

  it("SDK-48 cancelar en verificando vuelve a inicio y limpia la verificación", () => {
    const e = transicion(en("verificando", { resultado: LOCAL, verificacion: RECIBIDO, rechazo: { motivo: "fraude" }, intentosVerificacion: { usados: 2, maximo: 3 } }), { tipo: "cancelar" });
    expect(e).toMatchObject({ fase: "inicio", resultado: null, verificacion: null, rechazo: null, intentosVerificacion: { usados: 0, maximo: 3 }, modo: "front-back" });
  });

  it("reintentar desde error reinicia los intentos y el rechazo; conserva el modo", () => {
    const e = transicion(en("error", { rechazo: { motivo: "fraude" }, intentosVerificacion: { usados: 3, maximo: 3 } }), { tipo: "reintentar" });
    expect(e).toMatchObject({ fase: "permiso", rechazo: null, verificacion: null, intentosVerificacion: { usados: 0, maximo: 3 }, modo: "front-back", frontActivo: true });
  });

  it("SDK-57 iniciar con decisión fija frontActivo y modoMotivo", () => {
    const e = transicion(en("inicio", { frontActivo: null, modoMotivo: null }), { tipo: "iniciar", decision: { frontActivo: false, modoMotivo: "memoria-baja" } });
    expect(e).toMatchObject({ fase: "permiso", frontActivo: false, modoMotivo: "memoria-baja" });
    expect(transicion(en("inicio"), { tipo: "iniciar" })).toMatchObject({ frontActivo: true, modoMotivo: "estricta" });
  });

  it("SDK-47 el rechazo se conserva durante la nueva captura", () => {
    const a = en("activo", { rechazo: { motivo: "ilegible" } });
    const f = { score: 90, motivo: null, guia: { x: 0, y: 0, ancho: 10, alto: 10 }, anchoVideo: 100, altoVideo: 100, contenido: "pdf417" as const };
    expect(transicion(a, { tipo: "calidad", frame: f, apto: true }).rechazo).toStrictEqual({ motivo: "ilegible" });
    expect(transicion(en("leyendo", { rechazo: { motivo: "ilegible" } }), { tipo: "reintento-automatico" }).rechazo).toStrictEqual({ motivo: "ilegible" });
  });
});

const evento: fc.Arbitrary<EventoLector> = fc.oneof(
  fc.constant({ tipo: "iniciar" } as const),
  fc.constant({ tipo: "camara-lista" } as const),
  fc.constant({ tipo: "fallo", error: { codigo: "backend-no-disponible", mensaje: "m" } } as const),
  fc.boolean().map((apto) => ({ tipo: "calidad", apto, frame: { score: apto ? 90 : 30, motivo: null, guia: { x: 0, y: 0, ancho: 1, alto: 1 }, anchoVideo: 2, altoVideo: 2, contenido: "pdf417" } }) as const),
  fc.constant({ tipo: "leyendo", contenido: "pdf417" } as const),
  fc.constant({ tipo: "resultado", resultado: LOCAL, contenido: "pdf417", envio: null } as const),
  fc.constant({ tipo: "reintento-automatico" } as const),
  fc.constant({ tipo: "cancelar" } as const),
  fc.constant({ tipo: "reintentar" } as const),
  fc.boolean().map((r) => ({ tipo: "verificar", resultado: r ? LOCAL : null, contenido: null, verificacion: RECIBIDO }) as const),
  fc.constantFrom("recibido", "leyendo", "fraude", "comparando").map((etapa) => ({ tipo: "etapa", verificacion: { etapa, progreso: null } }) as const),
  fc.constant({ tipo: "verificado", resultado: CONFIABLE } as const),
  fc.constantFrom("no-coincide", "fraude", "menor-de-edad", "ocupado").map((motivo) => ({ tipo: "rechazo", rechazo: { motivo }, error: { codigo: "verificacion-rechazada", mensaje: "m" } }) as const),
);

describe("SDK-46, SDK-47, SDK-48 propiedad de la máquina con verificando", () => {
  it("todo par de fases pertenece a TRANSICIONES; confiable solo en resultado verificado; usados <= maximo", () => {
    fc.assert(
      fc.property(fc.array(evento, { maxLength: 60 }), (eventos) => {
        let e = BASE;
        for (const ev of eventos) {
          const s = transicion(e, ev);
          expect(permitida(e.fase, s.fase)).toBe(true);
          expect(Object.isFrozen(s)).toBe(true);
          if (s.resultado?.confiable === true) expect(s.fase).toBe("resultado");
          const i = s.intentosVerificacion;
          if (i !== null) expect(i.usados).toBeLessThanOrEqual(i.maximo);
          if (s.fase !== "verificando") expect(s.verificacion).toBeNull();
          e = s;
        }
      }),
      { numRuns: 1000 },
    );
  });
});
