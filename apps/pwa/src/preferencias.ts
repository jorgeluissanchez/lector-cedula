/**
 * Preferencias de interfaz de la demo (demo-opciones, DOP-02 y DOP-02a): forma de la cámara, tarjeta de identidad y
 * señal de fraude. Una sola clave con tres valores enumerados; nunca datos leídos, imágenes ni resultados. Es la única
 * excepción de almacenamiento de la PWA (DOP-06): `tools/privacidad-check.mjs` y CAM-11 solo la admiten en este archivo.
 */

export type FormaCamara = "pantalla-completa" | "recuadro-horizontal" | "recuadro-vertical";

export interface Preferencias {
  readonly forma: FormaCamara;
  readonly tarjetaIdentidad: boolean;
  readonly fraude: boolean;
}

/** Subconjunto de `Storage` que se usa (inyectable en las pruebas). */
export interface AlmacenPreferencias {
  getItem(clave: string): string | null;
  setItem(clave: string, valor: string): void;
  removeItem(clave: string): void;
}

export const CLAVE_PREFERENCIAS = "lector-cedula:demo-opciones";

export const PREFERENCIAS_POR_OMISION: Preferencias = Object.freeze({ forma: "pantalla-completa", tarjetaIdentidad: false, fraude: false });

const FORMAS: ReadonlySet<string> = new Set<FormaCamara>(["pantalla-completa", "recuadro-horizontal", "recuadro-vertical"]);

/** `localStorage` del navegador, o `null` si no existe o su acceso lanza (modo privado, política del navegador). */
export function almacenNavegador(): AlmacenPreferencias | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function leerPreferencias(almacen: AlmacenPreferencias | null): Preferencias {
  let crudo: unknown = null;
  try {
    const texto = almacen?.getItem(CLAVE_PREFERENCIAS) ?? null;
    crudo = texto === null ? null : JSON.parse(texto);
  } catch {
    return PREFERENCIAS_POR_OMISION;
  }
  if (typeof crudo !== "object" || crudo === null || Array.isArray(crudo)) return PREFERENCIAS_POR_OMISION;
  const o = crudo as Record<string, unknown>;
  const forma = typeof o["forma"] === "string" && FORMAS.has(o["forma"]) ? (o["forma"] as FormaCamara) : PREFERENCIAS_POR_OMISION.forma;
  const tarjetaIdentidad = typeof o["tarjetaIdentidad"] === "boolean" ? o["tarjetaIdentidad"] : PREFERENCIAS_POR_OMISION.tarjetaIdentidad;
  const fraude = typeof o["fraude"] === "boolean" ? o["fraude"] : PREFERENCIAS_POR_OMISION.fraude;
  return { forma, tarjetaIdentidad, fraude };
}

export function guardarPreferencias(almacen: AlmacenPreferencias | null, p: Preferencias): void {
  const d = PREFERENCIAS_POR_OMISION;
  try {
    if (p.forma === d.forma && p.tarjetaIdentidad === d.tarjetaIdentidad && p.fraude === d.fraude) almacen?.removeItem(CLAVE_PREFERENCIAS);
    else almacen?.setItem(CLAVE_PREFERENCIAS, JSON.stringify({ forma: p.forma, tarjetaIdentidad: p.tarjetaIdentidad, fraude: p.fraude }));
  } catch {
    // Almacén lleno o bloqueado: la preferencia vale solo para esta visita.
  }
}
