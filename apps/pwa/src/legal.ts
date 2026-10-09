/**
 * Textos legales de `inicio` y del resultado (pwa-lectura-offline, OFF-21). Se extraen en la compilación del Markdown
 * de docs/legal/publicacion/ (o, si falta, de los borradores de docs/legal/) y se pintan como texto (Preact escapa):
 * nunca como HTML. Los `[MARCADORES]` quedan visibles. La autorización vive solo en memoria de la página (OFF-11).
 */

/** Textos por defecto si la fuente de publicación no existe. */
export const TEXTO_AUTORIZACION = "Autorizo el tratamiento de mis datos para verificar mi identidad";
export const TEXTO_DESCARGO = "No es una verificación oficial de la Registraduría.";
/** OFF-21: alcance del producto, visible en `inicio`. */
export const TEXTO_ALCANCE = "Solo para cédulas de ciudadanía de mayores de edad.";
export const RUTA_POLITICA = "/assets/politica-tratamiento.html";
export const RUTA_TERMINOS = "/assets/terminos-de-uso.html";
/** OD-35: solo existe con `VITE_ADMITIR_TI=true`. */
export const RUTA_AUTORIZACION_TI = "/assets/autorizacion-representante-ti.html";
/** OD-34b: texto literal de la casilla del representante legal (sin marcar por defecto). */
export const TEXTO_CASILLA_REPRESENTANTE = "Soy el representante legal del menor y autorizo el tratamiento";

export interface Fragmento {
  readonly texto: string;
  readonly fuerte: boolean;
}

export interface Bloque {
  readonly tipo: "titulo" | "parrafo" | "item" | "cita";
  readonly texto: string;
}

/** Párrafos de la sección "Texto (variante PWA sola)" del borrador, sin la línea de botones. */
export function avisoCorto(md: string): string[] {
  const inicio = md.indexOf("## Texto (variante PWA sola)");
  if (inicio < 0) return [];
  const resto = md.slice(inicio).split("\n").slice(1);
  const fin = resto.findIndex((l) => l.startsWith("## "));
  return (fin < 0 ? resto : resto.slice(0, fin))
    .map((l) => l.trim())
    .filter((l) => l !== "" && !/^(\[[^\]]+\]\s*)+$/u.test(l));
}

/** Quita comentarios HTML, enlaces Markdown (deja su texto) y cursivas de una línea. */
function limpiar(linea: string): string {
  return linea
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, "$1")
    .replace(/(^|[^*])\*([^*]+)\*(?!\*)/gu, "$1$2")
    .replace(/`([^`]+)`/gu, "$1")
    .trim();
}

/** Bloques visibles de un texto de publicación: título, párrafos, viñetas y citas. Omite las líneas de solo enlaces o botones. */
export function bloquesMd(md: string): Bloque[] {
  const sinComentarios = md.replace(/<!--[\s\S]*?-->/gu, "");
  const bloques: Bloque[] = [];
  for (const cruda of sinComentarios.split("\n")) {
    const l = cruda.trim();
    if (l === "") continue;
    if (/^(\[[^\]]+\](\([^)]*\))?(\s*[·(][^[]*)?\s*)+$/u.test(l)) continue;
    const titulo = /^#{1,4}\s+(.*)$/u.exec(l);
    const item = /^[-*]\s+(.*)$/u.exec(l);
    if (titulo) bloques.push({ tipo: "titulo", texto: limpiar(titulo[1] ?? "") });
    else if (item) bloques.push({ tipo: "item", texto: limpiar(item[1] ?? "") });
    else if (l.startsWith(">")) bloques.push({ tipo: "cita", texto: limpiar(l.replace(/^>\s?/u, "")) });
    else bloques.push({ tipo: "parrafo", texto: limpiar(l) });
  }
  return bloques;
}

/** Texto de la casilla de autorización: la primera línea `- [ ] ...` sin negritas ni enlaces. */
export function autorizacionMd(md: string): string | null {
  const l = /^\s*-\s*\[ \]\s*(.*)$/mu.exec(md)?.[1];
  return l === undefined ? null : limpiar(l).replaceAll("**", "");
}

/** Descargo: la cita de la sección "## Descargo", sin negritas. */
export function descargoMd(md: string): string | null {
  const i = md.indexOf("## Descargo");
  if (i < 0) return null;
  const cita = md
    .slice(i)
    .split("\n")
    .find((l) => l.trim().startsWith(">"));
  return cita === undefined ? null : limpiar(cita.trim().replace(/^>\s?/u, "")).replaceAll("**", "");
}

/** Divide un texto por `**negritas**` para pintarlo como texto. */
export function fragmentos(parrafo: string): Fragmento[] {
  return parrafo
    .split("**")
    .map((texto, i) => ({ texto, fuerte: i % 2 === 1 }))
    .filter((f) => f.texto !== "");
}
