// CAM-08 "Apariencia de la guía" y CAM-09 "Apariencia de las pantallas" (regresión visual, solo con VISUAL=1 dentro
// del contenedor mcr.microsoft.com/playwright:v1.63.0-noble; design.md, decisión 15). El <video> va enmascarado.
import { expect, test, type Page } from "@playwright/test";
import { esperarPantalla, iniciarCamara, instrumentar, medidasCalidad, regionEstado } from "./instrumentacion";

// El vídeo ocupa toda la pantalla y `mask` pinta encima de todo: se enmascara ocultándolo con CSS, de modo que la
// captura muestra la guía, la región de estado y los botones sobre un fondo fijo.
async function foto(page: Page, nombre: string): Promise<void> {
  await page.addStyleTag({ content: "video { visibility: hidden !important; }" });
  await expect(page).toHaveScreenshot(`${nombre}.png`);
}

test.describe("apariencia @visual", { timeout: 60_000 }, () => {
  test.describe.configure({ timeout: 60_000 });
  test.use({ serviceWorkers: "block" });
  test("CAM-08 Apariencia de la guía @visual @video:reflejo-1080p", async ({ page }) => {
    await page.goto("/");
    await iniciarCamara(page);
    await expect(regionEstado(page)).toHaveText("Hay reflejo, inclina la cédula", { timeout: 30_000 });
    // Congela el análisis: con el vídeo en pausa cada frame analizado es el mismo, y se esperan 3 análisis más para
    // que el texto quede estable antes de la captura.
    await page.locator("video").evaluate((v: HTMLVideoElement) => v.pause());
    const antes = await medidasCalidad(page);
    await expect.poll(() => medidasCalidad(page)).toBeGreaterThanOrEqual(antes + 3);
    await expect(regionEstado(page)).toHaveText("Hay reflejo, inclina la cédula", { timeout: 0 });
    await foto(page, "activo-reflejo");
  });

  test("CAM-09 Apariencia de inicio y leyendo @visual @video:nitida-1080p", async ({ page, context }) => {
    // OFF-19: `listo` es transitorio; se fotografía `leyendo` con el Worker lector retenido (su script nunca se sirve).
    // Sin service worker (serviceWorkers: "block" en este describe) para que la ruta de Playwright vea la petición.
    await context.route("**/assets/lector.worker-*.js", () => undefined);
    await page.goto("/");
    await foto(page, "inicio");
    await iniciarCamara(page);
    await esperarPantalla(page, "leyendo", 30_000);
    await foto(page, "leyendo");
  });

  test("CAM-09 Apariencia de error permiso-denegado @visual @video:nitida-1080p", async ({ page }) => {
    await instrumentar(page, { rechazarPrimera: true });
    await page.goto("/");
    await iniciarCamara(page);
    await esperarPantalla(page, "error");
    await foto(page, "error-permiso-denegado");
  });
});
