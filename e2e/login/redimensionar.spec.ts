// SDK-62: al redimensionar el recuadro durante la captura la guía se recalcula sin reiniciar la cámara. Sin documento
// la fase se queda en activo y la guía es visible todo el tiempo.
import { expect, test } from "@playwright/test";
import { abrir, autorizarYEscanear, cajas, conVideo, dentro, fase } from "./ayudas";

test.use(conVideo("sin-documento-1080p"));

test("SDK-62 La guía sigue al recuadro sin reiniciar la cámara", async ({ page }) => {
  test.setTimeout(300_000);
  await abrir(page, "vertical");
  await autorizarYEscanear(page);
  await expect(page.locator('[data-prueba="guia"]')).toBeVisible({ timeout: 60_000 });
  const antes = await cajas(page);
  expect(antes.guia !== null && antes.video !== null && dentro(antes.guia, antes.video)).toBe(true);
  await page.locator('[data-prueba="recuadro"]').evaluate((el) => {
    (el as HTMLElement).style.width = "320px";
    (el as HTMLElement).style.height = "200px";
  });
  await expect.poll(async () => Math.round((await cajas(page)).video?.width ?? 0)).toBe(320);
  await expect
    .poll(async () => {
      const { video, guia } = await cajas(page);
      return guia !== null && video !== null && dentro(guia, video) && Math.abs(guia.height - (antes.guia?.height ?? 0)) > 1;
    })
    .toBe(true);
  await expect(fase(page)).toHaveText(/^(activo|listo)$/u);
});
