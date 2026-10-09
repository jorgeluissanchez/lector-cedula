// SDK-11 Privacidad del núcleo (E(privacidad)): almacenamiento, red y consola tras una lectura sin sesión.
import { expect, test } from "@playwright/test";
import { conVideo, fijarFecha, leer, registrarPeticiones } from "./ayudas";

test.use(conVideo("amarilla-1080p"));

test.describe("SDK-11 privacidad", { timeout: 300_000 }, () => {
  test.describe.configure({ timeout: 300_000 });
  test("SDK-11 Sin almacenamiento local, sin POST y consola limpia", async ({ page }) => {
    const consola: string[] = [];
    page.on("console", (m) => consola.push(m.text()));
    const peticiones = registrarPeticiones(page);
    await fijarFecha(page);
    await page.goto("/");
    expect(await leer(page)).toBe("resultado");
    const estado = await page.evaluate(async () => {
      let enCache = false;
      for (const n of await caches.keys()) {
        const c = await caches.open(n);
        for (const p of await c.keys()) {
          const r = await c.match(p);
          if (r !== undefined && (await r.text()).includes("9999123456")) enCache = true;
        }
      }
      return { local: localStorage.length, sesion: sessionStorage.length, idb: await indexedDB.databases(), cookie: document.cookie, enCache };
    });
    expect(estado).toStrictEqual({ local: 0, sesion: 0, idb: [], cookie: "", enCache: false });
    expect(peticiones.filter((r) => r.method() === "POST" || (r.headers()["content-type"] ?? "").includes("multipart/form-data"))).toStrictEqual([]);
    for (const m of consola) {
      expect(m).not.toContain("9999123456");
      expect(m).not.toContain("FICTICIA");
    }
  });
});
