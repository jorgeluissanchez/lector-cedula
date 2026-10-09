// SDK-12 y SDK-37 sobre los ejemplos headless (plan: e2e/planes/sdk-ejemplos.md). Proyecto `sdk-ejemplos`: cada
// ejemplo compilado en su puerto (playwright.config.ts). `examples/html` llega con la tarea 3c.2.
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { conVideo, fase, fijarFecha, leer, precargar, registrarPeticiones } from "./ayudas";

test.use(conVideo("amarilla-1080p"));

const EJEMPLOS = { vanilla: 4190, react: 4191, next: 4192, angular: 4193, vue: 4194 } as const;
type Ejemplo = keyof typeof EJEMPLOS;
const url = (e: Ejemplo): string => `http://localhost:${EJEMPLOS[e]}/`;

interface Estilo {
  readonly borderColor: string;
  readonly borderRadius: string;
  readonly textoIniciar: string;
}
const esperado = (e: Ejemplo): Estilo => JSON.parse(readFileSync(`examples/${e}/estilo-esperado.json`, "utf8")) as Estilo;

async function estiloActual(page: Page): Promise<Estilo> {
  return page.evaluate(() => {
    const g = getComputedStyle(document.querySelector('[data-prueba="guia"]') as Element);
    return {
      borderColor: g.borderTopColor,
      borderRadius: g.borderTopLeftRadius,
      textoIniciar: (document.querySelector('[data-prueba="iniciar"]')?.textContent ?? "").trim(),
    };
  });
}

test.describe("SDK-12 y SDK-37 ejemplos headless", { timeout: 300_000 }, () => {
  test.describe.configure({ timeout: 300_000 });

  for (const e of Object.keys(EJEMPLOS) as Ejemplo[]) {
    test(`SDK-12 Lectura en cada framework y UI propia: ${e}`, async ({ page }) => {
      const consola: string[] = [];
      page.on("console", (m) => consola.push(m.text()));
      page.on("pageerror", (err) => consola.push(err.message));
      await fijarFecha(page);
      await page.goto(url(e));
      await expect(fase(page)).toHaveText("inicio");
      await page.locator('[data-prueba="iniciar"]').click();
      await expect(fase(page)).toHaveText(/^(activo|listo|leyendo|resultado)$/u, { timeout: 120_000 });
      expect(await estiloActual(page)).toStrictEqual(esperado(e));
      await expect(fase(page)).toHaveText("resultado", { timeout: 120_000 });
      await expect(page.locator('[data-prueba="nuip"]')).toHaveText("9999123456");
      const sinComponente = await page.evaluate(() => ({
        elementos: document.querySelectorAll("lector-cedula").length,
        hojas: [...document.styleSheets].map((h) => h.href ?? (h.ownerNode as Element | null)?.getAttribute("data-origen") ?? "").filter((h) => h.includes("@lector-cedula") || h.includes("/lector-cedula/")),
        adoptadas: document.adoptedStyleSheets.length,
      }));
      expect(sinComponente).toStrictEqual({ elementos: 0, hojas: [], adoptadas: 0 });
      for (const m of consola) {
        expect(m).not.toContain("9999123456");
        if (e === "next") expect(m).not.toMatch(/Hydration|window is not defined|navigator is not defined|document is not defined/u);
      }
    });

    test(`SDK-37 Lectura completa con la red cortada y cero peticiones a otros orígenes: ${e}`, async ({ page, context }) => {
      const peticiones = registrarPeticiones(page);
      await fijarFecha(page);
      await page.goto(url(e));
      await precargar(page);
      await context.setOffline(true);
      expect(await leer(page)).toBe("resultado");
      await expect(page.locator('[data-prueba="nuip"]')).toHaveText("9999123456");
      const origen = new URL(url(e)).origin;
      for (const r of peticiones) {
        const u = new URL(r.url());
        if (u.protocol === "blob:" || u.protocol === "data:") continue;
        expect(u.origin, r.url()).toBe(origen);
        expect(r.method(), r.url()).not.toBe("POST");
      }
    });
  }

  test("SDK-12 UI personalizada distinta por framework: las tuplas declaradas son distintas dos a dos", () => {
    const tuplas = (["vanilla", "react", "angular", "vue"] as const).map((e) => JSON.stringify(esperado(e)));
    expect(new Set(tuplas).size).toBe(tuplas.length);
    for (const e of ["vanilla", "react", "angular", "vue"] as const) {
      const t = esperado(e);
      for (const otro of ["vanilla", "react", "angular", "vue"] as const) {
        if (otro === e) continue;
        const o = esperado(otro);
        expect([t.borderColor, t.borderRadius, t.textoIniciar]).not.toStrictEqual([o.borderColor, o.borderRadius, o.textoIniciar]);
      }
    }
  });
});
