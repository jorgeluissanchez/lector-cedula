// CAL-10 (cadencia real), CAL-11 (auto-captura) y CAL-12 (feedback con cada vídeo) en la PWA.
import { expect, test, type Page } from "@playwright/test";
import { contenedor, esperarPantalla, iniciarCamara, medidasCalidad } from "./instrumentacion";

const estado = (page: Page) => page.getByRole("status");
const inicios = (page: Page) => page.evaluate(() => performance.getEntriesByName("calidad:frame", "measure").map((m) => m.startTime));

const FEEDBACK = [
  ["desenfocada-1080p", "Desenfocado, mantén la cámara quieta"],
  ["reflejo-1080p", "Hay reflejo, inclina la cédula"],
  ["sobreexpuesta-1080p", "Hay demasiada luz"],
  ["oscura-1080p", "Busca un lugar con más luz"],
  ["nitida-1080p", "Listo"],
] as const;

test.describe("calidad en vivo", { timeout: 60_000 }, () => {
  for (const [video, texto] of FEEDBACK) {
    test(`CAL-12 Feedback con cada vídeo: ${video} @video:${video}`, async ({ page }) => {
      await page.goto("/");
      await iniciarCamara(page);
      await expect(estado(page)).toHaveText(texto, { timeout: 30_000 });
      if (texto === "Listo") return;
      // El motivo se sostiene: durante 5 análisis más, todo texto que toma la región de estado es el mismo.
      await page.getByRole("status").evaluate((el) => {
        const textos: string[] = [];
        (window as unknown as { __textos: string[] }).__textos = textos;
        new MutationObserver(() => textos.push(el.textContent ?? "")).observe(el, { childList: true, characterData: true, subtree: true });
      });
      const antes = await medidasCalidad(page);
      await expect.poll(() => medidasCalidad(page), { timeout: 20_000 }).toBeGreaterThanOrEqual(antes + 5);
      const textos = await page.evaluate(() => (window as unknown as { __textos: string[] }).__textos);
      expect(textos.filter((t) => t !== texto)).toStrictEqual([]);
      await expect(estado(page)).toHaveText(texto, { timeout: 0 });
      await expect(contenedor(page)).toHaveAttribute("data-pantalla", "activo", { timeout: 0 });
    });
  }

  test("CAL-11 nitida-1080p llega a listo @video:nitida-1080p", async ({ page }) => {
    await page.goto("/");
    await iniciarCamara(page);
    await esperarPantalla(page, "listo", 30_000);
    await expect(estado(page)).toHaveText("Listo");
  });

  test("CAL-11 Vídeo desenfocado nunca llega a listo @video:desenfocada-1080p", async ({ page }) => {
    await page.goto("/");
    await iniciarCamara(page);
    await expect.poll(async () => (await inicios(page)).length, { timeout: 30_000 }).toBeGreaterThanOrEqual(30);
    await expect(contenedor(page)).toHaveAttribute("data-pantalla", "activo");
  });

  test("CAL-10 Cadencia real en el navegador @video:desenfocada-1080p", async ({ page }, info) => {
    test.skip(!info.project.name.endsWith("escritorio"), "El escenario se define en Chromium escritorio");
    await page.goto("/");
    await iniciarCamara(page);
    await expect.poll(async () => (await inicios(page)).length, { timeout: 30_000 }).toBeGreaterThanOrEqual(30);
    const t = (await inicios(page)).slice(0, 30);
    const intervalos = t.slice(1).map((v, i) => v - (t[i] ?? 0));
    expect(intervalos.filter((d) => d < 100)).toStrictEqual([]);
    expect((t[29] ?? Infinity) - (t[0] ?? 0)).toBeLessThanOrEqual(5800);
  });
});
