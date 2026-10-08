// CAM-02 a CAM-07 en la PWA con la cámara simulada (plan: e2e/planes/captura-calidad-pwa.md).
import { expect, test } from "@playwright/test";
import { contenedor, esperarPantalla, iniciarCamara, instrumentar, registro } from "./instrumentacion";

const LITERAL = { audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } } };

test.describe("cámara", { timeout: 60_000 }, () => {
  test.describe.configure({ timeout: 60_000 });
  test("CAM-02 Origen HTTP que no es localhost @video:nitida-1080p", async ({ page, baseURL }) => {
    await instrumentar(page);
    await page.route("http://lector.test/**", async (ruta) => {
      const url = new URL(ruta.request().url());
      const r = await ruta.fetch({ url: `${baseURL}${url.pathname}` });
      await ruta.fulfill({ response: r });
    });
    await page.goto("http://lector.test/");
    await iniciarCamara(page);
    await esperarPantalla(page, "error");
    await expect(contenedor(page)).toHaveAttribute("data-error", "contexto-inseguro");
    await expect(page.getByText("La cámara solo funciona en una conexión segura (HTTPS).", { exact: true })).toBeVisible();
    expect((await registro(page)).llamadas).toHaveLength(0);
  });

  test("CAM-02 Navegador sin getUserMedia @video:nitida-1080p", async ({ page }) => {
    await instrumentar(page, { sinGetUserMedia: true });
    await page.goto("/");
    await iniciarCamara(page);
    await expect(contenedor(page)).toHaveAttribute("data-error", "sin-soporte");
    await expect(page.getByText("Este navegador no permite usar la cámara.", { exact: true })).toBeVisible();
  });

  test("CAM-03 Sin cámara antes de la acción del usuario @video:nitida-1080p", async ({ page }) => {
    await instrumentar(page);
    await page.goto("/", { waitUntil: "load" });
    expect((await registro(page)).llamadas).toHaveLength(0);
    await expect(contenedor(page)).toHaveAttribute("data-pantalla", "inicio");
  });

  test("CAM-03 Restricciones exactas @video:nitida-1080p", async ({ page }) => {
    await instrumentar(page);
    await page.goto("/");
    await iniciarCamara(page);
    await expect.poll(async () => (await registro(page)).llamadas.length).toBe(1);
    expect((await registro(page)).llamadas).toStrictEqual([LITERAL]);
  });

  // Con el vídeo desenfocado la pantalla se queda en activo (CAL-11) y el <video> se puede inspeccionar sin carrera.
  test("CAM-03 Vídeo en línea @video:desenfocada-1080p", async ({ page }) => {
    await page.goto("/");
    await iniciarCamara(page);
    await esperarPantalla(page, "activo");
    await expect(page.locator("video")).toHaveJSProperty("readyState", 4);
    await expect(page.locator("video")).toHaveCount(1);
    const v = await page.locator("video").evaluate((el: HTMLVideoElement) => {
      const s = el.srcObject as MediaStream | null;
      return {
        playsinline: el.hasAttribute("playsinline"),
        autoplay: el.hasAttribute("autoplay"),
        muted: el.muted,
        video: s?.getVideoTracks().length ?? -1,
        audio: s?.getAudioTracks().length ?? -1,
      };
    });
    expect(v).toStrictEqual({ playsinline: true, autoplay: true, muted: true, video: 1, audio: 0 });
  });

  test("CAM-04 Cámara de 1280x720 @video:nitida-720p", async ({ page }) => {
    await page.goto("/");
    await iniciarCamara(page);
    await expect(page.getByText("Tu cámara entrega 1280x720; se necesitan 1920x1080 para leer el código.", { exact: true })).toBeVisible();
    await esperarPantalla(page, "listo", 30_000);
  });

  test("CAM-04 Cámara de 1920x1080 @video:nitida-1080p", async ({ page }) => {
    await instrumentar(page);
    await page.goto("/");
    await iniciarCamara(page);
    await esperarPantalla(page, "activo");
    await expect.poll(async () => (await registro(page)).llamadas.length).toBe(1);
    await expect(page.locator("video")).toHaveJSProperty("readyState", 4);
    await expect(page.getByText("Tu cámara entrega")).toHaveCount(0);
  });

  test("CAM-05 Permiso denegado y reintento @video:desenfocada-1080p", async ({ page }) => {
    await instrumentar(page, { rechazarPrimera: true });
    await page.goto("/");
    await iniciarCamara(page);
    await expect(contenedor(page)).toHaveAttribute("data-error", "permiso-denegado");
    await expect(page.getByText("Permite el acceso a la cámara para continuar.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Reintentar" }).click();
    await esperarPantalla(page, "activo");
    expect((await registro(page)).llamadas).toHaveLength(2);
  });

  test("CAM-06 Pista con enfoque continuo @video:desenfocada-1080p", async ({ page }) => {
    await instrumentar(page, { capacidades: { focusMode: ["manual", "continuous"] } });
    await page.goto("/");
    await iniciarCamara(page);
    await esperarPantalla(page, "activo");
    expect((await registro(page)).applyConstraints).toStrictEqual([{ advanced: [{ focusMode: "continuous" }] }]);
  });

  for (const [nombre, capacidades] of [
    ["manual", { focusMode: ["manual"] }],
    ["sin getCapabilities", "ausente"],
  ] as const) {
    test(`CAM-06 Pista sin enfoque continuo (${nombre}) @video:desenfocada-1080p`, async ({ page }) => {
      await instrumentar(page, { capacidades });
      await page.goto("/");
      await iniciarCamara(page);
      await esperarPantalla(page, "activo");
      expect((await registro(page)).applyConstraints).toHaveLength(0);
    });
  }

  test("CAM-06 Rechazo de applyConstraints @video:desenfocada-1080p", async ({ page }) => {
    await instrumentar(page, { capacidades: { focusMode: ["continuous"] }, rechazarApplyConstraints: true });
    await page.goto("/");
    await iniciarCamara(page);
    await esperarPantalla(page, "activo");
    await expect.poll(async () => (await registro(page)).applyConstraints.length).toBe(1);
    await expect(contenedor(page)).toHaveAttribute("data-pantalla", "activo");
    await expect(page.locator("[data-error]")).toHaveCount(0);
  });

  test("CAM-07 Sin ImageCapture y sin carga de archivos @video:nitida-1080p", async ({ page }) => {
    await instrumentar(page, { rechazarPrimera: true });
    await page.goto("/");
    await expect(page.locator("input[type=file]")).toHaveCount(0);
    await iniciarCamara(page);
    await esperarPantalla(page, "error");
    await expect(page.locator("input[type=file]")).toHaveCount(0);
    await page.getByRole("button", { name: "Reintentar" }).click();
    await esperarPantalla(page, "listo", 30_000);
    await expect(page.locator("input[type=file]")).toHaveCount(0);
    expect((await registro(page)).imageCapture).toBe(0);
  });
});
