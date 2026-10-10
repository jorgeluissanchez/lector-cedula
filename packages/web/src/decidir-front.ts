/**
 * SDK-57 (corrección del usuario, 2026-10-09): en `front-back` con `validacion: "auto"`, decide si el motor local lee.
 * Pura y total: nunca lanza; las señales ausentes o no numéricas no cuentan como débiles (Safari sin `deviceMemory`).
 * El back valida siempre (SDK-55); esta función solo decide si además lee el front.
 */

export interface DispositivoLector {
  /** `navigator.deviceMemory` (GB). */
  readonly memoriaGb?: number;
  /** `navigator.hardwareConcurrency`. */
  readonly nucleos?: number;
  /** WASM SIMD disponible. */
  readonly simd?: boolean;
  /** `navigator.connection.saveData`. */
  readonly ahorroDatos?: boolean;
  /** `navigator.connection.effectiveType`. */
  readonly tipoRed?: string;
  /** Micro-medición opcional (ms). */
  readonly microMedicionMs?: number;
}

export interface UmbralesAuto {
  readonly memoriaMinGb?: number;
  readonly nucleosMin?: number;
  readonly simdRequerido?: boolean;
  readonly ahorroDatosDebil?: boolean;
  readonly redesLentas?: readonly string[];
  /** Solo con este umbral cuenta la micro-medición. */
  readonly microMedicionMaxMs?: number;
}

export type MotivoFront = "potente" | "memoria-baja" | "pocos-nucleos" | "sin-simd" | "ahorro-datos" | "red-lenta" | "medicion-lenta";

export interface DecisionFront {
  readonly usarFront: boolean;
  readonly motivo: MotivoFront;
}

export const MOTIVOS_FRONT: readonly MotivoFront[] = ["potente", "memoria-baja", "pocos-nucleos", "sin-simd", "ahorro-datos", "red-lenta", "medicion-lenta"];

export const UMBRALES_FRONT = Object.freeze({
  memoriaMinGb: 4,
  nucleosMin: 4,
  simdRequerido: true,
  ahorroDatosDebil: true,
  redesLentas: Object.freeze(["slow-2g", "2g"]) as readonly string[],
});

const finito = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** `true` si `valor` y `minimo` son números y `valor < minimo`. */
const pordebajo = (valor: unknown, minimo: unknown): boolean => finito(valor) && finito(minimo) && valor < minimo;

export function decidirFront(dispositivo: DispositivoLector, umbrales: UmbralesAuto): DecisionFront {
  const d: DispositivoLector = typeof dispositivo === "object" && dispositivo !== null ? dispositivo : {};
  const u: UmbralesAuto = typeof umbrales === "object" && umbrales !== null ? umbrales : {};
  const memoriaMin = u.memoriaMinGb ?? UMBRALES_FRONT.memoriaMinGb;
  const nucleosMin = u.nucleosMin ?? UMBRALES_FRONT.nucleosMin;
  const lentas = Array.isArray(u.redesLentas) ? u.redesLentas : UMBRALES_FRONT.redesLentas;
  const debil = (motivo: MotivoFront): DecisionFront => ({ usarFront: false, motivo });
  if (pordebajo(d.memoriaGb, memoriaMin)) return debil("memoria-baja");
  if (pordebajo(d.nucleos, nucleosMin)) return debil("pocos-nucleos");
  if (d.simd === false && u.simdRequerido !== false) return debil("sin-simd");
  if (d.ahorroDatos === true && u.ahorroDatosDebil !== false) return debil("ahorro-datos");
  if (typeof d.tipoRed === "string" && lentas.includes(d.tipoRed)) return debil("red-lenta");
  if (finito(d.microMedicionMs) && finito(u.microMedicionMaxMs) && d.microMedicionMs > u.microMedicionMaxMs) return debil("medicion-lenta");
  return { usarFront: true, motivo: "potente" };
}

/** Módulo WASM mínimo con una instrucción SIMD (`v128`). */
const SIMD = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);

interface NavegadorSenales {
  readonly deviceMemory?: unknown;
  readonly hardwareConcurrency?: unknown;
  readonly connection?: { readonly saveData?: unknown; readonly effectiveType?: unknown } | null;
}

/** Lee las señales que el navegador expone (solo esas; nunca inventa valores). Se llama en `iniciar`, nunca al importar. */
export function leerDispositivo(
  nav: NavegadorSenales | null | undefined = (globalThis as { navigator?: NavegadorSenales }).navigator,
  validarWasm: (b: Uint8Array) => boolean = (b) => WebAssembly.validate(b as BufferSource),
): DispositivoLector {
  const d: { -readonly [K in keyof DispositivoLector]: DispositivoLector[K] } = {};
  if (finito(nav?.deviceMemory)) d.memoriaGb = nav.deviceMemory;
  if (finito(nav?.hardwareConcurrency)) d.nucleos = nav.hardwareConcurrency;
  try {
    d.simd = validarWasm(SIMD);
  } catch {
    // Sin WebAssembly: la señal no se expone.
  }
  const c = nav?.connection;
  if (typeof c?.saveData === "boolean") d.ahorroDatos = c.saveData;
  if (typeof c?.effectiveType === "string") d.tipoRed = c.effectiveType;
  return d;
}
