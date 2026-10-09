/**
 * Ayudas de las E2E del núcleo headless (sdk-integracion, tarea 3.4) sobre `examples/vanilla`. Vídeos sintéticos de
 * `npm run e2e:videos` (PERSONA_BASE). Código de prueba, nunca de producto.
 */
import { expect, type Page, type Request } from "@playwright/test";

export const ARGS_CAMARA = ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"];

export function conVideo(video: "amarilla-1080p" | "digital-1080p") {
  return { launchOptions: { args: [...ARGS_CAMARA, `--use-file-for-fake-video-capture=e2e/videos/sinteticos/${video}.y4m`] } };
}

export const fase = (page: Page) => page.locator('[data-prueba="fase"]');

export async function fijarFecha(page: Page): Promise<void> {
  await page.clock.setFixedTime(new Date("2026-10-06T12:00:00-05:00"));
}

/** Registra todas las peticiones de la página (y de sus Workers). */
export function registrarPeticiones(page: Page): Request[] {
  const lista: Request[] = [];
  page.on("request", (r) => lista.push(r));
  return lista;
}

export async function precargar(page: Page): Promise<void> {
  await page.locator('[data-prueba="precargar"]').click();
  await expect(page.locator('[data-prueba="motor"]')).toHaveText("listo", { timeout: 120_000 });
}

/** Inicia y espera `resultado` o `error`; devuelve la fase final. */
export async function leer(page: Page): Promise<string> {
  await page.locator('[data-prueba="iniciar"]').click();
  await expect(fase(page)).toHaveText(/^(resultado|error)$/u, { timeout: 120_000 });
  return (await fase(page).textContent()) ?? "";
}

/** Envuelve getUserMedia para conservar las pistas entregadas (para comprobar `readyState`). */
export async function vigilarPistas(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __pistas: MediaStreamTrack[] };
    w.__pistas = [];
    const md = navigator.mediaDevices;
    const original = md.getUserMedia.bind(md);
    md.getUserMedia = async (c) => {
      const s = await original(c);
      w.__pistas.push(...s.getTracks());
      return s;
    };
  });
}

export const estadosPistas = (page: Page): Promise<string[]> =>
  page.evaluate(() => (window as unknown as { __pistas: MediaStreamTrack[] }).__pistas.map((p) => p.readyState));
