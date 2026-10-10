// SDK-64: digital de pie (vídeo vertical 1080x1920) en el recuadro 260x400 con guía vertical.
import { expect, test } from "@playwright/test";
import { abrir, conVideo, leerYComprobar, tamanoPista, telefonoDePie, vigilarPrivacidad } from "./ayudas";

test.use(conVideo("digital-de-pie-vertical"));

test("SDK-64 Lee la digital de pie en el recuadro vertical", async ({ page }) => {
  test.setTimeout(300_000);
  await telefonoDePie(page);
  const privacidad = vigilarPrivacidad(page);
  await abrir(page, "vertical");
  await leerYComprobar(page, 260, 400, true, privacidad);
  expect(await tamanoPista(page)).toStrictEqual([1080, 1920]);
  await expect(page.locator('[data-prueba="contenido"]')).toHaveText("mrz-td1");
});
