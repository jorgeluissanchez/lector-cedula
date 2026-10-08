/**
 * Ayudas de las E2E de lectura (pwa-lectura-offline, grupo 6). Vídeos sintéticos de `npm run e2e:videos`
 * (`amarilla-1080p`, `digital-1080p`, `digital-girada-90-1080p`, `nitida-1080p`); fecha fija 2026-10-06 en Bogotá.
 * Código de prueba, nunca de producto.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page } from "@playwright/test";

export type Video = "amarilla-1080p" | "digital-1080p" | "digital-girada-90-1080p" | "nitida-1080p";

export const ARGS_CAMARA = ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"];

/** Opciones de lanzamiento de Chromium con la cámara simulada alimentada por el vídeo dado. */
export function conVideo(video: Video) {
  return { launchOptions: { args: [...ARGS_CAMARA, `--use-file-for-fake-video-capture=e2e/videos/sinteticos/${video}.y4m`] } };
}

export const contenedor = (page: Page) => page.locator("[data-pantalla]");

/** Fecha de referencia de los escenarios (America/Bogota). */
export async function fijarFecha(page: Page): Promise<void> {
  await page.clock.setFixedTime(new Date("2026-10-06T12:00:00-05:00"));
}

/** Historial de valores de `data-pantalla` (convención de la spec, OFF-19), registrado por un MutationObserver. */
export async function registrarHistorial(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __historial: string[] };
    w.__historial = [];
    const anotar = () => {
      const v = document.querySelector("[data-pantalla]")?.getAttribute("data-pantalla") ?? null;
      if (v !== null && w.__historial.at(-1) !== v) w.__historial.push(v);
    };
    new MutationObserver(anotar).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-pantalla"] });
  });
}

export const historial = (page: Page) => page.evaluate(() => (window as unknown as { __historial: string[] }).__historial);

export async function esperarPantalla(page: Page, pantalla: string, timeout = 30_000): Promise<void> {
  await expect(contenedor(page)).toHaveAttribute("data-pantalla", pantalla, { timeout });
}

export async function esperarServiceWorker(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), { timeout: 60_000 }).toBe(true);
}

export async function esperarOfflineLista(page: Page): Promise<void> {
  await expect.poll(() => page.locator("[data-offline]").getAttribute("data-offline"), { timeout: 120_000 }).toBe("lista");
}

/** OFF-21: marca la casilla de autorización y pulsa "Iniciar cámara". */
export async function iniciarCamara(page: Page): Promise<void> {
  await page.getByRole("checkbox", { name: /^Autorizo/u }).check();
  await page.getByRole("button", { name: "Iniciar cámara" }).click();
}

/**
 * Resultado visible (convención de la spec): JSON de `data-tipo` y los campos `dd[data-campo]` de la pantalla
 * `resultado`. La compilación de producción no expone el resultado en ningún atributo.
 */
export async function resultadoVisible(page: Page): Promise<string> {
  const tipo = await contenedor(page).getAttribute("data-tipo");
  const campos = await page.locator("dd[data-campo]").evaluateAll((dds) => dds.map((d) => [d.getAttribute("data-campo"), d.textContent]));
  return JSON.stringify({ tipo, campos });
}

/** Pulsa "Iniciar cámara" y espera `resultado` (la lectura empieza sola, OFF-19). Devuelve el resultado visible. */
export async function leer(page: Page, timeout = 120_000): Promise<string> {
  await iniciarCamara(page);
  await esperarPantalla(page, "resultado", timeout);
  return resultadoVisible(page);
}

/** Valor de un campo del resultado por su etiqueta visible asociada (OFF-18). */
export const campo = (page: Page, etiqueta: string) => page.getByLabel(etiqueta, { exact: true });

/** Claves de todas las cachés, como rutas. */
export async function clavesCache(page: Page): Promise<{ nombres: string[]; rutas: string[] }> {
  return page.evaluate(async () => {
    const nombres = await caches.keys();
    const rutas: string[] = [];
    for (const n of nombres) for (const r of await (await caches.open(n)).keys()) rutas.push(new URL(r.url).pathname);
    return { nombres, rutas };
  });
}

export interface Manifiesto {
  readonly version: string;
  readonly entradas: readonly { readonly ruta: string; readonly bytes: number; readonly sha256: string }[];
}

/** Manifiesto de precaché de la compilación servida (apps/pwa/dist, la que sirve el webServer de Playwright). */
export function manifiesto(): Manifiesto {
  const dir = join("apps", "pwa", "dist", "assets");
  const nombre = readdirSync(dir).find((n) => /^precache-manifest\.[^/]+\.json$/u.test(n));
  if (nombre === undefined) throw new Error("sin manifiesto de precaché en apps/pwa/dist");
  return JSON.parse(readFileSync(join(dir, nombre), "utf8")) as Manifiesto;
}

/**
 * OFF-04 "Lectura servida desde caché": tras la primera visita, cada respuesta desde "Iniciar cámara" hasta
 * `resultado` viene del service worker (ninguna llega a la red ni al servidor de vista previa).
 */
export async function comprobarLecturaDesdeCache(page: Page, timeout = 240_000): Promise<void> {
  await page.goto("/");
  await esperarServiceWorker(page);
  await esperarOfflineLista(page);
  const respuestas: { url: string; sw: boolean }[] = [];
  page.context().on("response", (r) => respuestas.push({ url: r.url(), sw: r.fromServiceWorker() }));
  await leer(page, timeout);
  expect(respuestas.length).toBeGreaterThan(0);
  expect(respuestas.filter((r) => !r.sw).map((r) => r.url)).toStrictEqual([]);
}

/** OFF-05 y OFF-11: una caché, claves = rutas del manifiesto, y almacenamiento del navegador vacío. */
export async function comprobarNadaPersiste(page: Page): Promise<void> {
  const m = manifiesto();
  const { nombres, rutas } = await clavesCache(page);
  expect(nombres).toStrictEqual([`lector-${m.version}`]);
  expect(new Set(rutas)).toStrictEqual(new Set(m.entradas.map((e) => e.ruta)));
  expect(rutas.length).toBe(m.entradas.length);
  for (const r of rutas) expect(r).toMatch(/^\/(index\.html|manifest\.webmanifest|sw\.js|iconos\/[^/]+\.png|assets\/[^/]+)?$/u);
  const almacen = await page.evaluate(async () => ({
    local: localStorage.length,
    sesion: sessionStorage.length,
    idb: await indexedDB.databases(),
    cookie: document.cookie,
  }));
  expect(almacen).toStrictEqual({ local: 0, sesion: 0, idb: [], cookie: "" });
}
