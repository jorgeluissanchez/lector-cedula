/**
 * Páginas legales estáticas de la PWA (pwa-lectura-offline, OFF-21): convierte el Markdown de docs/legal en HTML
 * propio (sin dependencias), escapando todo el texto. Se emiten en assets/ y entran en la precaché. Fuente:
 * docs/legal/publicacion/<archivo> si existe; si no, el borrador docs/legal/<archivo> con sus [MARCADORES].
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { autorizacionMd, avisoCorto, bloquesMd, descargoMd, TEXTO_AUTORIZACION, TEXTO_DESCARGO, type Bloque } from "./src/legal";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export function fuenteLegal(archivo: string, existe: (ruta: string) => boolean = (r) => existsSync(join(RAIZ, r))): string {
  const publicacion = `docs/legal/publicacion/${archivo}`;
  return existe(publicacion) ? publicacion : `docs/legal/${archivo}`;
}

export function leerLegal(archivo: string): string {
  return readFileSync(join(RAIZ, fuenteLegal(archivo)), "utf8");
}

const escapar = (t: string): string => t.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

function enLinea(t: string): string {
  return escapar(t).replace(/\*\*([^*]+)\*\*/gu, "<strong>$1</strong>");
}

export function mdAHtml(md: string, titulo: string): string {
  const salida: string[] = [];
  let lista: "ul" | "ol" | null = null;
  const cerrarLista = () => {
    if (lista !== null) salida.push(`</${lista}>`);
    lista = null;
  };
  for (const cruda of md.split("\n")) {
    const l = cruda.trimEnd();
    const encabezado = /^(#{1,4})\s+(.*)$/u.exec(l);
    const vineta = /^\s*[-*]\s+(.*)$/u.exec(l);
    const numerada = /^\s*\d+\.\s+(.*)$/u.exec(l);
    if (encabezado) {
      cerrarLista();
      const n = (encabezado[1] ?? "#").length;
      salida.push(`<h${n}>${enLinea(encabezado[2] ?? "")}</h${n}>`);
    } else if (vineta || numerada) {
      const tipo = vineta ? "ul" : "ol";
      if (lista !== tipo) {
        cerrarLista();
        salida.push(`<${tipo}>`);
        lista = tipo;
      }
      salida.push(`<li>${enLinea((vineta ?? numerada)?.[1] ?? "")}</li>`);
    } else if (l.startsWith(">")) {
      cerrarLista();
      salida.push(`<blockquote><p>${enLinea(l.replace(/^>\s?/u, ""))}</p></blockquote>`);
    } else if (l.trim() === "") {
      cerrarLista();
    } else {
      cerrarLista();
      salida.push(`<p>${enLinea(l)}</p>`);
    }
  }
  cerrarLista();
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapar(titulo)}</title>
<style>body{font-family:system-ui,sans-serif;background:#111;color:#fff;max-width:44rem;margin:0 auto;padding:16px;line-height:1.5}a{color:#93c5fd}blockquote{border-left:4px solid #4b5563;margin:8px 0;padding-left:12px;color:#d1d5db}</style>
</head>
<body>
<main>
<p><a href="/">Volver a la aplicación</a></p>
${salida.join("\n")}
</main>
</body>
</html>
`;
}

export interface TextosLegales {
  readonly aviso: readonly Bloque[];
  readonly autorizacion: string;
  readonly descargo: string;
}

/**
 * Textos de la app para la compilación (OFF-21): de docs/legal/publicacion/ (aviso-privacidad.md, autorizacion.md,
 * descargo-y-enlaces.md) o, si faltan, del borrador aviso-privacidad-app.md y los textos por defecto.
 */
export function textosLegales(existe: (ruta: string) => boolean = (r) => existsSync(join(RAIZ, r)), leer: (ruta: string) => string = (r) => readFileSync(join(RAIZ, r), "utf8")): TextosLegales {
  const pub = (a: string) => `docs/legal/publicacion/${a}`;
  const aviso: Bloque[] = existe(pub("aviso-privacidad.md"))
    ? bloquesMd(leer(pub("aviso-privacidad.md")))
    : avisoCorto(leer("docs/legal/aviso-privacidad-app.md")).map((texto) => ({ tipo: "parrafo", texto }));
  const autorizacion = (existe(pub("autorizacion.md")) ? autorizacionMd(leer(pub("autorizacion.md"))) : null) ?? TEXTO_AUTORIZACION;
  const descargo = (existe(pub("descargo-y-enlaces.md")) ? descargoMd(leer(pub("descargo-y-enlaces.md"))) : null) ?? TEXTO_DESCARGO;
  return { aviso, autorizacion, descargo };
}

/** OD-34b y OD-35: plantilla de la autorización del representante legal de un menor (texto de la pantalla y página). */
export const ARCHIVO_AUTORIZACION_TI = "autorizacion-representante-ti.md";

/**
 * Bloques de la autorización del representante (OD-34b), solo con `VITE_ADMITIR_TI=true`; si no, `null` (ni texto ni
 * enlace, OD-35). Encendido sin la plantilla en docs/legal/ (o en publicacion/), la compilación falla: no se admite un
 * menor sin el texto de la autorización.
 */
export function textosAutorizacionTi(admitirTi: boolean, existe: (ruta: string) => boolean = (r) => existsSync(join(RAIZ, r)), leer: (ruta: string) => string = (r) => readFileSync(join(RAIZ, r), "utf8")): readonly Bloque[] | null {
  if (!admitirTi) return null;
  const ruta = fuenteLegal(ARCHIVO_AUTORIZACION_TI, existe);
  if (!existe(ruta)) throw new Error(`VITE_ADMITIR_TI=true exige docs/legal/${ARCHIVO_AUTORIZACION_TI} (OD-35)`);
  return bloquesMd(leer(ruta));
}
