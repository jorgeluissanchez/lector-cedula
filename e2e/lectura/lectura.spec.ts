// OFF-09, OFF-14 y OFF-19 con la amarilla sintética (pwa-lectura-offline, tarea 6.3). Un vídeo por archivo: la cámara
// simulada se fija al lanzar Chromium. Mutante manual de la tarea: desactivar la máscara del NUIP.
import { expect, test } from "@playwright/test";
import { campo, contenedor, conVideo, esperarPantalla, fijarFecha, historial, iniciarCamara, leer, registrarHistorial } from "./ayudas";

test.use(conVideo("amarilla-1080p"));

test.describe("amarilla", { timeout: 180_000 }, () => {
  test.describe.configure({ timeout: 180_000 });
  test("OFF-09 Pantalla de resultado de la amarilla", async ({ page }) => {
    await fijarFecha(page);
    await page.goto("/");
    await leer(page);
    await expect(contenedor(page)).toHaveAttribute("data-tipo", "pdf417");
    await expect(campo(page, "Número de documento")).toHaveText("********56");
    const texto = await page.locator("body").innerText();
    for (const prohibido of ["9999123456", "PRUEBA", "FICTICIA"]) expect(texto).not.toContain(prohibido);
  });

  test("OFF-19 Transición automática", async ({ page }) => {
    // Sin page.clock: su reloj simulado sustituye a `performance` y ocultaría la medida.
    await registrarHistorial(page);
    await page.goto("/");
    await leer(page);
    const h = await historial(page);
    const orden = ["activo", "listo", "leyendo", "resultado"].map((p) => h.indexOf(p));
    expect(orden.every((i) => i >= 0)).toBe(true);
    expect([...orden].sort((a, b) => a - b)).toStrictEqual(orden);
    expect(await page.evaluate(() => performance.getEntriesByName("lectura:tiempo", "measure").length)).toBe(1);
  });

  test("OFF-14 Cancelar", async ({ page, context }) => {
    // Sin service worker y con el script del Worker lector retenido: la lectura sigue en curso al pulsar Cancelar.
    await context.route("**/assets/lector.worker-*.js", () => undefined);
    await page.goto("/");
    await iniciarCamara(page);
    await esperarPantalla(page, "leyendo");
    await expect(page.getByRole("status").filter({ hasText: "Leyendo documento…" })).toHaveAttribute("aria-live", "polite");
    const inicio = Date.now();
    await page.getByRole("button", { name: "Cancelar" }).click();
    await esperarPantalla(page, "activo", 1_000);
    expect(Date.now() - inicio).toBeLessThan(1_000);
    await expect(page.locator("dd[data-campo]")).toHaveCount(0);
  });
});
