// SDK-45 a SDK-59 (núcleo con backend propio): escenarios de la spec con DEPS, `fetch` y `ReadableStream` falsos y
// reloj falso. Datos sintéticos de PERSONA_BASE.
import { describe, expect, it } from "vitest";
import { crearLector } from "../../src/controlador.js";
import type { DependenciasLector, DispositivoLector, EstadoLector, FaseLector, OpcionesLector } from "../../src/tipos.js";
import { AMARILLA, crearFalsos, esperar, VIDEO, type OpcionesFalsas } from "../falsos.js";
import { crearBack, crearReloj, drenar, type Guion } from "./back-falso.js";

const POTENTE: DispositivoLector = { memoriaGb: 8, nucleos: 8, simd: true, ahorroDatos: false, tipoRed: "4g" };
const DEBIL: DispositivoLector = { ...POTENTE, memoriaGb: 2 };

interface Montaje {
  opciones?: OpcionesLector;
  falsos?: OpcionesFalsas;
  guiones?: Guion[];
  dispositivo?: DispositivoLector;
  enLinea?: boolean;
  imagen?: () => Promise<Blob>;
}

function montar(m: Montaje = {}) {
  const back = crearBack(...(m.guiones ?? ["ok"]));
  const reloj = crearReloj();
  const f = crearFalsos({ ...m.falsos, fetch: back.fetch });
  const red = { enLinea: m.enLinea ?? true, conectar: [] as (() => void)[] };
  const deps: DependenciasLector = {
    ...f.deps,
    async capturar(...a) {
      const c = await f.deps.capturar(...a);
      return c === null || m.imagen === undefined ? c : { ...c, imagen: m.imagen };
    },
    senales: () => m.dispositivo ?? POTENTE,
    enLinea: () => red.enLinea,
    alConectar(fn) {
      red.conectar.push(fn);
      return () => {
        red.conectar = red.conectar.filter((x) => x !== fn);
      };
    },
    temporizar: reloj.temporizar,
  };
  const c = crearLector(m.opciones ?? { backend: "/api/cedula" }, deps);
  const estados: EstadoLector[] = [];
  c.suscribir((e) => estados.push(e));
  const fases = (): FaseLector[] => estados.map((e) => e.fase).filter((x, i, a) => i === 0 || a[i - 1] !== x);
  const etapas = (): string[] => estados.map((e) => e.verificacion?.etapa).filter((x, i, a): x is NonNullable<typeof x> => x !== undefined && x !== a[i - 1]);
  const volverRed = (): void => {
    red.enLinea = true;
    for (const fn of [...red.conectar]) fn();
  };
  return { c, f, back, reloj, estados, fases, etapas, volverRed, red };
}

const fin = (m: ReturnType<typeof montar>, cond: (e: EstadoLector) => boolean = (e) => e.fase === "resultado" || e.fase === "error") => esperar(() => m.c.obtenerEstado(), cond);

describe("SDK-45 Opción backend del front", () => {
  it("SDK-45 Backend relativo válido", () => {
    const m = montar();
    expect(m.c.obtenerEstado()).toMatchObject({ fase: "inicio", error: null, modo: "front-back", validacion: "estricta", frontActivo: true, modoMotivo: "estricta", intentosVerificacion: { usados: 0, maximo: 3 } });
  });

  it("SDK-45 Esquema inválido sin red", async () => {
    for (const backend of ["http://empresa.example/cedula", "ftp://x", "//otro.example/x", "", "/api con espacio"]) {
      const m = montar({ opciones: { backend } });
      expect(m.c.obtenerEstado().fase).toBe("error");
      expect(m.c.obtenerEstado().error).toMatchObject({ codigo: "opcion-invalida", opcion: "backend" });
      await m.c.iniciar(VIDEO);
      expect(m.back.peticiones).toHaveLength(0);
      expect(m.f.camarasAbiertas).toBe(0);
    }
    for (const backend of ["https://empresa.example/cedula", "http://localhost:3000/x", "http://127.0.0.1/x", "api/cedula"]) {
      expect(montar({ opciones: { backend } }).c.obtenerEstado().fase).toBe("inicio");
    }
  });

  it("SDK-45 Excluyente con el modo microservicio", () => {
    const m = montar({ opciones: { backend: "/api/cedula", servidor: "https://api.lector-cedula.example" } });
    expect(m.c.obtenerEstado().error).toMatchObject({ codigo: "opcion-invalida", opcion: "backend" });
  });

  it("opciones numéricas y de tipo fuera de rango", () => {
    const casos: [OpcionesLector, string][] = [
      [{ backend: "/a", intentosVerificacion: 0 }, "intentosVerificacion"],
      [{ backend: "/a", intentosVerificacion: 11 }, "intentosVerificacion"],
      [{ backend: "/a", intentosVerificacion: 2.5 }, "intentosVerificacion"],
      [{ backend: "/a", tiempoLimiteMs: 0 }, "tiempoLimiteMs"],
      [{ backend: "/a", inactividadMs: Number.NaN }, "inactividadMs"],
      [{ backend: "/a", tiempoColaMs: -1 }, "tiempoColaMs"],
      [{ backend: "/a", streaming: "si" as never }, "streaming"],
      [{ backend: "/a", autoIniciar: 1 as never }, "autoIniciar"],
      [{ backend: "/a", encabezadosBackend: "x" as never }, "encabezadosBackend"],
      [{ backend: "/a", umbralesAuto: null as never }, "umbralesAuto"],
    ];
    for (const [o, opcion] of casos) expect(montar({ opciones: o }).c.obtenerEstado().error).toMatchObject({ codigo: "opcion-invalida", opcion });
    expect(montar({ opciones: { backend: "/a", intentosVerificacion: 10 } }).c.obtenerEstado().intentosVerificacion).toStrictEqual({ usados: 0, maximo: 10 });
  });

  it("SDK-45 Cabeceras propias", async () => {
    const m = montar({ opciones: { backend: "/api/cedula", encabezadosBackend: async () => ({ Authorization: "Bearer prueba-sintetica" }) } });
    await m.c.iniciar(VIDEO);
    await fin(m);
    expect(m.back.peticiones).toHaveLength(1);
    const p = m.back.peticiones[0];
    expect(new Headers(p?.init.headers).get("authorization")).toBe("Bearer prueba-sintetica");
    expect(new Headers(p?.init.headers).get("accept")).toBe("application/x-ndjson");
    expect(p?.init).toMatchObject({ credentials: "same-origin", redirect: "error" });
  });
});

describe("SDK-46 Envío automático y fase verificando", () => {
  it("SDK-46 Secuencia completa con el backend", async () => {
    const m = montar();
    await m.c.iniciar(VIDEO);
    const e = await fin(m);
    expect(m.fases()).toStrictEqual(["permiso", "activo", "listo", "leyendo", "verificando", "resultado"]);
    expect(m.etapas()).toStrictEqual(["recibido", "leyendo", "fraude", "comparando"]);
    expect(m.estados.find((x) => x.verificacion?.etapa === "leyendo")?.verificacion?.progreso).toBe(0.5);
    expect(e.resultado?.confiable).toBe(true);
    expect(e.resultado?.campos.nuip).toBe("9999123456");
    expect(e).toMatchObject({ verificacion: null, rechazo: null, intentosVerificacion: { usados: 1, maximo: 3 } });
    expect(m.f.pistas.every((p) => p.readyState === "ended")).toBe(true);
  });

  it("SDK-46 Resultado local instantáneo antes de la verificación", async () => {
    const m = montar();
    await m.c.iniciar(VIDEO);
    await fin(m);
    const primero = m.estados.find((x) => x.fase === "verificando");
    expect(primero?.resultado?.confiable).toBe(false);
    expect(primero?.resultado?.campos.nuip).toBe("9999123456");
    expect(primero?.verificacion).not.toBeNull();
  });

  it("SDK-46 Una sola petición por intento, multipart con imagen y cliente", async () => {
    const m = montar();
    await m.c.iniciar(VIDEO);
    await fin(m);
    expect(m.back.peticiones).toHaveLength(1);
    const p = m.back.peticiones[0];
    expect(p?.url).toBe("/api/cedula");
    expect(p?.init.method).toBe("POST");
    const cuerpo = p?.init.body as FormData;
    expect([...cuerpo.keys()].sort()).toStrictEqual(["cliente", "imagen"]);
    expect(JSON.parse(String(cuerpo.get("cliente")))).toMatchObject({ tipo: "cedula-ciudadania", campos: { nuip: "9999123456" } });
  });

  it("SDK-46 Sin backend el comportamiento previo no cambia", async () => {
    const m = montar({ opciones: {} });
    expect(m.c.obtenerEstado()).toMatchObject({ modo: "front", frontActivo: true, validacion: null, modoMotivo: "modo-front", intentosVerificacion: null });
    await m.c.iniciar(VIDEO);
    const e = await fin(m);
    expect(m.fases()).toStrictEqual(["permiso", "activo", "listo", "leyendo", "resultado"]);
    expect(e.resultado?.confiable).toBe(false);
    expect(e.verificacion).toBeNull();
    expect(m.back.peticiones).toHaveLength(0);
  });
});

describe("SDK-47 Rechazo y reintento automático", () => {
  it("SDK-47 No coincide y reintenta", async () => {
    const m = montar({ opciones: { backend: "/api/cedula", intentosVerificacion: 3 }, guiones: ["rechazo:no-coincide", "ok"] });
    await m.c.iniciar(VIDEO);
    await esperar(() => m.c.obtenerEstado(), (e) => e.rechazo !== null);
    expect(m.c.obtenerEstado().rechazo).toStrictEqual({ motivo: "no-coincide", diferencias: ["campos.nuip"] });
    const e = await fin(m);
    const f = m.fases();
    expect(f.join(",")).toContain("verificando,activo");
    expect(f.slice(-2)).toStrictEqual(["verificando", "resultado"]);
    expect(e).toMatchObject({ rechazo: null, intentosVerificacion: { usados: 2, maximo: 3 } });
    expect(e.resultado?.confiable).toBe(true);
    expect(m.back.peticiones).toHaveLength(2);
    expect(m.f.camarasAbiertas).toBe(2);
  });

  it("SDK-47 Tope agotado", async () => {
    const m = montar({ opciones: { backend: "/api/cedula", intentosVerificacion: 2 }, guiones: ["rechazo:fraude"] });
    await m.c.iniciar(VIDEO);
    const e = await fin(m, (x) => x.fase === "error");
    expect(e.error?.codigo).toBe("verificacion-rechazada");
    expect(e.rechazo?.motivo).toBe("fraude");
    expect(m.back.peticiones).toHaveLength(2);
    expect(m.f.pistas.every((p) => p.readyState === "ended")).toBe(true);
  });

  it("SDK-47 Cada motivo no terminal vuelve a activo", async () => {
    for (const motivo of ["no-coincide", "fraude", "ilegible", "demasiado-grande", "tiempo-agotado", "ocupado", "error-interno"]) {
      const m = montar({ guiones: [`rechazo:${motivo}`, "colgado"] });
      await m.c.iniciar(VIDEO);
      await esperar(() => m.c.obtenerEstado(), (e) => e.rechazo !== null);
      const f = m.fases();
      expect(f[f.indexOf("verificando") + 1]).toBe("activo");
      expect(m.c.obtenerEstado().rechazo?.motivo).toBe(motivo);
      m.c.destruir();
    }
  });

  it("SDK-47 Motivos terminales", async () => {
    for (const motivo of ["menor-de-edad", "documento-no-admitido"]) {
      const m = montar({ guiones: [`rechazo:${motivo}`] });
      await m.c.iniciar(VIDEO);
      const e = await fin(m);
      expect(m.fases().slice(-2)).toStrictEqual(["verificando", "error"]);
      expect(e).toMatchObject({ error: { codigo: "verificacion-rechazada" }, rechazo: { motivo }, intentosVerificacion: { usados: 1 } });
      expect(m.back.peticiones).toHaveLength(1);
      expect(m.f.pistas.every((p) => p.readyState === "ended")).toBe(true);
    }
  });

  it("SDK-47 Motivo desconocido", async () => {
    const m = montar({ guiones: [{ fragmentos: ['{"etapa":"resultado","ok":false,"rechazo":{"motivo":"otro"}}\n'] }] });
    await m.c.iniciar(VIDEO);
    expect((await fin(m)).error?.codigo).toBe("protocolo-invalido");
  });
});

describe("SDK-48 y SDK-54 transporte", () => {
  it("SDK-48 Backend 503: resultado local conservado, sin segundo envío", async () => {
    const m = montar({ guiones: ["503"] });
    await m.c.iniciar(VIDEO);
    const e = await fin(m);
    expect(e.error?.codigo).toBe("backend-no-disponible");
    expect(e.resultado?.confiable).toBe(false);
    expect(e.resultado?.campos.nuip).toBe("9999123456");
    expect(e.intentosVerificacion?.usados).toBe(0);
    await drenar();
    expect(m.back.peticiones).toHaveLength(1);
  });

  it("SDK-48 Backend colgado", async () => {
    const m = montar({ opciones: { backend: "/api/cedula", inactividadMs: 200 }, guiones: ["colgado"] });
    await m.c.iniciar(VIDEO);
    await esperar(() => m.c.obtenerEstado(), (e) => e.fase === "verificando");
    await drenar();
    m.reloj.avanzar(201);
    expect((await fin(m)).error?.codigo).toBe("backend-tiempo-agotado");
    expect(m.back.peticiones[0]?.senal.aborted).toBe(true);
  });

  it("SDK-48 Línea que no es JSON", async () => {
    const m = montar({ guiones: ["basura"] });
    await m.c.iniciar(VIDEO);
    expect((await fin(m)).error?.codigo).toBe("protocolo-invalido");
    expect(m.back.peticiones[0]?.senal.aborted).toBe(true);
  });

  it("SDK-48 Content-Type incorrecto", async () => {
    const m = montar({ guiones: [{ tipo: "text/html", fragmentos: ["<p>"] }] });
    await m.c.iniciar(VIDEO);
    expect((await fin(m)).error?.codigo).toBe("protocolo-invalido");
  });

  it("SDK-48 Cancelar durante la verificación", async () => {
    const m = montar({ guiones: ["colgado"] });
    await m.c.iniciar(VIDEO);
    await esperar(() => m.c.obtenerEstado(), (e) => e.fase === "verificando");
    await drenar();
    m.c.cancelar();
    expect(m.c.obtenerEstado().fase).toBe("inicio");
    expect(m.back.peticiones[0]?.senal.aborted).toBe(true);
    expect(m.f.pistas.every((p) => p.readyState === "ended")).toBe(true);
    expect(m.f.pixeles.every((p) => p.every((b) => b === 0))).toBe(true);
    await drenar();
    expect(m.c.obtenerEstado().fase).toBe("inicio");
  });

  it("destruir durante la verificación aborta y no notifica más", async () => {
    const m = montar({ guiones: ["colgado"] });
    await m.c.iniciar(VIDEO);
    await esperar(() => m.c.obtenerEstado(), (e) => e.fase === "verificando");
    await drenar();
    const n = m.estados.length;
    m.c.destruir();
    await drenar();
    expect(m.back.peticiones[0]?.senal.aborted).toBe(true);
    expect(m.estados).toHaveLength(n);
  });

  it("SDK-54 413 como rechazo", async () => {
    const m = montar({ guiones: [{ estado: 413 }, "colgado"] });
    await m.c.iniciar(VIDEO);
    await esperar(() => m.c.obtenerEstado(), (e) => e.rechazo !== null);
    expect(m.c.obtenerEstado().rechazo?.motivo).toBe("demasiado-grande");
    const f = m.fases();
    expect(f[f.indexOf("verificando") + 1]).toBe("activo");
    m.c.destruir();
  });

  it("SDK-54 Estado 401", async () => {
    const m = montar({ guiones: [{ estado: 401 }] });
    await m.c.iniciar(VIDEO);
    const e = await fin(m);
    expect(e.error?.codigo).toBe("backend-rechazo-http");
    expect(e.intentosVerificacion?.usados).toBe(0);
  });

  it("SDK-54 Stream cerrado sin evento final", async () => {
    const m = montar({ guiones: [{ fragmentos: ['{"etapa":"recibido"}\n'] }] });
    await m.c.iniciar(VIDEO);
    expect((await fin(m)).error?.codigo).toBe("protocolo-invalido");
  });

  it("SDK-54 Reintentar tras un fallo de transporte", async () => {
    const m = montar({ guiones: ["503", "ok"] });
    await m.c.iniciar(VIDEO);
    await fin(m);
    m.c.reintentar();
    expect(m.c.obtenerEstado().fase).toBe("permiso");
    const e = await fin(m, (x) => x.fase === "resultado");
    expect(e.intentosVerificacion?.usados).toBe(1);
    expect(e.resultado?.confiable).toBe(true);
  });
});

describe("SDK-53 Menores en el modo backend propio", () => {
  const TI = { ...AMARILLA, tipoDocumento: "tarjeta-identidad" } as typeof AMARILLA;

  it("SDK-53 Menor de edad sin envío", async () => {
    const m = montar({ opciones: { backend: "/api/cedula", admitirTi: true }, falsos: { lecturas: [TI] } });
    await m.c.iniciar(VIDEO);
    const e = await fin(m);
    expect(m.back.peticiones).toHaveLength(0);
    expect(e).toMatchObject({ fase: "error", error: { codigo: "verificacion-rechazada" }, rechazo: { motivo: "menor-de-edad" }, intentosVerificacion: { usados: 1 } });
  });

  it("SDK-53 Menor con enviarMenores", async () => {
    const m = montar({ opciones: { backend: "/api/cedula", admitirTi: true, enviarMenores: true }, falsos: { lecturas: [TI] } });
    await m.c.iniciar(VIDEO);
    await fin(m);
    expect(m.back.peticiones).toHaveLength(1);
  });
});

describe("SDK-55 Opción modo", () => {
  it("SDK-55 Modo front ignora el backend", async () => {
    const m = montar({ opciones: { modo: "front", backend: "/api/cedula" } });
    await m.c.iniciar(VIDEO);
    const e = await fin(m);
    expect(m.fases()).toStrictEqual(["permiso", "activo", "listo", "leyendo", "resultado"]);
    expect(e).toMatchObject({ modo: "front", frontActivo: true, validacion: null });
    expect(e.resultado?.confiable).toBe(false);
    expect(m.back.peticiones).toHaveLength(0);
  });

  it("SDK-55 Modo back sin backend y modo auto inexistente", () => {
    for (const o of [{ modo: "back" }, { modo: "front-back" }, { modo: "auto", backend: "/api/cedula" }] as OpcionesLector[]) {
      expect(montar({ opciones: o }).c.obtenerEstado().error).toMatchObject({ codigo: "opcion-invalida", opcion: "modo" });
    }
  });

  it("SDK-55 Validación fuera de front-back", () => {
    for (const o of [{ modo: "front", validacion: "auto" }, { backend: "/api/cedula", validacion: "rapida" }, { modo: "back", backend: "/a", validacion: "estricta" }] as OpcionesLector[]) {
      expect(montar({ opciones: o }).c.obtenerEstado().error).toMatchObject({ codigo: "opcion-invalida", opcion: "validacion" });
    }
  });

  it("SDK-55 Front-back estricta por omisión, también con dispositivo débil", async () => {
    const m = montar({ dispositivo: DEBIL });
    await m.c.iniciar(VIDEO);
    const e = await fin(m);
    expect(m.fases()).toStrictEqual(["permiso", "activo", "listo", "leyendo", "verificando", "resultado"]);
    expect(m.f.lecturasHechas).toBe(1);
    expect(m.back.peticiones).toHaveLength(1);
    expect(e).toMatchObject({ modo: "front-back", validacion: "estricta", frontActivo: true, modoMotivo: "estricta" });
  });
});

describe("SDK-56 Modo back ligero", () => {
  it("SDK-56 Secuencia del modo back", async () => {
    const m = montar({ opciones: { modo: "back", backend: "/api/cedula" } });
    expect(m.c.obtenerEstado()).toMatchObject({ modo: "back", frontActivo: false, validacion: null, modoMotivo: "modo-back" });
    await m.c.iniciar(VIDEO);
    const e = await fin(m);
    expect(m.fases()).toStrictEqual(["permiso", "activo", "listo", "verificando", "resultado"]);
    expect(m.f.lecturasHechas).toBe(0);
    expect(e.resultado?.confiable).toBe(true);
    expect(m.estados.filter((x) => x.fase === "verificando").every((x) => x.resultado === null)).toBe(true);
    const cuerpo = m.back.peticiones[0]?.init.body as FormData;
    expect([...cuerpo.keys()]).toStrictEqual(["imagen"]);
    expect(m.f.pixeles.every((p) => p.every((b) => b === 0))).toBe(true);
  });

  it("SDK-56 captura sin imagen: lectura-fallida sin red", async () => {
    const m = montar({ opciones: { modo: "back", backend: "/api/cedula" }, falsos: { sinImagen: true } });
    await m.c.iniciar(VIDEO);
    expect((await fin(m)).error?.codigo).toBe("lectura-fallida");
    expect(m.back.peticiones).toHaveLength(0);
  });
});

describe("SDK-57 front-back con validación auto", () => {
  it("SDK-57 Dispositivo potente", async () => {
    const m = montar({ opciones: { backend: "/api/cedula", validacion: "auto" } });
    expect(m.c.obtenerEstado()).toMatchObject({ frontActivo: null, modoMotivo: null, validacion: "auto" });
    await m.c.iniciar(VIDEO);
    const e = await fin(m);
    expect(m.fases()).toStrictEqual(["permiso", "activo", "listo", "leyendo", "verificando", "resultado"]);
    expect(e).toMatchObject({ modo: "front-back", validacion: "auto", frontActivo: true, modoMotivo: "potente" });
  });

  it("SDK-57 Dispositivo débil", async () => {
    const m = montar({ opciones: { backend: "/api/cedula", validacion: "auto" }, dispositivo: DEBIL });
    await m.c.iniciar(VIDEO);
    const e = await fin(m);
    expect(m.fases()).toStrictEqual(["permiso", "activo", "listo", "verificando", "resultado"]);
    expect(m.f.lecturasHechas).toBe(0);
    expect(m.back.peticiones).toHaveLength(1);
    expect(e).toMatchObject({ frontActivo: false, modoMotivo: "memoria-baja" });
    expect(e.resultado?.confiable).toBe(true);
  });

  it("SDK-57 Umbrales configurables", async () => {
    const m = montar({ opciones: { backend: "/api/cedula", validacion: "auto", umbralesAuto: { memoriaMinGb: 8 } }, dispositivo: { ...POTENTE, memoriaGb: 4 } });
    await m.c.iniciar(VIDEO);
    expect(m.c.obtenerEstado()).toMatchObject({ frontActivo: false, modoMotivo: "memoria-baja" });
    m.c.destruir();
  });
});

describe("SDK-58 Confirmación diferida sin red", () => {
  it("SDK-58 Vuelve la red", async () => {
    const m = montar({ enLinea: false });
    await m.c.iniciar(VIDEO);
    const espera = await esperar(() => m.c.obtenerEstado(), (e) => e.verificacion?.etapa === "en-espera");
    expect(espera.fase).toBe("verificando");
    expect(espera.resultado?.confiable).toBe(false);
    await drenar();
    expect(m.back.peticiones).toHaveLength(0);
    m.volverRed();
    const e = await fin(m);
    expect(m.fases().slice(-3)).toStrictEqual(["leyendo", "verificando", "resultado"]);
    expect(e.resultado?.confiable).toBe(true);
    expect(m.back.peticiones).toHaveLength(1);
    expect(m.red.conectar).toHaveLength(0);
  });

  it("SDK-58 Sin red con front ligero", async () => {
    const m = montar({ opciones: { backend: "/api/cedula", validacion: "auto" }, dispositivo: DEBIL, enLinea: false });
    await m.c.iniciar(VIDEO);
    const e = await esperar(() => m.c.obtenerEstado(), (x) => x.verificacion?.etapa === "en-espera");
    expect(e).toMatchObject({ fase: "verificando", resultado: null });
    m.c.destruir();
  });

  it("SDK-58 Destruir con cola pendiente", async () => {
    const m = montar({ enLinea: false });
    await m.c.iniciar(VIDEO);
    await esperar(() => m.c.obtenerEstado(), (e) => e.verificacion?.etapa === "en-espera");
    await drenar();
    m.c.destruir();
    m.volverRed();
    await drenar();
    expect(m.back.peticiones).toHaveLength(0);
    expect(m.red.conectar).toHaveLength(0);
    expect(m.reloj.pendientes).toBe(0);
  });

  it("SDK-58 los bytes de la cola quedan a cero al destruir, al vencer y al enviar", async () => {
    for (const final of ["destruir", "vencer", "enviar"] as const) {
      const buffer = new Uint8Array([0xff, 0xd8, 0xff, 7, 7]).buffer;
      const imagen = async () => ({ type: "image/jpeg", arrayBuffer: async () => buffer }) as unknown as Blob;
      const m = montar({ opciones: { backend: "/api/cedula", tiempoColaMs: 1000 }, enLinea: false, imagen });
      await m.c.iniciar(VIDEO);
      await esperar(() => m.c.obtenerEstado(), (e) => e.verificacion?.etapa === "en-espera");
      await drenar();
      expect(new Uint8Array(buffer).some((b) => b !== 0)).toBe(true);
      if (final === "destruir") m.c.destruir();
      else if (final === "vencer") m.reloj.avanzar(1001);
      else m.volverRed();
      expect(new Uint8Array(buffer).every((b) => b === 0)).toBe(true);
      m.c.destruir();
    }
  });

  it("SDK-58 Cola vencida", async () => {
    const m = montar({ opciones: { backend: "/api/cedula", tiempoColaMs: 1000 }, enLinea: false });
    await m.c.iniciar(VIDEO);
    await esperar(() => m.c.obtenerEstado(), (e) => e.verificacion?.etapa === "en-espera");
    await drenar();
    m.reloj.avanzar(1001);
    const e = await fin(m);
    expect(e.error?.codigo).toBe("cola-vencida");
    expect(e.resultado?.confiable).toBe(false);
    m.volverRed();
    await drenar();
    expect(m.back.peticiones).toHaveLength(0);
  });

  it("SDK-58 modo back sin red: backend-no-disponible sin cola", async () => {
    const m = montar({ opciones: { modo: "back", backend: "/api/cedula" }, guiones: [{ red: true }], enLinea: false });
    await m.c.iniciar(VIDEO);
    expect((await fin(m)).error?.codigo).toBe("backend-no-disponible");
    expect(m.red.conectar).toHaveLength(0);
  });
});

describe("SDK-59 Streaming opcional", () => {
  it("SDK-59 Streaming desactivado", async () => {
    const final = JSON.stringify({ etapa: "resultado", ok: true, documento: { tipo: "cedula-ciudadania", campos: { nuip: "9999123456" } } });
    const m = montar({ opciones: { backend: "/api/cedula", streaming: false }, guiones: [{ tipo: "application/json", fragmentos: [final] }] });
    await m.c.iniciar(VIDEO);
    const e = await fin(m);
    expect(new Headers(m.back.peticiones[0]?.init.headers).get("accept")).toBe("application/json");
    expect(m.etapas()).toStrictEqual(["recibido"]);
    expect(e.resultado?.confiable).toBe(true);
  });

  it("SDK-59 Respuesta incoherente con streaming desactivado", async () => {
    const m = montar({ opciones: { backend: "/api/cedula", streaming: false } });
    await m.c.iniciar(VIDEO);
    expect((await fin(m)).error?.codigo).toBe("protocolo-invalido");
  });
});

describe("SDK-49 autoIniciar en el núcleo", () => {
  it("SDK-49 Navegador que exige gesto", async () => {
    const m = montar({ opciones: { autoIniciar: true }, falsos: { camara: { name: "NotAllowedError" } } });
    await m.c.iniciar(VIDEO);
    expect(m.fases()).toStrictEqual(["permiso", "inicio"]);
    expect(m.c.obtenerEstado().error).toMatchObject({ codigo: "autoinicio-fallido", causa: "camara-denegada" });
    expect(m.c.obtenerEstado().error?.mensaje).not.toBe("");
    await m.c.iniciar(VIDEO);
    expect(m.fases()).toStrictEqual(["permiso", "inicio", "permiso", "error"]);
    expect(m.c.obtenerEstado().error?.codigo).toBe("camara-denegada");
  });
});
