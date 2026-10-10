// sdk-integracion B.7, SDK-51 (plan: e2e/planes/sdk-backend-propio.md): cada ejemplo con front React y backend propio
// (Express en 4195, Next en 4197 y Nest en 4198) de punta a punta con la cámara simulada (amarilla sintética,
// PERSONA_BASE), autorización del titular antes de la cámara (Ley 1581), red solo al origen del ejemplo, almacenamiento
// vacío y axe en cinco estados.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const NUIP = "9999123456";
const EJEMPLOS = [
  { nombre: "Express", base: "http://localhost:4195/" },
  { nombre: "Next", base: "http://localhost:4197/" },
  { nombre: "Nest", base: "http://localhost:4198/" },
] as const;

const prueba = (page: Page, nombre: string) => page.locator(`[data-prueba="${nombre}"]`);

async function sinViolacionesGraves(page: Page, estado: string): Promise<void> {
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const graves = axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${estado}: ${v.id}`);
  expect(graves).toStrictEqual([]);
}

/** Abre el ejemplo y marca la autorización del titular (Ley 1581, SDK-51): sin ella la cámara no se abre. */
async function abrir(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await prueba(page, "autorizacion").check();
}

/** Orígenes de todas las peticiones http(s) de la página (blob: y data: no salen a la red). */
function origenesPedidos(page: Page): Set<string> {
  const origenes = new Set<string>();
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.protocol === "http:" || u.protocol === "https:") origenes.add(u.origin);
  });
  return origenes;
}

for (const { nombre, base } of EJEMPLOS) {
  test.describe(`SDK-51 ejemplo ${nombre} con front React y backend propio`, () => {
    test.describe.configure({ timeout: 300_000 });

    test(`SDK-51 Sin autorización no se abre la cámara en ${nombre}`, async ({ page }) => {
      const peticiones: string[] = [];
      page.on("request", (r) => {
        if (new URL(r.url()).pathname === "/api/cedula") peticiones.push(r.url());
      });
      await page.goto(base);
      await expect(prueba(page, "autorizacion")).not.toBeChecked();
      await expect(prueba(page, "empezar")).toBeDisabled();
      // La cámara no se pide: el vídeo no recibe flujo y la fase no sale de `inicio`.
      await expect.poll(() => page.evaluate(() => (document.querySelector("video") as HTMLVideoElement).srcObject === null)).toBe(true);
      await expect(prueba(page, "fase")).toHaveText("inicio");
      expect(peticiones).toStrictEqual([]);
      // Al marcarla se abre sola (autoIniciar); al desmarcarla el controlador se destruye y vuelve a `inicio`.
      await prueba(page, "autorizacion").check();
      await expect(prueba(page, "fase")).not.toHaveText("inicio", { timeout: 120_000 });
      await prueba(page, "autorizacion").uncheck();
      await expect(prueba(page, "fase")).toHaveText("inicio");
      await expect(prueba(page, "empezar")).toBeDisabled();
    });

    test(`SDK-51 Flujo de punta a punta en ${nombre}: etapas, confiable, solo su origen y sin almacenamiento`, async ({ page }) => {
      const origenes = origenesPedidos(page);
      await abrir(page, base);
      await expect(prueba(page, "fase")).toHaveText("resultado", { timeout: 180_000 });
      await expect(prueba(page, "nuip")).toHaveText(NUIP);
      await expect(prueba(page, "confiable")).toHaveText("true");
      const etapas = (await prueba(page, "etapas").textContent())?.split(",") ?? [];
      for (const etapa of ["recibido", "leyendo", "comparando"]) expect(etapas).toContain(etapa);
      expect([...origenes]).toStrictEqual([new URL(base).origin]);
      // Privacidad (SDK-58, revisor-privacidad): nada queda en el almacenamiento del navegador salvo las caches del SDK.
      const almacenado = await page.evaluate(async () => ({
        local: localStorage.length,
        sesion: sessionStorage.length,
        bases: (await indexedDB.databases()).length,
        caches: (await caches.keys()).filter((k) => !k.startsWith("lector-cedula-sdk-")),
      }));
      expect(almacenado).toStrictEqual({ local: 0, sesion: 0, bases: 0, caches: [] });
    });

    test(`SDK-51 Accesibilidad de ${nombre} en inicio, activo, verificando y resultado`, async ({ page, context }) => {
      await page.goto(`${base}?autoIniciar=0`);
      await expect(prueba(page, "fase")).toHaveText("inicio");
      await expect(prueba(page, "empezar")).toBeVisible();
      await sinViolacionesGraves(page, "inicio");
      await prueba(page, "autorizacion").check();
      // Con `?autoIniciar=0` la autorización solo habilita el botón: la cámara espera al gesto.
      await expect(prueba(page, "fase")).toHaveText("inicio");
      await prueba(page, "empezar").click();
      await expect(prueba(page, "fase")).toHaveText(/activo|listo/u, { timeout: 120_000 });
      await sinViolacionesGraves(page, "activo");
      // Sin red, `verificando` (en-espera, SDK-58) se mantiene el tiempo necesario para analizarla.
      await context.setOffline(true);
      await expect(prueba(page, "fase")).toHaveText("verificando", { timeout: 180_000 });
      await sinViolacionesGraves(page, "verificando");
      await context.setOffline(false);
      await expect(prueba(page, "fase")).toHaveText("resultado", { timeout: 180_000 });
      await expect(prueba(page, "confiable")).toHaveText("true");
      await sinViolacionesGraves(page, "resultado");
    });

    test(`SDK-51 Accesibilidad de ${nombre} con un rechazo visible (cliente manipulado: no-coincide)`, async ({ page }) => {
      // El atacante altera la lectura local antes de enviarla: el backend real la compara con la suya y rechaza.
      await page.addInitScript(() => {
        const original = window.fetch.bind(window);
        window.fetch = (entrada, init) => {
          const cuerpo = init?.body;
          if (String(entrada).includes("/api/cedula") && cuerpo instanceof FormData && typeof cuerpo.get("cliente") === "string") {
            const cliente = JSON.parse(cuerpo.get("cliente") as string) as { campos: Record<string, unknown> };
            cliente.campos.nuip = "9999123457";
            cuerpo.set("cliente", JSON.stringify(cliente));
          }
          return original(entrada, init);
        };
      });
      await abrir(page, base);
      await expect(prueba(page, "rechazo")).toHaveText("no-coincide", { timeout: 180_000 });
      await sinViolacionesGraves(page, "rechazo");
      await expect(prueba(page, "confiable")).not.toHaveText("true");
    });
  });
}
