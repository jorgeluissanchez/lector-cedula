// OFF-21 Aviso de privacidad, autorización y textos legales (pwa-lectura-offline).
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { textosLegales } from "../../apps/pwa/legal-paginas";
import { conVideo, esperarOfflineLista, esperarServiceWorker, leer, manifiesto } from "./ayudas";

test.use(conVideo("amarilla-1080p"));

/** Textos esperados: los mismos que la compilación extrae de docs/legal (publicación o borradores). */
const LEGAL = textosLegales();
const TITULO_AVISO = (LEGAL.aviso.find((b) => b.tipo === "titulo")?.texto ?? LEGAL.aviso[0]?.texto ?? "").replaceAll("**", "");

const casilla = (page: Page) => page.getByRole("checkbox", { name: /^Autorizo/u });
const boton = (page: Page) => page.getByRole("button", { name: "Iniciar cámara" });

async function graves(page: Page): Promise<string[]> {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  return r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id);
}

test.describe("legal", () => {
  test.describe.configure({ timeout: 180_000 });

  test("OFF-21 Casilla obligatoria y axe en inicio", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(TITULO_AVISO, { exact: true })).toBeVisible();
    await expect(casilla(page)).toHaveAccessibleName(LEGAL.autorizacion);
    await expect(page.getByText("Solo para cédulas de ciudadanía de mayores de edad.", { exact: true })).toBeVisible();
    await expect(casilla(page)).not.toBeChecked();
    await expect(boton(page)).toBeDisabled();
    await casilla(page).check();
    await expect(boton(page)).toBeEnabled();
    await casilla(page).uncheck();
    await expect(boton(page)).toBeDisabled();
    expect(await graves(page)).toStrictEqual([]);
  });

  test("OFF-21 Autorización no persistida", async ({ page, context }) => {
    await page.goto("/");
    await casilla(page).check();
    await page.reload();
    await expect(casilla(page)).not.toBeChecked();
    await expect(boton(page)).toBeDisabled();
    const almacen = await page.evaluate(async () => ({ l: localStorage.length, s: sessionStorage.length, idb: await indexedDB.databases(), c: document.cookie }));
    expect(almacen).toStrictEqual({ l: 0, s: 0, idb: [], c: "" });
    expect(await context.cookies()).toStrictEqual([]);
  });

  test("OFF-21 Descargo en el resultado", async ({ page }) => {
    await page.goto("/");
    await leer(page);
    await expect(page.locator("section.resultado").getByText(LEGAL.descargo, { exact: true })).toBeVisible();
    expect(LEGAL.descargo.toLowerCase()).toContain("no es una verificación oficial de la registraduría");
  });

  test("OFF-21 Textos legales sin conexión y axe en sus páginas", async ({ page, context }) => {
    const rutas = manifiesto().entradas.map((e) => e.ruta);
    expect(rutas).toContain("/assets/politica-tratamiento.html");
    expect(rutas).toContain("/assets/terminos-de-uso.html");
    await page.goto("/");
    await esperarServiceWorker(page);
    await esperarOfflineLista(page);
    await context.setOffline(true);
    await page.reload();
    for (const [enlace, titulo] of [
      ["Política de tratamiento", "Política de tratamiento de datos"],
      ["Términos de uso", "Términos de uso"],
    ] as const) {
      const respuesta = page.waitForResponse((r) => r.url().endsWith(".html"));
      await page.getByRole("link", { name: enlace, exact: true }).click();
      const r = await respuesta;
      expect(r.status()).toBe(200);
      expect(r.fromServiceWorker()).toBe(true);
      await expect(page).toHaveTitle(titulo);
      expect(await graves(page)).toStrictEqual([]);
      await page.goBack();
    }
  });
});
