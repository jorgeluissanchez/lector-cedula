// demo-opciones, DOP-03 "Recuadro vertical con la cédula de pie" con `amarilla-de-pie-vertical` (1080x1920).
import { expect, test } from "@playwright/test";
import { abrirDemo, abrirPanel, campo, conVideo, dentro, leerConEscena, NUIP, telefonoDePie, TEXTOS } from "./ayudas-opciones";

test.use(conVideo("amarilla-de-pie-vertical"));

test("DOP-03 Recuadro vertical con la amarilla de pie", async ({ page }) => {
  test.setTimeout(300_000);
  await telefonoDePie(page);
  await abrirDemo(page);
  const r = await abrirPanel(page);
  await r.getByRole("radio", { name: TEXTOS.vertical }).check();
  const e = await leerConEscena(page);
  expect(e.forma).toBe("recuadro-vertical");
  expect(e.pista).toStrictEqual([1080, 1920]);
  expect([Math.round(e.recuadro?.width ?? 0), Math.round(e.recuadro?.height ?? 0)]).toStrictEqual([260, 400]);
  expect(e.objectFit).toBe("cover");
  expect(e.dePie).toBe(true);
  expect(e.guia.height).toBeGreaterThan(e.guia.width);
  expect(dentro(e.guia, e.video)).toBe(true);
  await expect(campo(page, "Número de documento")).toHaveText(NUIP);
});
