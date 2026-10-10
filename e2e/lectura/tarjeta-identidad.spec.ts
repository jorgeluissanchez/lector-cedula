// otros-documentos, OD-34b "PWA sin marcar la casilla" y "PWA con autorización", y OD-35 "Enlaces solo con el
// parámetro" (tarea 6.3). Segunda compilación de la PWA con VITE_ADMITIR_TI=true en un temporal fuera del
// repositorio, servida por servidor-copia; vídeo sintético `ti-amarilla-1080p` (PERSONA_TI, 12 años el 2026-10-06).
// La compilación por defecto (webServer, puerto 4173) es la del parámetro apagado.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { campo, contenedor, conVideo, esperarPantalla, fijarFecha, iniciarCamara } from "./ayudas";
import { servirCopia, type ServidorCopia } from "./servidor-copia";

test.use(conVideo("ti-amarilla-1080p"));

const ETIQUETAS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const NUIP = "9999123456";
const CASILLA = "Soy el representante legal del menor y autorizo el tratamiento";
const ENLACE = /Autorización del representante legal/u;

async function graves(page: Page): Promise<string[]> {
  const r = await new AxeBuilder({ page }).withTags(ETIQUETAS).analyze();
  return r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id);
}

test.describe("tarjeta de identidad con VITE_ADMITIR_TI=true", () => {
  test.describe.configure({ mode: "serial", timeout: 300_000 });

  let compilacion: string;
  let servidor: ServidorCopia;

  test.beforeAll(async () => {
    test.setTimeout(600_000);
    compilacion = mkdtempSync(join(tmpdir(), "pwa-ti-"));
    const r = spawnSync("npm", ["run", "build", "-w", "apps/pwa", "--", "--outDir", compilacion, "--emptyOutDir"], {
      env: { ...process.env, VITE_ADMITIR_TI: "true", VITE_DEMO: "" },
      shell: process.platform === "win32",
      encoding: "utf8",
    });
    if (r.status !== 0) throw new Error(`la compilación con VITE_ADMITIR_TI=true falló:\n${r.stdout}\n${r.stderr}`);
    servidor = await servirCopia(compilacion);
  });

  test.afterAll(async () => {
    await servidor?.cerrar();
    if (compilacion !== undefined) rmSync(compilacion, { recursive: true, force: true });
  });

  async function hastaAutorizacion(page: Page): Promise<void> {
    await fijarFecha(page);
    await page.goto(servidor.url);
    await iniciarCamara(page);
    await esperarPantalla(page, "autorizacion-representante", 240_000);
  }

  test("OD-35 Enlaces solo con el parámetro: con VITE_ADMITIR_TI=true existe el enlace y la política enlaza la autorización", async ({ page, request }) => {
    await page.goto(servidor.url);
    await expect(page.getByRole("link", { name: ENLACE })).toBeVisible();
    const autorizacion = await request.get(`${servidor.url}/assets/autorizacion-representante-ti.html`);
    expect(autorizacion.status()).toBe(200);
    expect(await autorizacion.text()).toContain("Ley 1581 de 2012");
    const politica = await (await request.get(`${servidor.url}/assets/politica-tratamiento.html`)).text();
    expect(politica).toContain('<a href="/assets/autorizacion-representante-ti.html">autorización del representante legal</a>');
    expect(politica).not.toContain("URL-AUTORIZACION-TI");
  });

  test("OD-34b PWA sin marcar la casilla: Cancelar descarta los datos y vuelve a inicio; axe sin violaciones graves", async ({ page }) => {
    await hastaAutorizacion(page);
    await expect(page.getByRole("heading", { name: "Autorización del representante legal", level: 1 })).toBeVisible();
    const casilla = page.getByRole("checkbox", { name: CASILLA });
    await expect(casilla).not.toBeChecked();
    await expect(page.getByRole("button", { name: "Continuar" })).toBeDisabled();
    // Ningún campo del documento antes de la autorización (OD-34b); no se piden datos del representante.
    await expect(page.locator("dd[data-campo]")).toHaveCount(0);
    await expect(page.getByRole("textbox")).toHaveCount(0);
    expect(await page.locator("body").innerText()).not.toContain(NUIP);
    expect(await graves(page)).toStrictEqual([]);
    await page.getByRole("button", { name: "Cancelar" }).click();
    await esperarPantalla(page, "inicio");
    await expect(page.locator("dd[data-campo]")).toHaveCount(0);
    const texto = await page.locator("body").innerText();
    expect(texto).not.toContain(NUIP);
    await expect(page.getByRole("heading", { name: "Tarjeta de identidad", exact: true })).toHaveCount(0);
    expect(await page.content()).not.toContain(NUIP);
  });

  test("OD-34b PWA con autorización: marcar la casilla y Continuar muestra Tarjeta de identidad", async ({ page }) => {
    await hastaAutorizacion(page);
    await page.getByRole("checkbox", { name: CASILLA }).check();
    await page.getByRole("button", { name: "Continuar" }).click();
    await esperarPantalla(page, "resultado");
    await expect(contenedor(page)).toHaveAttribute("data-tipo-documento", "tarjeta-identidad");
    await expect(page.getByRole("heading", { name: "Tarjeta de identidad", exact: true })).toBeVisible();
    await expect(campo(page, "Número de documento")).toHaveText(NUIP);
  });
});

test.describe("compilación por defecto (VITE_ADMITIR_TI apagado)", () => {
  // Vídeo `ti-amarilla-1080p` por el test.use de nivel superior: Playwright no admite launchOptions por describe.
  test("OD-31 (OFF-24 sin cambios): la TI de un menor se rechaza sin mostrar el número", async ({ page }) => {
    test.setTimeout(300_000);
    await fijarFecha(page);
    await page.goto("/");
    await iniciarCamara(page);
    await esperarPantalla(page, "error-lectura", 240_000);
    await expect(contenedor(page)).toHaveAttribute("data-error", "menor-de-edad");
    await expect(page.locator("dd[data-campo]")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Autorización del representante legal", level: 1 })).toHaveCount(0);
    expect(await page.locator("body").innerText()).not.toContain(NUIP);
    expect(await page.content()).not.toContain(NUIP);
  });

  test("OD-35 Enlaces solo con el parámetro: sin el parámetro la política no enlaza la autorización ni deja el marcador", async ({ request, baseURL }) => {
    const politica = await (await request.get(`${baseURL}/assets/politica-tratamiento.html`)).text();
    expect(politica).toContain("autorización del representante legal");
    expect(politica).not.toContain("autorizacion-representante-ti.html");
    expect(politica).not.toContain("URL-AUTORIZACION-TI");
    // vite preview responde index.html a rutas inexistentes: la página de la autorización no se emitió.
    expect(await (await request.get(`${baseURL}/assets/autorizacion-representante-ti.html`)).text()).not.toContain("Ley 1581 de 2012");
  });
});
