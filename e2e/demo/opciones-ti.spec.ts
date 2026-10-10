// demo-opciones, DOP-04a: la tarjeta de identidad desde el panel de la demo con `ti-amarilla-1080p` (PERSONA_TI, 12 años
// el 2026-10-06). La pantalla `autorizacion-representante` (OD-34b) y la retención en memoria no cambian.
import { expect, test, type Page } from "@playwright/test";
import { abrirDemo, abrirPanel, almacenamiento, CLAVE, contenedor, conVideo, esperarPantalla, graves, iniciarCamara, NUIP, TEXTOS } from "./ayudas-opciones";

test.use(conVideo("ti-amarilla-1080p"));

const CASILLA = "Soy el representante legal del menor y autorizo el tratamiento";
const ENLACE = /Autorización del representante legal/u;

async function hastaAutorizacion(page: Page): Promise<void> {
  await abrirDemo(page);
  const r = await abrirPanel(page);
  await r.getByRole("checkbox", { name: TEXTOS.ti }).check();
  // El enlace a la autorización aparece en inicio en cuanto la TI está activa.
  await expect(page.getByRole("link", { name: ENLACE })).toBeVisible();
  await iniciarCamara(page);
  await esperarPantalla(page, "autorizacion-representante", 240_000);
}

test.describe("tarjeta de identidad desde el panel de la demo", () => {
  test.describe.configure({ timeout: 300_000 });

  test("DOP-04a TI encendida desde el panel, sin autorizar", async ({ page }) => {
    await hastaAutorizacion(page);
    await expect(page.getByRole("heading", { name: "Autorización del representante legal", level: 1 })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: CASILLA })).not.toBeChecked();
    await expect(page.getByRole("button", { name: "Continuar" })).toBeDisabled();
    await expect(page.locator("dd[data-campo]")).toHaveCount(0);
    expect(await page.locator("body").innerText()).not.toContain(NUIP);
    expect(await graves(page)).toStrictEqual([]);
    await page.getByRole("button", { name: "Cancelar" }).click();
    await esperarPantalla(page, "inicio");
    await expect(page.locator("dd[data-campo]")).toHaveCount(0);
    expect(await page.content()).not.toContain(NUIP);
    const a = await almacenamiento(page);
    expect(a.claves).toStrictEqual([CLAVE]);
    expect(a.valor).toBe('{"forma":"pantalla-completa","tarjetaIdentidad":true,"fraude":false}');
  });

  test("DOP-04a TI encendida desde el panel, con autorización", async ({ page }) => {
    await hastaAutorizacion(page);
    await page.getByRole("checkbox", { name: CASILLA }).check();
    await page.getByRole("button", { name: "Continuar" }).click();
    await esperarPantalla(page, "resultado");
    await expect(contenedor(page)).toHaveAttribute("data-tipo-documento", "tarjeta-identidad");
  });

  test("DOP-04a sin la TI del panel, la demo rechaza al menor como hoy", async ({ page }) => {
    await abrirDemo(page);
    await iniciarCamara(page);
    await esperarPantalla(page, "error-lectura", 240_000);
    await expect(contenedor(page)).toHaveAttribute("data-error", "menor-de-edad");
    await expect(page.locator("dd[data-campo]")).toHaveCount(0);
    expect(await page.content()).not.toContain(NUIP);
  });
});
