// CAM-08 "Guía en pantalla": caja del elemento de la guía con object-fit: contain, tolerancia 1 px CSS.
import { expect, test } from "@playwright/test";
import { esperarPantalla, iniciarCamara } from "./instrumentacion";

const ESPERADAS: Record<"escritorio" | "pixel", { x: number; y: number; width: number; height: number }> = {
  escritorio: { x: 126.67, y: 36, width: 1027.33, height: 648 },
  pixel: { x: 40.77, y: 315.21, width: 330.67, height: 208.57 },
};

test.describe("guía de encuadre", { timeout: 60_000 }, () => {
  test.describe.configure({ timeout: 60_000 });
  // El vídeo desenfocado tiene el mismo tamaño que nitida-1080p y mantiene la pantalla en activo para medir sin carrera.
  test("CAM-08 Guía en pantalla @video:desenfocada-1080p", async ({ page }, info) => {
    const dispositivo = info.project.name.endsWith("pixel") ? "pixel" : "escritorio";
    await page.goto("/");
    await iniciarCamara(page);
    await esperarPantalla(page, "activo");
    const guia = page.locator(".guia");
    await expect(guia).toHaveAttribute("aria-hidden", "true");
    const esperada = ESPERADAS[dispositivo];
    await expect.poll(async () => {
      const c = await guia.boundingBox();
      if (c === null) return false;
      return (["x", "y", "width", "height"] as const).every((k) => Math.abs(c[k] - esperada[k]) <= 1);
    }).toBe(true);
  });
});
