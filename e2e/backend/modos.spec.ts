// motor-backend-embebido 1.5 y sdk-integracion B.7 (plan: e2e/planes/sdk-backend-propio.md): front React del ejemplo
// Express con el backend real en proceso, en cada modo. Cámara simulada con la amarilla sintética (PERSONA_BASE).
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Request } from "@playwright/test";

const BASE = "http://localhost:4195/";

function peticionesBackend(page: Page): Request[] {
  const lista: Request[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).pathname === "/api/cedula") lista.push(r);
  });
  return lista;
}

async function esperarResultado(page: Page): Promise<void> {
  await expect(page.locator('[data-prueba="fase"]')).toHaveText("resultado", { timeout: 180_000 });
  await expect(page.locator('[data-prueba="nuip"]')).toHaveText("9999123456");
}

function vigilarConsola(page: Page): string[] {
  const mensajes: string[] = [];
  page.on("console", (m) => mensajes.push(m.text()));
  page.on("pageerror", (e) => mensajes.push(e.message));
  return mensajes;
}

/**
 * Playwright no expone los cuerpos multipart con Blob: se registran las claves del FormData de cada fetch a
 * /api/cedula desde la página (solo nombres de campo, nunca valores).
 */
async function vigilarCampos(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __campos: string[][] };
    w.__campos = [];
    const original = window.fetch.bind(window);
    window.fetch = (entrada, init) => {
      if (String(entrada).includes("/api/cedula") && init?.body instanceof FormData) w.__campos.push([...init.body.keys()]);
      return original(entrada, init);
    };
  });
}

const campos = (page: Page): Promise<string[][]> => page.evaluate(() => (window as unknown as { __campos: string[][] }).__campos);

test.describe("SDK-51 y MOT-15 front + backend propio por modo", () => {
  test.describe.configure({ timeout: 300_000 });

  test("MOT-15 Front y back de punta a punta (front-back estricta): confiable y 1 petición con cliente", async ({ page }) => {
    const consola = vigilarConsola(page);
    await vigilarCampos(page);
    const peticiones = peticionesBackend(page);
    await page.goto(BASE);
    await esperarResultado(page);
    await expect(page.locator('[data-prueba="confiable"]')).toHaveText("true");
    expect(peticiones).toHaveLength(1);
    expect(peticiones[0]?.method()).toBe("POST");
    expect(await campos(page)).toStrictEqual([["imagen", "cliente"]]);
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toStrictEqual([]);
    for (const m of consola) expect(m).not.toContain("9999123456");
  });

  test("SDK-56 modo back: el front no lee, 1 petición sin cliente y confiable", async ({ page }) => {
    await vigilarCampos(page);
    const peticiones = peticionesBackend(page);
    await page.goto(`${BASE}?modo=back`);
    await esperarResultado(page);
    await expect(page.locator('[data-prueba="confiable"]')).toHaveText("true");
    expect(peticiones).toHaveLength(1);
    expect(await campos(page)).toStrictEqual([["imagen"]]);
  });

  test("SDK-55 modo front: sin peticiones al backend y no confiable", async ({ page }) => {
    await vigilarCampos(page);
    const peticiones = peticionesBackend(page);
    await page.goto(`${BASE}?modo=front`);
    await esperarResultado(page);
    await expect(page.locator('[data-prueba="confiable"]')).toHaveText("false");
    expect(peticiones).toHaveLength(0);
  });

  test("SDK-57 front-back auto con dispositivo débil: valida en el back sin cliente", async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(Navigator.prototype, "deviceMemory", { get: () => 1, configurable: true }));
    await vigilarCampos(page);
    const peticiones = peticionesBackend(page);
    await page.goto(`${BASE}?modo=front-back&validacion=auto`);
    await esperarResultado(page);
    await expect(page.locator('[data-prueba="confiable"]')).toHaveText("true");
    expect(peticiones).toHaveLength(1);
    expect(await campos(page)).toStrictEqual([["imagen"]]);
  });

  test("SDK-59 y MOT-25 streaming desactivado: JSON único", async ({ page }) => {
    await vigilarCampos(page);
    const peticiones = peticionesBackend(page);
    await page.goto(`${BASE}?streaming=0`);
    await esperarResultado(page);
    await expect(page.locator('[data-prueba="confiable"]')).toHaveText("true");
    expect(peticiones).toHaveLength(1);
    const r = await peticiones[0]?.response();
    expect(r?.headers()["content-type"]).toBe("application/json; charset=utf-8");
  });
});
