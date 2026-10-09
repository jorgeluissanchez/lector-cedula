// SDK-37 Digital sin servidor (E(sin-servidor)); un vídeo por archivo.
import { expect, test } from "@playwright/test";
import { conVideo, fase, fijarFecha, leer, precargar } from "./ayudas";

test.use(conVideo("digital-1080p"));

test.describe("SDK-37 digital sin servidor", { timeout: 300_000 }, () => {
  test.describe.configure({ timeout: 300_000 });
  test("SDK-37 Digital sin servidor con la red cortada", async ({ page, context }) => {
    await fijarFecha(page);
    await page.goto("/");
    await precargar(page);
    await context.setOffline(true);
    expect(await leer(page)).toBe("resultado");
    await expect(page.locator('[data-prueba="contenido"]')).toHaveText("mrz-td1");
    await expect(page.locator('[data-prueba="nuip"]')).toHaveText("9999123456");
    await expect(fase(page)).toHaveText("resultado");
  });
});
