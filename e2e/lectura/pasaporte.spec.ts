// otros-documentos, OD-23 "Etiqueta y accesibilidad" (tarea 6.2) con el vídeo sintético `pasaporte-col-1080p`
// (PASAPORTE_COL de OD-01, persona ficticia) y OD-35 "Enlaces solo con el parámetro" en la compilación por defecto.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { campo, conVideo, contenedor, fijarFecha, leer } from "./ayudas";

test.use(conVideo("pasaporte-col-1080p"));

const ETIQUETAS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function graves(page: Page): Promise<string[]> {
  const r = await new AxeBuilder({ page }).withTags(ETIQUETAS).analyze();
  return r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id);
}

test.describe("pasaporte", () => {
  test.describe.configure({ timeout: 300_000 });

  test("OD-23 Etiqueta y accesibilidad: Pasaporte y AZ1234567, axe sin violaciones graves", async ({ page }) => {
    await fijarFecha(page);
    await page.goto("/");
    await leer(page, 240_000);
    await expect(contenedor(page)).toHaveAttribute("data-tipo-documento", "pasaporte");
    await expect(page.getByRole("heading", { name: "Pasaporte", exact: true })).toBeVisible();
    await expect(campo(page, "Número de documento")).toHaveText("AZ1234567");
    await expect(campo(page, "Apellidos")).toHaveText("PEREZ NUNEZ");
    await expect(campo(page, "Nombres")).toHaveText("ANA MARIA");
    await expect(campo(page, "País emisor")).toHaveText("COL");
    // OD-22a: el pasaporte no tiene RH; las líneas MRZ nunca se muestran (OFF-09).
    await expect(page.getByLabel("RH", { exact: true })).toHaveCount(0);
    expect(await page.locator("body").innerText()).not.toContain("<<");
    expect(await graves(page)).toStrictEqual([]);
  });

  test("OD-35 Enlaces solo con el parámetro: sin VITE_ADMITIR_TI no hay enlace a la autorización del representante", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Política de tratamiento" })).toBeVisible();
    await expect(page.getByRole("link", { name: /representante legal/u })).toHaveCount(0);
  });
});
