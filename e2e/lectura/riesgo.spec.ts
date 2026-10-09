// FRA-02, FRA-17, FRA-20 y FRA-21 (cambio deteccion-fraude, tarea 5.1) con la amarilla sintética. Plan:
// e2e/planes/deteccion-fraude.md. La señal informa y nunca oculta los datos leídos.
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { campo, conVideo, esperarOfflineLista, esperarServiceWorker, fijarFecha, leer } from "./ayudas";

test.use(conVideo("amarilla-1080p"));

const seccion = (page: import("@playwright/test").Page) => page.locator("section.resultado");

test.describe("señal de riesgo (amarilla)", () => {
  test.describe.configure({ timeout: 300_000 });

  test("FRA-21 Señal apagada por defecto", async ({ page }) => {
    const pedidas: string[] = [];
    page.on("request", (q) => pedidas.push(q.url()));
    await fijarFecha(page);
    await page.goto("/");
    await leer(page);
    await expect(campo(page, "Número de documento")).toHaveText("9999123456");
    await expect(seccion(page)).not.toHaveAttribute("data-riesgo-nivel", /.*/u);
    await expect(page.locator("section.riesgo")).toHaveCount(0);
    expect(pedidas.filter((u) => u.includes("fraude.worker"))).toStrictEqual([]);
  });

  // Los escenarios siguientes activan la señal con ?debug=1 (FRA-21).

  // Pendiente: el vídeo amarilla-1080p es el PDF417 en blanco y negro sobre fondo gris (un impreso monocromo), y el
  // detector lo marca correctamente como fotocopia en grises. Requiere un vídeo del reverso a color (tarea 5.1b).
  test.fixme("FRA-17 Auténtico en E2E", async ({ page }) => {
    await fijarFecha(page);
    await page.goto("/?debug=1");
    await leer(page);
    await expect(seccion(page)).toHaveAttribute("data-riesgo-nivel", "bajo");
  });

  test("FRA-17 La señal informa sin ocultar los datos", async ({ page }) => {
    await fijarFecha(page);
    await page.goto("/?debug=1");
    await leer(page);
    await expect(campo(page, "Número de documento")).toHaveText("9999123456");
    await expect(seccion(page)).toHaveAttribute("data-riesgo-nivel", /^(bajo|medio|alto)$/u);
    // El impreso monocromo del vídeo sintético es una fotocopia en grises para el detector.
    await expect(seccion(page)).toHaveAttribute("data-riesgo-motivos", /fotocopia/u);
    await expect(page.locator("[data-motivo=fotocopia]")).toHaveText("Parece una fotocopia o una impresión");
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    expect(r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toStrictEqual([]);
  });

  test("FRA-02 Sin red durante la evaluación", async ({ page, context }) => {
    await fijarFecha(page);
    await page.goto("/?debug=1");
    await esperarServiceWorker(page);
    await esperarOfflineLista(page);
    await context.setOffline(true);
    // Toda respuesta desde "Iniciar cámara" hasta resultado sale del service worker: ninguna llega a la red.
    const red: string[] = [];
    context.on("response", (r) => {
      if (!r.fromServiceWorker()) red.push(r.url());
    });
    await leer(page);
    await expect(seccion(page)).toHaveAttribute("data-riesgo-nivel", /^(bajo|medio|alto)$/u);
    expect(red).toStrictEqual([]);
  });

  test.describe("sin service worker", () => {
    test.use({ serviceWorkers: "block" });
    test("FRA-20 Worker de fraude que no responde", async ({ page, context }) => {
      // El script del Worker de fraude nunca llega: la lectura se muestra igual tras el tiempo máximo.
      await context.route("**/assets/fraude.worker-*.js", () => undefined);
      await page.goto("/?debug=1");
      await leer(page);
      await expect(campo(page, "Número de documento")).toHaveText("9999123456");
      await expect(seccion(page)).toHaveAttribute("data-riesgo-nivel", "no-disponible");
      await expect(page.getByRole("heading", { name: "Señal de riesgo no disponible" })).toBeVisible();
    });
  });
});
