/**
 * Umbrales calibrables de CAL-08 (design.md, decisión 5). Valores provisionales documentados en
 * `docs/decisiones/2026-10-06-umbrales-calidad-captura.md`; cambiar uno es un cambio OpenSpec.
 */

export interface Umbrales {
  readonly laplacianoDesenfocado: number;
  readonly laplacianoNitido: number;
  readonly luminanciaSaturada: number;
  readonly fraccionSaturadaMax: number;
  readonly componenteSaturadoMax: number;
  readonly luminanciaOscura: number;
  readonly fraccionOscuraMax: number;
  readonly mediaNegra: number;
  readonly mediaOscuraOk: number;
  readonly mediaClaraOk: number;
  readonly mediaBlanca: number;
  readonly ratioMinimo: number;
  readonly ratioOk: number;
  readonly umbralListo: number;
  readonly framesConsecutivos: number;
  readonly intervaloMinimoMs: number;
}

export const UMBRALES_POR_DEFECTO: Readonly<Umbrales> = Object.freeze({
  laplacianoDesenfocado: 40,
  laplacianoNitido: 200,
  luminanciaSaturada: 250,
  fraccionSaturadaMax: 0.05,
  componenteSaturadoMax: 0.02,
  luminanciaOscura: 5,
  fraccionOscuraMax: 0.25,
  mediaNegra: 20,
  mediaOscuraOk: 60,
  mediaClaraOk: 200,
  mediaBlanca: 240,
  ratioMinimo: 0.1,
  ratioOk: 0.3,
  umbralListo: 70,
  framesConsecutivos: 3,
  intervaloMinimoMs: 100,
});

export type CampoUmbral = keyof Umbrales;

export type ResultadoValidacion =
  | { readonly ok: true; readonly umbrales: Readonly<Umbrales> }
  | { readonly ok: false; readonly codigo: "umbrales-invalidos"; readonly campos: readonly string[] };

/** Respuesta de una configuración (mensaje `configurado` del Worker, design.md, decisión 6). */
export type ResultadoConfiguracion =
  | { readonly ok: true }
  | { readonly ok: false; readonly codigo: "umbrales-invalidos"; readonly campos: readonly string[] };

const entero = (min: number, max: number) => (v: number) => Number.isInteger(v) && v >= min && v <= max;
const rango = (min: number, max: number) => (v: number) => v >= min && v <= max;
const fraccion = (v: number) => v > 0 && v <= 1;

/** Regla de cada campo (escenario "Reglas de validez"); antes se exige un número finito. */
const REGLAS: Readonly<Record<CampoUmbral, (v: number) => boolean>> = {
  luminanciaSaturada: entero(0, 255),
  luminanciaOscura: entero(0, 255),
  mediaNegra: rango(0, 255),
  mediaOscuraOk: rango(0, 255),
  mediaClaraOk: rango(0, 255),
  mediaBlanca: rango(0, 255),
  fraccionSaturadaMax: fraccion,
  componenteSaturadoMax: fraccion,
  fraccionOscuraMax: fraccion,
  ratioMinimo: fraccion,
  ratioOk: fraccion,
  laplacianoDesenfocado: (v) => v >= 0,
  laplacianoNitido: () => true,
  umbralListo: entero(0, 100),
  framesConsecutivos: entero(1, 30),
  intervaloMinimoMs: rango(100, 200),
};

/** Relaciones de orden estrictas que deben cumplirse tras combinar con los vigentes. */
const RELACIONES: readonly (readonly CampoUmbral[])[] = [
  ["laplacianoDesenfocado", "laplacianoNitido"],
  ["mediaNegra", "mediaOscuraOk", "mediaClaraOk", "mediaBlanca"],
  ["ratioMinimo", "ratioOk"],
];

function esCampo(clave: string): clave is CampoUmbral {
  return Object.hasOwn(REGLAS, clave);
}

function invalido(campos: Iterable<string>): ResultadoValidacion {
  return { ok: false, codigo: "umbrales-invalidos", campos: [...new Set(campos)].sort((a, b) => a.localeCompare(b, "en")) };
}

/**
 * Valida una configuración parcial contra los umbrales vigentes. Pura: no modifica la entrada ni los vigentes.
 * Una entrada que no es un objeto simple se rechaza con `campos` vacío.
 */
export function validarUmbrales(parcial: unknown, vigentes: Readonly<Umbrales>): ResultadoValidacion {
  if (typeof parcial !== "object" || parcial === null || Array.isArray(parcial)) return invalido([]);
  const malos: string[] = [];
  const combinados: Record<CampoUmbral, number> = { ...vigentes };
  const presentes = new Set<string>();
  for (const clave of Object.keys(parcial)) {
    presentes.add(clave);
    const valor: unknown = (parcial as Record<string, unknown>)[clave];
    if (!esCampo(clave)) malos.push(clave);
    else if (typeof valor !== "number" || !Number.isFinite(valor) || !REGLAS[clave](valor)) malos.push(clave);
    else combinados[clave] = valor;
  }
  for (const relacion of RELACIONES) {
    const ordenada = relacion.every((campo, i) => i === 0 || combinados[relacion[i - 1] as CampoUmbral] < combinados[campo]);
    if (!ordenada) malos.push(...relacion.filter((campo) => presentes.has(campo)));
  }
  return malos.length > 0 ? invalido(malos) : { ok: true, umbrales: Object.freeze(combinados) };
}

export interface ConfiguracionUmbrales {
  /** Umbrales vigentes (congelados). */
  readonly umbrales: Readonly<Umbrales>;
  /** Sustituye de forma parcial; si la configuración es inválida, no cambia nada. */
  configurar(parcial: unknown): ResultadoConfiguracion;
}

/** Umbrales vigentes con sustitución parcial en tiempo de ejecución (CAL-08). */
export function crearConfiguracionUmbrales(iniciales: Readonly<Umbrales> = UMBRALES_POR_DEFECTO): ConfiguracionUmbrales {
  let vigentes = iniciales;
  return {
    get umbrales() {
      return vigentes;
    },
    configurar(parcial) {
      const r = validarUmbrales(parcial, vigentes);
      if (!r.ok) return r;
      vigentes = r.umbrales;
      return { ok: true };
    },
  };
}
