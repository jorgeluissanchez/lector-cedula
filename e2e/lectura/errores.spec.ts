// OFF-13 "Tarjeta sin código legible", OFF-23 (error rápido y progreso) y OFF-26 (reintento silencioso) (pwa-lectura-offline).
import { expect, test } from "@playwright/test";
import { conVideo, contenedor, esperarPantalla, historial, iniciarCamara, registrarHistorial } from "./ayudas";

test.use(conVideo("tarjeta-ilegible-1080p"));

test.describe("errores de lectura", () => {
  test.describe.configure({ timeout: 120_000 });

  test("OFF-13 Tarjeta sin código legible, OFF-23 Error rápido y OFF-26 Tarjeta ilegible", async ({ page }) => {
    await registrarHistorial(page);
    await page.goto("/");
    await iniciarCamara(page);
    await esperarPantalla(page, "leyendo", 30_000);
    await expect(page.locator("[data-segundos]")).toBeVisible();
    await expect.poll(() => page.locator("[data-segundos]").getAttribute("data-segundos").then(Number), { timeout: 10_000 }).toBeGreaterThan(0);
    const inicio = Date.now();
    await esperarPantalla(page, "error-lectura", 60_000);
    // OFF-26: reintentos hasta 20 s desde la primera lectura, más la última lectura (OFF-23: 15 s de OCR) y arranques.
    expect(Date.now() - inicio).toBeLessThan(45_000);
    const h = await historial(page);
    const primera = h.indexOf("leyendo");
    expect(h.indexOf("leyendo", h.indexOf("activo", primera))).toBeGreaterThan(primera);
    await expect(contenedor(page)).toHaveAttribute("data-error", "no-encontrado");
    await expect(page.getByText("No se encontró el código de la cédula ni la zona de lectura. Acerca el documento y evita reflejos.")).toBeVisible();
    await page.getByRole("button", { name: "Intentar de nuevo" }).click();
    await esperarPantalla(page, "activo");
  });
});
