// demo-opciones, DOP-01, DOP-02a, DOP-04 y DOP-05 sin lectura: panel, valores por omisión, persistencia, forzados y
// páginas legales del build demo (4175). Cámara falsa por defecto de Chromium (no se lee ningún documento).
import { expect, test } from "@playwright/test";
import { abrirDemo, abrirPanel, almacenamiento, botonOpciones, CLAVE, graves, region, TEXTOS } from "./ayudas-opciones";

const AVISO =
  "Demostración del software libre lector-cedula. No uses tu cédula real ni datos de terceros; usa un documento de prueba. Nada se guarda ni se envía: la lectura ocurre en tu dispositivo.";

test.describe("panel de opciones de la demo", { timeout: 120_000 }, () => {
  test("DOP-01 Demo con panel", async ({ page }) => {
    await abrirDemo(page);
    const boton = botonOpciones(page);
    await expect(boton).toBeVisible();
    await expect(boton).toHaveAttribute("aria-expanded", "false");
    await expect(boton).toHaveAttribute("aria-controls", "panel-opciones");
    const nota = page.getByRole("note", { name: "Aviso de demostración" });
    await expect(nota).toHaveText(AVISO);
    const precede = await nota.evaluate((n, b) => (n.compareDocumentPosition(b as Node) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0, await boton.elementHandle());
    expect(precede).toBe(true);
    await expect(page.locator("#panel-opciones")).toBeHidden();
  });

  test("DOP-01 Abrir y cerrar", async ({ page }) => {
    await abrirDemo(page);
    await botonOpciones(page).click();
    await expect(botonOpciones(page)).toHaveAttribute("aria-expanded", "true");
    const r = region(page);
    await expect(r).toBeVisible();
    const grupo = r.getByRole("group", { name: TEXTOS.grupo });
    await expect(grupo.getByRole("radio")).toHaveCount(3);
    for (const nombre of [TEXTOS.completa, TEXTOS.horizontal, TEXTOS.vertical]) await expect(grupo.getByRole("radio", { name: nombre, exact: true })).toBeVisible();
    await expect(r.getByRole("checkbox")).toHaveCount(2);
    await expect(r.getByRole("checkbox", { name: TEXTOS.ti })).toHaveAccessibleDescription(TEXTOS.notaTi);
    await expect(r.getByRole("checkbox", { name: TEXTOS.fraude })).toHaveAccessibleDescription(TEXTOS.notaFraude);
    await expect(r.getByText(TEXTOS.recordadas, { exact: true })).toBeVisible();
    await botonOpciones(page).click();
    await expect(botonOpciones(page)).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("#panel-opciones")).toBeHidden();
  });

  test("DOP-01 Valores por omisión", async ({ page }) => {
    await abrirDemo(page);
    const r = await abrirPanel(page);
    await expect(r.getByRole("radio", { name: TEXTOS.completa })).toBeChecked();
    await expect(r.getByRole("radio", { name: TEXTOS.horizontal })).not.toBeChecked();
    await expect(r.getByRole("radio", { name: TEXTOS.vertical })).not.toBeChecked();
    for (const nombre of [TEXTOS.ti, TEXTOS.fraude]) {
      await expect(r.getByRole("checkbox", { name: nombre })).not.toBeChecked();
      await expect(r.getByRole("checkbox", { name: nombre })).toBeEnabled();
    }
    expect((await almacenamiento(page)).claves).toStrictEqual([]);
  });

  test("DOP-01 Build normal sin panel", async ({ page }) => {
    await page.goto("http://localhost:4173/");
    await expect(page.getByRole("button", { name: "Iniciar cámara" })).toBeVisible();
    await expect(botonOpciones(page)).toHaveCount(0);
    await expect(page.locator("#panel-opciones")).toHaveCount(0);
  });

  test("DOP-01 Accesibilidad", async ({ page }) => {
    await abrirDemo(page);
    await abrirPanel(page);
    expect(await graves(page)).toStrictEqual([]);
  });

  test("DOP-02a Persistencia en la demo", async ({ page }) => {
    await abrirDemo(page);
    const r = await abrirPanel(page);
    await r.getByRole("radio", { name: TEXTOS.vertical }).check();
    await page.reload();
    const r2 = await abrirPanel(page);
    await expect(r2.getByRole("radio", { name: TEXTOS.vertical })).toBeChecked();
    expect(await almacenamiento(page)).toStrictEqual({
      claves: [CLAVE],
      valor: '{"forma":"recuadro-vertical","tarjetaIdentidad":false,"fraude":false}',
      sesion: 0,
      idb: [],
    });
    // Volver a los valores por omisión borra la clave.
    await r2.getByRole("radio", { name: TEXTOS.completa }).check();
    expect((await almacenamiento(page)).claves).toStrictEqual([]);
  });

  test("DOP-05 Forzado por la URL", async ({ page }) => {
    await abrirDemo(page, "/?debug=1");
    const r = await abrirPanel(page);
    await expect(r.getByRole("checkbox", { name: TEXTOS.fraude })).toBeChecked();
    await expect(r.getByRole("checkbox", { name: TEXTOS.fraude })).toBeDisabled();
  });

  test("DOP-04a TI apagada por omisión", async ({ page }) => {
    await abrirDemo(page);
    await expect(page.getByRole("link", { name: /Autorización del representante legal/u })).toHaveCount(0);
  });

  test("DOP-04 Página de la autorización en la demo", async ({ request, baseURL }) => {
    const autorizacion = await request.get(`${baseURL}/assets/autorizacion-representante-ti.html`);
    expect(autorizacion.status()).toBe(200);
    expect(await autorizacion.text()).toContain("Ley 1581 de 2012");
    const politica = await (await request.get(`${baseURL}/assets/politica-tratamiento.html`)).text();
    expect(politica).toContain('<a href="/assets/autorizacion-representante-ti.html">');
  });
});
