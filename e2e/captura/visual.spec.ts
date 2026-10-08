// CAM-08 "Apariencia de la guía" y CAM-09 "Apariencia de las pantallas" (regresión visual, solo con VISUAL=1 dentro
// del contenedor mcr.microsoft.com/playwright:v1.63.0-noble; design.md, decisión 15). El <video> va enmascarado.
import { expect, test, type Page } from "@playwright/test";
import { esperarPantalla, iniciarCamara, instrumentar } from "./instrumentacion";

// El vídeo ocupa toda la pantalla y `mask` pinta encima de todo: se enmascara ocultándolo con CSS, de modo que la
// captura muestra la guía, la región de estado y los botones sobre un fondo fijo.
async function foto(page: Page, nombre: string): Promise<void> {
  await page.addStyleTag({ content: "video { visibility: hidden !important; }" });
  await expect(page).toHaveScreenshot(`${nombre}.png`);
}

test.describe("apariencia @visual", { timeout: 60_000 }, () => {
  test("CAM-08 Apariencia de la guía @visual @video:reflejo-1080p", async ({ page }) => {
    await page.goto("/");
    await iniciarCamara(page);
    await expect(page.getByRole("status")).toHaveText("Hay reflejo, inclina la cédula", { timeout: 30_000 });
    await foto(page, "activo-reflejo");
  });

  test("CAM-09 Apariencia de inicio y listo @visual @video:nitida-1080p", async ({ page }) => {
    await page.goto("/");
    await foto(page, "inicio");
    await iniciarCamara(page);
    await esperarPantalla(page, "listo", 30_000);
    await foto(page, "listo");
  });

  test("CAM-09 Apariencia de error permiso-denegado @visual @video:nitida-1080p", async ({ page }) => {
    await instrumentar(page, { rechazarPrimera: true });
    await page.goto("/");
    await iniciarCamara(page);
    await esperarPantalla(page, "error");
    await foto(page, "error-permiso-denegado");
  });
});
