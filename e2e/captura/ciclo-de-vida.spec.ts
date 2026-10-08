// CAM-10: ciclo de vida de la cámara (listo, Cancelar, página oculta y reanudación).
import { expect, test } from "@playwright/test";
import { contenedor, esperarCuadros, esperarPantalla, estadosPistas, iniciarCamara, instrumentar, registro } from "./instrumentacion";

const todasTerminadas = (estados: string[]) => estados.length > 0 && estados.every((e) => e === "ended");

test.describe("ciclo de vida", { timeout: 60_000 }, () => {
  test.describe.configure({ timeout: 60_000 });
  test("CAM-10 Pistas detenidas en listo @video:nitida-1080p", async ({ page }) => {
    await instrumentar(page);
    await page.goto("/");
    await iniciarCamara(page);
    await esperarPantalla(page, "listo", 30_000);
    expect(todasTerminadas(await estadosPistas(page))).toBe(true);
    const conStream = await page.evaluate(() => [...document.querySelectorAll("video")].filter((v) => v.srcObject !== null).length);
    expect(conStream).toBe(0);
  });

  test("CAM-10 Cancelar @video:desenfocada-1080p", async ({ page }) => {
    await instrumentar(page);
    await page.goto("/");
    await iniciarCamara(page);
    await esperarPantalla(page, "activo");
    await page.getByRole("button", { name: "Cancelar" }).click();
    await expect(contenedor(page)).toHaveAttribute("data-pantalla", "inicio");
    expect(todasTerminadas(await estadosPistas(page))).toBe(true);
  });

  test("CAM-10 Página oculta y reanudación @video:desenfocada-1080p", async ({ page }) => {
    await instrumentar(page);
    await page.goto("/");
    await iniciarCamara(page);
    await esperarPantalla(page, "activo");
    await page.evaluate(() => window.__visibilidad("hidden"));
    await esperarPantalla(page, "pausado");
    expect(todasTerminadas(await estadosPistas(page))).toBe(true);
    await expect(page.getByText("Cámara en pausa")).toBeVisible();
    await page.evaluate(() => window.__visibilidad("visible"));
    // Ventana de 60 cuadros (unos 1 s): la página visible no reanuda sola ni pide la cámara.
    await esperarCuadros(page, 60);
    await expect(contenedor(page)).toHaveAttribute("data-pantalla", "pausado");
    expect((await registro(page)).llamadas).toHaveLength(1);
    expect(todasTerminadas(await estadosPistas(page))).toBe(true);
    await page.getByRole("button", { name: "Continuar" }).click();
    await esperarPantalla(page, "activo");
    expect((await registro(page)).llamadas).toHaveLength(2);
  });
});
