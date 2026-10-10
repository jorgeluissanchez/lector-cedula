/**
 * Ayudas de las E2E del ejemplo de login (sdk-integracion, SDK-62 y SDK-64; plan: e2e/planes/sdk-login.md). Vídeos
 * sintéticos de `npm run e2e:videos` (PERSONA_BASE). Código de prueba, nunca de producto.
 */
import { expect, type Page } from "@playwright/test";

const ARGS = ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"];

export const conVideo = (v: string) => ({ launchOptions: { args: [...ARGS, `--use-file-for-fake-video-capture=e2e/videos/sinteticos/${v}.y4m`] } });

export const URL_LOGIN = "http://localhost:4196/";

export const fase = (page: Page) => page.locator('[data-prueba="fase"]');

export const autorizacion = (page: Page) => page.locator('[data-prueba="autorizacion"]');

export const botonIniciar = (page: Page) => page.locator('[data-prueba="iniciar"]');

/** Marca la autorización del titular (SDK-64) y pulsa "Escanear cédula". */
export async function autorizarYEscanear(page: Page): Promise<void> {
  await autorizacion(page).check();
  await expect(botonIniciar(page)).toBeEnabled();
  await botonIniciar(page).click();
}

/**
 * Registra las peticiones de la página desde ya (llamar antes de `abrir`). Devuelve una función que comprueba que todas
 * fueron al origen del preview y que el navegador no guardó nada (SDK-64, "Sin red externa ni almacenamiento"; mismo
 * patrón que e2e/captura/privacidad.spec.ts).
 */
export function vigilarPrivacidad(page: Page): () => Promise<void> {
  const urls: string[] = [];
  page.on("request", (r) => urls.push(r.url()));
  return async () => {
    const origen = new URL(URL_LOGIN).origin;
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.filter((u) => !u.startsWith("data:") && !u.startsWith("blob:") && new URL(u).origin !== origen)).toStrictEqual([]);
    const almacen = await page.evaluate(async () => ({ local: localStorage.length, sesion: sessionStorage.length, idb: await indexedDB.databases() }));
    expect(almacen).toStrictEqual({ local: 0, sesion: 0, idb: [] });
  };
}

export interface Caja {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Emula un teléfono sostenido de pie: Chrome en Android entrega la pista rotada (alto > ancho) con las mismas
 * restricciones de CAM-03. La cámara falsa de Chromium de escritorio no rota: con `ideal` 1920x1080 sobre un archivo de
 * 1080x1920 recorta a 1080x1080 y deja la cédula de pie fuera del frame. Aquí solo se intercambian `width` y `height`
 * de las restricciones que pide el núcleo (lo que hace el sistema al rotar), sin tocar el resto de la petición.
 */
export async function telefonoDePie(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const medios = navigator.mediaDevices;
    const original = medios.getUserMedia.bind(medios);
    medios.getUserMedia = (c?: MediaStreamConstraints) => {
      const v = c?.video;
      if (typeof v !== "object" || v === null) return original(c);
      const { width, height, ...resto } = v;
      return original({ ...c, video: { ...resto, ...(height === undefined ? {} : { width: height }), ...(width === undefined ? {} : { height: width }) } });
    };
  });
}

/** Último tamaño de la pista visto por `leerYComprobar` durante la captura (SDK-63: la captura usa esta resolución). */
export async function tamanoPista(page: Page): Promise<[number, number] | null> {
  return page.evaluate(() => (window as unknown as { __pista?: [number, number] }).__pista ?? null);
}

export async function abrir(page: Page, recuadro: "vertical" | "horizontal"): Promise<void> {
  await page.clock.setFixedTime(new Date("2026-10-06T12:00:00-05:00"));
  await page.goto(`${URL_LOGIN}?recuadro=${recuadro}`);
  await expect(fase(page)).toHaveText("inicio");
}

export async function cajas(page: Page): Promise<{ video: Caja | null; guia: Caja | null }> {
  return { video: await page.locator('[data-prueba="video"]').boundingBox(), guia: await page.locator('[data-prueba="guia"]').boundingBox() };
}

export function dentro(g: Caja, v: Caja): boolean {
  return g.x >= v.x - 1 && g.y >= v.y - 1 && g.x + g.width <= v.x + v.width + 1 && g.y + g.height <= v.y + v.height + 1;
}

/** Muestrea en cada frame la última caja visible de la guía y del vídeo (la lectura puede terminar muy rápido). */
async function vigilarGuia(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __guia?: { g: DOMRect; v: DOMRect }; __pista?: [number, number] };
    const paso = (): void => {
      const g = document.querySelector('[data-prueba="guia"]') as HTMLElement | null;
      const v = document.querySelector('[data-prueba="video"]') as HTMLVideoElement | null;
      if (v !== null && v.videoWidth > 0) w.__pista = [v.videoWidth, v.videoHeight];
      if (g !== null && v !== null && getComputedStyle(g).display !== "none") w.__guia = { g: g.getBoundingClientRect(), v: v.getBoundingClientRect() };
      requestAnimationFrame(paso);
    };
    requestAnimationFrame(paso);
  });
}

async function ultimaGuia(page: Page): Promise<{ g: Caja; v: Caja } | null> {
  return page.evaluate(() => {
    const u = (window as unknown as { __guia?: { g: DOMRect; v: DOMRect } }).__guia;
    const c = (r: DOMRect) => ({ x: r.x, y: r.y, width: r.width, height: r.height });
    return u === undefined ? null : { g: c(u.g), v: c(u.v) };
  });
}

/**
 * Lee con el recuadro indicado y comprueba tamaño, guía, resultado, que el vídeo no se tocó y que no hubo red externa
 * ni almacenamiento. `comprobarPrivacidad` sale de `vigilarPrivacidad`, registrado antes de abrir la página.
 */
export async function leerYComprobar(page: Page, ancho: number, alto: number, vertical: boolean, comprobarPrivacidad: () => Promise<void>): Promise<void> {
  const consola: string[] = [];
  page.on("console", (m) => consola.push(m.text()));
  await vigilarGuia(page);
  await autorizarYEscanear(page);
  await expect(fase(page)).toHaveText("resultado", { timeout: 120_000 });
  await expect(page.locator('[data-prueba="nuip"]')).toHaveText("9999123456");
  // El recuadro no ocupa la pantalla: conserva su tamaño CSS y la página tiene contenido alrededor.
  const recuadro = await page.locator('[data-prueba="recuadro"]').boundingBox();
  expect([Math.round(recuadro?.width ?? 0), Math.round(recuadro?.height ?? 0)]).toStrictEqual([ancho, alto]);
  const viewport = page.viewportSize();
  expect((recuadro?.width ?? 0) * (recuadro?.height ?? 0)).toBeLessThan(0.5 * (viewport?.width ?? 1) * (viewport?.height ?? 1));
  await expect(page.locator("footer")).toHaveCount(1);
  // La guía se pintó dentro del vídeo con la orientación pedida.
  const u = await ultimaGuia(page);
  expect(u).not.toBeNull();
  const { g, v } = u as { g: Caja; v: Caja };
  expect(dentro(g, v)).toBe(true);
  expect(g.height > g.width).toBe(vertical);
  // El núcleo no cambió el estilo del vídeo (object-fit del integrador, sin estilos en línea).
  expect(await page.locator('[data-prueba="video"]').evaluate((el) => [getComputedStyle(el).objectFit, el.getAttribute("style")])).toStrictEqual(["cover", null]);
  for (const m of consola) expect(m).not.toContain("9999123456");
  await comprobarPrivacidad();
}
