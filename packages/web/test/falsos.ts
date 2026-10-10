// DEPS falsas (spec, convención `DEPS`): cámara, calidad, captura, lector y reloj sin hardware. Datos de PERSONA_BASE.
import type { ResultadoLectura } from "@lector-cedula/capture";
import type { CapturaLector, DependenciasLector, EstadoLector, FrameCalidad, MotivoCalidad } from "../src/index.js";

export type Lectura = ResultadoLectura;

export const CAMPOS_BASE = Object.freeze({
  numeroDocumento: "9999123456",
  nuip: "9999123456",
  apellidos: "PRUEBA EJEMPLO",
  nombres: "FICTICIA LUZ",
  fechaNacimiento: "1985-03-14",
  sexo: "F",
  nacionalidad: "COL",
  paisEmisor: "COL",
  fechaVencimiento: "2035-03-14",
  rh: "O+",
});

export const AMARILLA: Lectura = {
  ok: true,
  tipo: "pdf417",
  intento: "original",
  resultado: null,
  tipoDocumento: "cedula-ciudadania",
  fuente: "pdf417",
  campos: CAMPOS_BASE,
  warnings: [],
};

export const DIGITAL: Lectura = { ...AMARILLA, tipo: "mrz", fuente: "mrz-td1", campos: { ...CAMPOS_BASE, rh: undefined as never } };

export const NO_ENCONTRADO: Lectura = { ok: false, tipo: "pdf417", error: "pdf417-no-encontrado" };

export interface PistaFalsa {
  readyState: "live" | "ended";
  stop(): void;
}

export interface OpcionesFalsas {
  camara?: "ok" | { name: string };
  /** Scores emitidos; el último se repite. */
  scores?: readonly (number | { score: number; motivo: MotivoCalidad | null })[];
  guia?: { x: number; y: number; ancho: number; alto: number };
  video?: { ancho: number; alto: number };
  contenido?: "pdf417" | "mrz" | null;
  /** Resultados del lector en orden; el último se repite. `"pendiente"` deja la promesa abierta. */
  lecturas?: readonly (Lectura | "pendiente")[];
  fetch?: typeof fetch;
  /** Ciclos de análisis solo con tick() (para propiedades rápidas). */
  manual?: boolean;
  guiada?: boolean;
  calidadFalla?: boolean;
  capturasRechazadas?: number;
  sinImagen?: boolean;
  imagenFalla?: boolean;
}

export interface Falsos {
  deps: DependenciasLector;
  pistas: PistaFalsa[];
  terminados: { calidad: number; lector: number };
  camarasAbiertas: number;
  /** Resuelve la lectura pendiente. */
  resolverPendiente(r: Lectura): void;
  lecturasHechas: number;
  capturas: number;
  pixeles: Uint8ClampedArray[];
  /** SDK-61: guía recibida en cada análisis y captura. */
  guiasRecibidas: unknown[];
  /** Ejecuta los ciclos programados (modo manual). */
  tick(): void;
}

export function crearFalsos(o: OpcionesFalsas = {}): Falsos {
  const scores = o.scores ?? [40, 90, 90];
  const lecturas = o.lecturas ?? [AMARILLA];
  const guia = o.guia ?? { x: 192, y: 216, ancho: 1536, alto: 648 };
  const video = o.video ?? { ancho: 1920, alto: 1080 };
  let iScore = 0;
  let iLectura = 0;
  let pendiente: ((r: Lectura) => void) | null = null;
  let cola: (() => void)[] = [];
  const f: Falsos = {
    pistas: [],
    terminados: { calidad: 0, lector: 0 },
    camarasAbiertas: 0,
    lecturasHechas: 0,
    capturas: 0,
    pixeles: [],
    guiasRecibidas: [],
    tick() {
      const c = cola;
      cola = [];
      for (const fn of c) fn();
    },
    resolverPendiente(r) {
      pendiente?.(r);
      pendiente = null;
    },
    deps: {
      async abrirCamara() {
        await Promise.resolve();
        if (o.camara !== undefined && o.camara !== "ok") throw Object.assign(new Error("camara"), { name: o.camara.name });
        const pista: PistaFalsa = {
          readyState: "live",
          stop() {
            this.readyState = "ended";
          },
        };
        f.pistas.push(pista);
        f.camarasAbiertas++;
        return { stream: {} as MediaStream, ancho: video.ancho, alto: video.alto, detener: () => pista.stop() };
      },
      crearCalidad() {
        return {
          async analizar(_v, g): Promise<FrameCalidad> {
            f.guiasRecibidas.push(g);
            await Promise.resolve();
            const s = scores[Math.min(iScore++, scores.length - 1)] ?? 0;
            const { score, motivo } = typeof s === "number" ? { score: s, motivo: null } : s;
            if (o.calidadFalla === true) throw new Error("worker");
            return { score, motivo, guia, anchoVideo: video.ancho, altoVideo: video.alto, contenido: o.contenido ?? "pdf417", ...(o.guiada === true ? { guiada: true } : {}) };
          },
          terminar() {
            f.terminados.calidad++;
          },
        };
      },
      async capturar(_v, _c, _p, g): Promise<CapturaLector | null> {
        f.guiasRecibidas.push(g);
        await Promise.resolve();
        f.capturas++;
        if (f.capturas <= (o.capturasRechazadas ?? 0)) return null;
        const pixeles = new Uint8ClampedArray(16).fill(7);
        f.pixeles.push(pixeles);
        return {
          frames: [{ ancho: 2, alto: 2, pixeles, origen: "video" }],
          pista: o.contenido ?? "pdf417",
          ...(o.sinImagen === true
            ? {}
            : { imagen: async () => (o.imagenFalla === true ? Promise.reject(new Error("x")) : new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" })) }),
          liberar() {
            pixeles.fill(0);
          },
        };
      },
      crearLector() {
        return {
          async leer(_c, senal, progreso) {
            f.lecturasHechas++;
            progreso(0.5);
            const r = lecturas[Math.min(iLectura++, lecturas.length - 1)] ?? AMARILLA;
            if (r === "pendiente") {
              return new Promise<Lectura>((resolver) => {
                pendiente = resolver;
                senal.addEventListener("abort", () => resolver({ ok: false, error: "cancelada" }), { once: true });
              });
            }
            return r;
          },
          terminar() {
            f.terminados.lector++;
          },
        };
      },
      programar(fn) {
        if (o.manual === true) {
          cola.push(fn);
          return () => {
            cola = cola.filter((x) => x !== fn);
          };
        }
        const t = setTimeout(fn, 0);
        return () => clearTimeout(t);
      },
      ahora: () => 0,
      ...(o.fetch === undefined ? {} : { fetch: o.fetch }),
    },
  };
  return f;
}

export const VIDEO = {} as HTMLVideoElement;

/** Espera a que el estado cumpla la condición (por condición, nunca por tiempo fijo). */
export async function esperar(obtener: () => EstadoLector, cond: (e: EstadoLector) => boolean, max = 2000): Promise<EstadoLector> {
  for (let i = 0; i < max; i++) {
    const e = obtener();
    if (cond(e)) return e;
    await new Promise((r) => setTimeout(r, 0));
  }
  throw new Error(`condición no alcanzada; fase ${obtener().fase}`);
}
