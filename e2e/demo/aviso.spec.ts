// mitigacion-autor (MA-02, MA-03): aviso de demostración visible, no ocultable y accesible; sin peticiones salientes.
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const TEXTO =
  "Demostración del software libre lector-cedula. No uses tu cédula real ni datos de terceros; usa un documento de prueba. Nada se guarda ni se envía: la lectura ocurre en tu dispositivo.";
const ETIQUETAS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test.describe("demo", { timeout: 60_000 }, () => {
  test("MA-02 Demo con aviso", async ({ page }) => {
    await page.goto("/");
    const nota = page.getByRole("note", { name: "Aviso de demostración" });
    await expect(nota).toBeVisible();
    await expect(nota).toHaveText(TEXTO);
    await expect(nota.getByRole("button")).toHaveCount(0);
    const boton = page.getByRole("button", { name: "Iniciar cámara" });
    const precede = await nota.evaluate((n, b) => (n.compareDocumentPosition(b as Node) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0, await boton.elementHandle());
    expect(precede).toBe(true);
  });

  test("MA-02 Build normal sin aviso", async ({ page }) => {
    // El build normal (sin VITE_DEMO) es el que sirve el webServer del puerto 4173.
    await page.goto("http://localhost:4173/");
    await expect(page.getByRole("button", { name: "Iniciar cámara" })).toBeVisible();
    await expect(page.getByRole("note", { name: "Aviso de demostración" })).toHaveCount(0);
  });

  test("MA-02 Accesibilidad", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("note", { name: "Aviso de demostración" })).toBeVisible();
    const r = await new AxeBuilder({ page }).withTags(ETIQUETAS).analyze();
    expect(r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toStrictEqual([]);
  });

  test("MA-03 Ninguna petición saliente", async ({ page, baseURL }) => {
    const salientes: string[] = [];
    page.on("request", (req) => {
      const url = new URL(req.url());
      if (url.protocol === "data:" || url.protocol === "blob:") return;
      if (req.method() !== "GET" || url.origin !== new URL(baseURL ?? "").origin) salientes.push(`${req.method()} ${url.origin}`);
    });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute("content", "connect-src 'self'");
    expect(salientes).toStrictEqual([]);
  });
});
