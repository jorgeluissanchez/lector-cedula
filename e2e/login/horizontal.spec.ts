// SDK-64: amarilla 1080p en el recuadro horizontal 320x200 y accesibilidad (axe) de las dos variantes del ejemplo.
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { abrir, autorizacion, botonIniciar, conVideo, leerYComprobar, URL_LOGIN, vigilarPrivacidad } from "./ayudas";

test.use(conVideo("amarilla-1080p"));

test("SDK-64 Lee la amarilla en el recuadro horizontal", async ({ page }) => {
  test.setTimeout(300_000);
  const privacidad = vigilarPrivacidad(page);
  await abrir(page, "horizontal");
  await leerYComprobar(page, 320, 200, false, privacidad);
});

test("SDK-64 Autorización del titular antes de escanear", async ({ page }) => {
  test.setTimeout(120_000);
  for (const recuadro of ["horizontal", "vertical"] as const) {
    await abrir(page, recuadro);
    await expect(autorizacion(page)).not.toBeChecked();
    await expect(botonIniciar(page)).toBeDisabled();
    await autorizacion(page).check();
    await expect(botonIniciar(page)).toBeEnabled();
    await autorizacion(page).uncheck();
    await expect(botonIniciar(page)).toBeDisabled();
    await expect(page.locator('[data-prueba="fase"]')).toHaveText("inicio");
  }
});

test("SDK-64 Accesibilidad del ejemplo (axe, sin violaciones serias ni críticas)", async ({ page }) => {
  test.setTimeout(120_000);
  for (const recuadro of ["horizontal", "vertical"] as const) {
    await page.goto(`${URL_LOGIN}?recuadro=${recuadro}`);
    await expect(page.locator('[data-prueba="fase"]')).toHaveText("inicio");
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toStrictEqual([]);
  }
});
