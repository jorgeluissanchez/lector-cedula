// OFF-20 Atribución de datos y licencias de terceros (pwa-lectura-offline; condiciones C1 a C3 del revisor de licencias).
import { expect, test, type Page } from "@playwright/test";
import { conVideo, esperarOfflineLista, esperarPantalla, esperarServiceWorker, leer, resultadoVisible } from "./ayudas";

test.use(conVideo("amarilla-1080p"));

const TEXTOS = ["DANE", "DIVIPOLA Códigos municipios", "gdxc-w37w", "Material adaptado: solo pares de códigos DIVIPOL-DIVIPOLA", "Registraduría Nacional del Estado Civil", "vh8b-jfhg", "AZERBAIYAN", "VIETNAM", "SINGAPUR", "88195", "88480", "se ofrece tal cual", "sin aval", "CC BY-SA 4.0", "MIT"];

async function comprobarPantalla(page: Page): Promise<void> {
  await esperarPantalla(page, "licencias");
  const texto = await page.locator("body").innerText();
  for (const t of TEXTOS) expect(texto, t).toContain(t);
  await expect(page.locator('a[href="https://creativecommons.org/licenses/by-sa/4.0/legalcode.es"]')).toHaveCount(1);
  await expect(page.locator('a[href="/assets/THIRD_PARTY_LICENSES.txt"]')).toHaveCount(1);
}

test.describe("licencias", () => {
  test.describe.configure({ timeout: 180_000 });

  test("OFF-20 Pantalla de licencias desde inicio y desde resultado", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Acerca de y licencias" }).click();
    await comprobarPantalla(page);
    await page.getByRole("button", { name: "Volver" }).click();
    await esperarPantalla(page, "inicio");
    const resultado = await leer(page);
    await page.getByRole("link", { name: "Fuentes: DANE y Registraduría (CC BY-SA 4.0)" }).click();
    await comprobarPantalla(page);
    await page.getByRole("button", { name: "Volver" }).click();
    await esperarPantalla(page, "resultado");
    expect(await resultadoVisible(page)).toBe(resultado);
  });

  test("OFF-20 Licencias sin conexión", async ({ page, context }) => {
    await page.goto("/");
    await esperarServiceWorker(page);
    await esperarOfflineLista(page);
    await context.setOffline(true);
    await page.reload();
    await page.getByRole("button", { name: "Acerca de y licencias" }).click();
    await comprobarPantalla(page);
    const r = await page.evaluate(async () => {
      const res = await fetch("/assets/THIRD_PARTY_LICENSES.txt");
      return { estado: res.status, texto: (await res.text()).slice(0, 200) };
    });
    expect(r.estado).toBe(200);
    expect(r.texto).toContain("Avisos de terceros");
  });
});
