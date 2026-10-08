// OFF-13 "Tarjeta sin código legible" y OFF-23 (error rápido y progreso) (pwa-lectura-offline).
import { expect, test } from "@playwright/test";
import { conVideo, contenedor, esperarPantalla, iniciarCamara } from "./ayudas";

test.use(conVideo("tarjeta-ilegible-1080p"));

test.describe("errores de lectura", () => {
  test.describe.configure({ timeout: 120_000 });

  test("OFF-13 Tarjeta sin código legible y OFF-23 Error rápido", async ({ page }) => {
    await page.goto("/");
    await iniciarCamara(page);
    await esperarPantalla(page, "leyendo", 30_000);
    await expect(page.locator("[data-segundos]")).toBeVisible();
    await expect.poll(() => page.locator("[data-segundos]").getAttribute("data-segundos").then(Number), { timeout: 10_000 }).toBeGreaterThan(0);
    const inicio = Date.now();
    await esperarPantalla(page, "error-lectura", 60_000);
    // Presupuesto de OFF-23 (15 s de OCR) más el arranque del Worker y el intento de PDF417.
    expect(Date.now() - inicio).toBeLessThan(45_000);
    await expect(contenedor(page)).toHaveAttribute("data-error", "no-encontrado");
    await expect(page.getByText("No se encontró el código de la cédula ni la zona de lectura. Acerca el documento y evita reflejos.")).toBeVisible();
    await page.getByRole("button", { name: "Intentar de nuevo" }).click();
    await esperarPantalla(page, "activo");
  });
});
