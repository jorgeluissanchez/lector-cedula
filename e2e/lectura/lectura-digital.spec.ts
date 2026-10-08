// OFF-09 y OFF-14 con la digital sintética (pwa-lectura-offline, tarea 6.3).
import { expect, test } from "@playwright/test";
import { campo, conVideo, contenedor, fijarFecha, leer } from "./ayudas";

test.use(conVideo("digital-1080p"));

test.describe("digital", { timeout: 300_000 }, () => {
  test.describe.configure({ timeout: 300_000 });
  test("OFF-09 Pantalla de resultado de la digital y OFF-14 Hilo principal libre", async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __largas: number[]; __midiendo: boolean };
      w.__largas = [];
      w.__midiendo = false;
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) if (w.__midiendo) w.__largas.push(e.duration);
      }).observe({ type: "longtask" });
      new MutationObserver(() => {
        const p = document.querySelector("[data-pantalla]")?.getAttribute("data-pantalla");
        if (p === "leyendo") w.__midiendo = true;
        if (p === "resultado") w.__midiendo = false;
      }).observe(document, { subtree: true, attributes: true, childList: true, attributeFilter: ["data-pantalla"] });
    });
    await fijarFecha(page);
    await page.goto("/");
    await leer(page, 240_000);
    await expect(contenedor(page)).toHaveAttribute("data-tipo", "mrz");
    await expect(campo(page, "Número de documento")).toHaveText("********56");
    await expect(campo(page, "Serial")).toHaveText("*******45");
    const texto = await page.locator("body").innerText();
    for (const prohibido of ["999912345", "<<"]) expect(texto).not.toContain(prohibido);
    const largas = await page.evaluate(() => (window as unknown as { __largas: number[] }).__largas);
    expect(largas.filter((d) => d > 200)).toStrictEqual([]);
  });
});
