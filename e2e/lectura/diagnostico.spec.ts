// OFF-29 Modo diagnóstico (pwa-lectura-offline): con ?debug=1 un panel de solo números y códigos; sin el parámetro no
// existe. Amarilla sintética de PERSONA_BASE (datos ficticios).
import { expect, test } from "@playwright/test";
import { contenedor, conVideo, fijarFecha, leer } from "./ayudas";

test.use(conVideo("amarilla-1080p"));

test.describe("diagnóstico", () => {
  test.describe.configure({ timeout: 180_000 });

  test("OFF-29 Sin parámetro", async ({ page }) => {
    await fijarFecha(page);
    await page.goto("/");
    await leer(page);
    await expect(contenedor(page)).toHaveAttribute("data-tipo", "pdf417");
    await expect(page.locator("[data-diagnostico]")).toHaveCount(0);
  });

  test("OFF-29 Con parámetro", async ({ page }) => {
    await fijarFecha(page);
    await page.goto("/?debug=1");
    await leer(page);
    const panel = page.locator("[data-diagnostico]");
    await expect(panel).toBeVisible();
    const texto = await panel.innerText();
    expect(texto).toContain("pdf417");
    expect(texto).toMatch(/\b\d+x\d+\b/u);
    for (const dato of ["9999123456", "PRUEBA", "FICTICIA"]) expect(texto).not.toContain(dato);
    await expect(panel.locator("img, canvas, video")).toHaveCount(0);
    expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toStrictEqual([0, 0]);
  });
});
