// SDK-37 Lectura local sin servidor (E(sin-servidor)) y SDK-07 precarga, sobre examples/vanilla.
import { expect, test } from "@playwright/test";
import { conVideo, fijarFecha, leer, precargar, registrarPeticiones } from "./ayudas";

test.use(conVideo("amarilla-1080p"));

test.describe("SDK-37 amarilla sin servidor", { timeout: 300_000 }, () => {
  test.describe.configure({ timeout: 300_000 });
  test("SDK-37 Lectura completa con la red cortada tras precargar", async ({ page, context }) => {
    await fijarFecha(page);
    await page.goto("/");
    await precargar(page);
    await context.setOffline(true);
    expect(await leer(page)).toBe("resultado");
    await expect(page.locator('[data-prueba="nuip"]')).toHaveText("9999123456");
    await expect(page.locator('[data-prueba="contenido"]')).toHaveText("pdf417");
  });

  test("SDK-37 Cero peticiones a otros orígenes, ningún POST y SDK-07 nada del motor tras precargar", async ({ page, baseURL }) => {
    const peticiones = registrarPeticiones(page);
    await fijarFecha(page);
    await page.goto("/");
    await precargar(page);
    const tras = peticiones.length;
    expect(await leer(page)).toBe("resultado");
    const origen = new URL(baseURL as string).origin;
    for (const r of peticiones) {
      const u = new URL(r.url());
      if (u.protocol === "blob:" || u.protocol === "data:") continue;
      expect(u.origin, r.url()).toBe(origen);
      expect(r.method(), r.url()).not.toBe("POST");
      expect(r.url()).not.toContain("9999123456");
    }
    const delMotor = peticiones.slice(tras).filter((r) => r.url().includes("/lector-cedula/"));
    expect(delMotor.map((r) => r.url())).toStrictEqual([]);
  });
});
