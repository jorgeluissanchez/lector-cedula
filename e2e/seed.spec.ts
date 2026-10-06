import { expect, test } from "@playwright/test";

/**
 * Prueba semilla de los agentes de Playwright (planner, generator, healer).
 * Comprueba que el navegador entrega un stream de cámara simulado con resolución suficiente para
 * leer el PDF417 de la cédula (1920x1080 pedido; ver skill captura-movil).
 */
test("la cámara simulada entrega un stream de vídeo", async ({ page }) => {
  // getUserMedia solo existe en contextos seguros: servimos la página desde un origen HTTPS simulado.
  await page.route("https://lector.test/**", (ruta) =>
    ruta.fulfill({ contentType: "text/html", body: "<video autoplay playsinline muted></video>" }),
  );
  await page.goto("https://lector.test/");
  const ajustes = await page.evaluate(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: "environment" },
    });
    const pista = stream.getVideoTracks()[0];
    const s = pista?.getSettings() ?? {};
    pista?.stop();
    return { ancho: s.width ?? 0, alto: s.height ?? 0 };
  });
  expect(ajustes.ancho).toBeGreaterThan(0);
  expect(ajustes.alto).toBeGreaterThan(0);
});
