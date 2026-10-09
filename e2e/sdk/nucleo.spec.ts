// SDK-30 Ciclo de vida y liberación con cámara simulada (E(nucleo)); SDK-04 sin peticiones al montar.
import { expect, test } from "@playwright/test";
import { conVideo, estadosPistas, fase, registrarPeticiones, vigilarPistas } from "./ayudas";

// Sin documento: la lectura nunca termina sola y la cámara sigue abierta en `activo` hasta cancelar o destruir.
test.use(conVideo("sin-documento-1080p"));

test.describe("SDK-30 núcleo en examples/vanilla", { timeout: 180_000 }, () => {
  test.describe.configure({ timeout: 180_000 });
  test("SDK-04 Sin peticiones al montar: crearLector sin iniciar no pide recursos", async ({ page }) => {
    const peticiones = registrarPeticiones(page);
    await page.goto("/");
    await expect(fase(page)).toHaveText("inicio");
    await page.waitForLoadState("networkidle");
    expect(peticiones.filter((r) => r.url().includes("/lector-cedula/"))).toStrictEqual([]);
  });

  test("SDK-30 Cancelar libera la cámara", async ({ page }) => {
    await vigilarPistas(page);
    await page.goto("/");
    await page.locator('[data-prueba="iniciar"]').click();
    await expect.poll(() => estadosPistas(page), { timeout: 60_000 }).toContain("live");
    await expect(fase(page)).not.toHaveText(/inicio|permiso/u);
    await page.locator('[data-prueba="cancelar"]').click();
    await expect(fase(page)).toHaveText("inicio");
    expect((await estadosPistas(page)).every((s) => s === "ended")).toBe(true);
  });

  test("SDK-30 Destruir libera la cámara", async ({ page }) => {
    await vigilarPistas(page);
    await page.goto("/");
    await page.locator('[data-prueba="iniciar"]').click();
    await expect.poll(() => estadosPistas(page), { timeout: 60_000 }).toContain("live");
    await page.locator('[data-prueba="destruir"]').click();
    await expect.poll(() => estadosPistas(page)).toStrictEqual(expect.arrayContaining(["ended"]));
    expect((await estadosPistas(page)).every((s) => s === "ended")).toBe(true);
  });
});
