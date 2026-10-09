/**
 * Cliente del Worker de fraude (deteccion-fraude, FRA-02, FRA-03, FRA-17, FRA-20). Envía copias transferidas de los
 * frames (el Worker las pone a cero), espera la señal como máximo TIEMPO_MAXIMO_FRAUDE_MS y nunca rechaza: ante error,
 * tiempo agotado o respuesta mal formada resuelve `null` y la lectura se muestra igual. No guarda nada.
 */
import type { CodigoMotivo, DatosDocumento, SenalRiesgo } from "@lector-cedula/fraud";

export const TIEMPO_MAXIMO_FRAUDE_MS = 3000;
const MAX_FRAMES = 5;

export interface PuertoFraude {
  postMessage(mensaje: unknown, transferir?: Transferable[]): void;
  addEventListener(tipo: "message", f: (e: MessageEvent<unknown>) => void): void;
  addEventListener(tipo: "error", f: (e: Event) => void): void;
  terminate(): void;
}

export interface FrameFraude {
  readonly ancho: number;
  readonly alto: number;
  readonly pixeles: Uint8ClampedArray;
}

export interface PeticionFraude {
  readonly frames: readonly FrameFraude[];
  readonly cuadrilatero: readonly (readonly [number, number])[];
  readonly tipo: "amarilla" | "digital";
  readonly datos: DatosDocumento;
  /** Instante ISO del reloj del dispositivo. */
  readonly ahora: string;
}

export interface ClienteFraude {
  evaluar(p: PeticionFraude): Promise<SenalRiesgo | null>;
  terminar(): void;
}

/** FRA-17: texto en español de cada motivo. */
export const MOTIVOS_RIESGO: Readonly<Record<CodigoMotivo, string>> = Object.freeze({
  pantalla: "Parece una foto de una pantalla",
  fotocopia: "Parece una fotocopia o una impresión",
  recorte: "La forma o las esquinas no son las de una tarjeta",
  edicion: "Parece una imagen editada",
  inconsistencia: "Los datos leídos no son coherentes",
});

/** Worker real; Vite lo emite como `assets/fraude.worker-<hash>.js`. */
export function nuevoWorkerFraude(): Worker {
  return new Worker(new URL("./fraude.worker.ts", import.meta.url), { type: "module" });
}

const esSenal = (x: unknown): x is SenalRiesgo => {
  const s = x as Partial<SenalRiesgo> | null;
  return typeof s === "object" && s !== null && s.version === 1 && typeof s.puntaje === "number" && Array.isArray(s.motivos) && typeof s.nivel === "string";
};

export function crearClienteFraude(fabrica: () => PuertoFraude): ClienteFraude {
  let puerto: PuertoFraude | null = null;
  const pendientes = new Map<number, (s: SenalRiesgo | null) => void>();
  let siguiente = 1;

  const descartar = () => {
    puerto?.terminate();
    puerto = null;
    for (const r of pendientes.values()) r(null);
    pendientes.clear();
  };

  const obtener = (): PuertoFraude => {
    if (puerto !== null) return puerto;
    const p = fabrica();
    p.addEventListener("message", (e) => {
      const d = e.data as { tipo?: unknown; id?: unknown; senal?: unknown } | null;
      if (typeof d !== "object" || d === null || d.tipo !== "senal" || typeof d.id !== "number") return;
      const r = pendientes.get(d.id);
      pendientes.delete(d.id);
      r?.(esSenal(d.senal) ? d.senal : null);
    });
    p.addEventListener("error", () => {
      if (puerto === p) descartar();
    });
    puerto = p;
    return p;
  };

  return {
    evaluar(pet) {
      const p = obtener();
      const id = siguiente++;
      const frames = pet.frames.map((f) => ({ ancho: f.ancho, alto: f.alto, pixeles: new Uint8ClampedArray(f.pixeles).buffer }));
      return new Promise((resolver) => {
        const reloj = setTimeout(() => {
          if (pendientes.has(id)) descartar();
        }, TIEMPO_MAXIMO_FRAUDE_MS);
        pendientes.set(id, (s) => {
          clearTimeout(reloj);
          resolver(s);
        });
        p.postMessage(
          {
            tipo: "evaluar",
            id,
            frames,
            cuadrilatero: pet.cuadrilatero.map(([x, y]) => ({ x, y })),
            tipoDocumento: pet.tipo,
            datos: pet.datos,
            ahora: pet.ahora,
          },
          frames.map((f) => f.pixeles),
        );
      });
    },
    terminar: descartar,
  };
}

/** Tipo y datos de la señal a partir de la lectura; `null` si no es una cédula (FRA-20). */
export function datosParaFraude(lectura: { tipo: string; tipoDocumento?: string; resultado: unknown }): { tipo: "amarilla" | "digital"; datos: DatosDocumento } | null {
  if (lectura.tipoDocumento !== undefined && lectura.tipoDocumento !== "cedula-ciudadania") return null;
  const r = (typeof lectura.resultado === "object" && lectura.resultado !== null ? lectura.resultado : {}) as Record<string, unknown>;
  if (lectura.tipo === "pdf417") {
    const c = (typeof r.campos === "object" && r.campos !== null ? r.campos : {}) as Record<string, unknown>;
    const pdf417: Record<string, string> = {};
    if (typeof c.numeroDocumento === "string") pdf417.nuip = c.numeroDocumento;
    if (typeof c.fechaNacimiento === "string") pdf417.fechaNacimiento = c.fechaNacimiento;
    return { tipo: "amarilla", datos: Object.keys(pdf417).length > 0 ? { pdf417 } : {} };
  }
  if (lectura.tipo === "mrz") return { tipo: "digital", datos: Array.isArray(r.lineasCorregidas) ? { mrz: { lineas: r.lineasCorregidas } } : {} };
  return null;
}

/** Frames de vídeo del tamaño de la captura (la foto de alta resolución tiene otro tamaño), hasta 5. */
export function framesParaFraude<F extends FrameFraude & { readonly origen: string }>(frames: readonly F[], ancho: number, alto: number): F[] {
  return frames.filter((f) => f.origen === "video" && f.ancho === ancho && f.alto === alto).slice(0, MAX_FRAMES);
}

/**
 * FRA-21: la señal está apagada por defecto mientras los detectores no estén calibrados con el reverso; se activa con
 * la variable de compilación `VITE_FRAUDE=true` o con `?debug=1`.
 */
export function fraudeActivo(variable: string | undefined, busqueda: string): boolean {
  return variable === "true" || new URLSearchParams(busqueda).get("debug") === "1";
}
