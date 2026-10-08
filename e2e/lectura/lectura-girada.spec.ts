// OFF-10 con la digital girada 90 grados (pwa-lectura-offline, tarea 6.3).
import { expect, test } from "@playwright/test";
import { conVideo, fijarFecha, leer } from "./ayudas";

test.use(conVideo("digital-girada-90-1080p"));

test.describe("digital girada", { timeout: 300_000 }, () => {
  test.describe.configure({ timeout: 300_000 });
  test("OFF-10 Digital girada en E2E", async ({ page, playwright }, info) => {
    await fijarFecha(page);
    await page.goto("/");
    const girada = await leer(page, 240_000);
    // Referencia: la misma lectura con digital-1080p en otro navegador con ese vídeo.
    const recto = await playwright.chromium.launch(conVideo("digital-1080p").launchOptions);
    try {
      const { baseURL, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = info.project.use;
      const ctx = await recto.newContext({ baseURL, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, permissions: ["camera"] });
      const p2 = await ctx.newPage();
      await fijarFecha(p2);
      await p2.goto("/");
      expect(JSON.parse(girada)).toStrictEqual(JSON.parse(await leer(p2, 240_000)));
    } finally {
      await recto.close();
    }
  });
});
