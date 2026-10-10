// demo-opciones con la amarilla horizontal (`amarilla-1080p`): DOP-03 pantalla completa y recuadro horizontal, DOP-02a
// sin datos de lectura en el almacenamiento, y DOP-05 fraude apagado y encendido desde el panel.
import { expect, test } from "@playwright/test";
import { abrirDemo, abrirPanel, almacenamiento, campo, CLAVE, conVideo, dentro, graves, iniciarCamara, leerConEscena, NUIP, TEXTOS, esperarPantalla } from "./ayudas-opciones";

test.use(conVideo("amarilla-1080p"));

const seccion = (page: import("@playwright/test").Page) => page.locator("section.resultado");

test.describe("demo con la amarilla horizontal", () => {
  test.describe.configure({ timeout: 300_000 });

  test("DOP-03 Pantalla completa como hoy", async ({ page }) => {
    await abrirDemo(page);
    const e = await leerConEscena(page);
    expect(e.forma).toBe("pantalla-completa");
    expect(e.recuadro).toBeNull();
    expect(e.objectFit).toBe("contain");
    expect(e.dePie).toBe(false);
    // El vídeo ocupa la ventana (escena fija a pantalla completa).
    expect([Math.round(e.video.width), Math.round(e.video.height)]).toStrictEqual([e.ventana.ancho, e.ventana.alto]);
    expect(e.guia.width).toBeGreaterThan(e.guia.height);
    expect(dentro(e.guia, e.video)).toBe(true);
    await expect(campo(page, "Número de documento")).toHaveText(NUIP);
  });

  test("DOP-03 Recuadro horizontal y DOP-02a Ningún dato de lectura en el almacenamiento", async ({ page }) => {
    await abrirDemo(page);
    const r = await abrirPanel(page);
    await r.getByRole("radio", { name: TEXTOS.horizontal }).check();
    const e = await leerConEscena(page);
    expect(e.forma).toBe("recuadro-horizontal");
    expect([Math.round(e.recuadro?.width ?? 0), Math.round(e.recuadro?.height ?? 0)]).toStrictEqual([320, 200]);
    expect(e.objectFit).toBe("cover");
    expect(e.guia.width).toBeGreaterThan(e.guia.height);
    expect(dentro(e.guia, e.video)).toBe(true);
    await expect(campo(page, "Número de documento")).toHaveText(NUIP);
    const a = await almacenamiento(page);
    expect(a.claves).toStrictEqual([CLAVE]);
    expect(a.valor).toBe('{"forma":"recuadro-horizontal","tarjetaIdentidad":false,"fraude":false}');
    expect(a.valor).not.toContain(NUIP);
    expect([a.sesion, a.idb]).toStrictEqual([0, []]);
  });

  test("DOP-05 Fraude apagado por omisión", async ({ page }) => {
    const pedidas: string[] = [];
    page.on("request", (q) => pedidas.push(q.url()));
    await abrirDemo(page);
    await iniciarCamara(page);
    await esperarPantalla(page, "resultado", 180_000);
    await expect(campo(page, "Número de documento")).toHaveText(NUIP);
    await expect(seccion(page)).not.toHaveAttribute("data-riesgo-nivel", /.*/u);
    await expect(page.locator("section.riesgo")).toHaveCount(0);
    expect(pedidas.filter((u) => u.includes("fraude.worker"))).toStrictEqual([]);
  });

  test("DOP-05 Fraude encendido desde el panel", async ({ page }) => {
    await abrirDemo(page);
    const r = await abrirPanel(page);
    await r.getByRole("checkbox", { name: TEXTOS.fraude }).check();
    await iniciarCamara(page);
    await esperarPantalla(page, "resultado", 180_000);
    await expect(seccion(page)).toHaveAttribute("data-riesgo-nivel", /^(bajo|medio|alto)$/u);
    await expect(page.locator("section.riesgo")).toContainText("la autenticidad solo la confirma la Registraduría");
    await expect(campo(page, "Número de documento")).toHaveText(NUIP);
    expect(await graves(page)).toStrictEqual([]);
  });
});
