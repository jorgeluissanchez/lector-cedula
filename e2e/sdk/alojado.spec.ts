// SDK-14 (página alojada en modo sesión, tarea 4.1), SDK-38 / tarea 4.3 (una sola cara) y SDK-40 (webhook firmado)
// contra `api-pruebas` en Docker con el código del directorio de trabajo:
//
//   node e2e/alojada/imagen.mjs                      (build y arranque en http://localhost:8010)
//   E2E_SIN_SERVIDORES=1 npx playwright test e2e/sdk/alojado.spec.ts --workers=1
//
// La sesión se crea con @lector-cedula/servidor (como el backend del integrador). `hosted_url` usa el dominio de la spec
// (https://api.lector-cedula.example): Playwright lo enruta al contenedor sin cambiar el origen, así que la CSP, el
// mismo origen de `upload.url` (SDK-42) y el contexto seguro de la cámara son los reales. Datos sintéticos únicamente.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { crearCliente, verificarWebhook } from "../../packages/servidor/src/index.js";
import { conVideo } from "./ayudas";

const API = `http://localhost:${process.env["PUERTO_API_PRUEBAS"] ?? "8010"}`;
const PUBLICA = "https://api.lector-cedula.example";
const RETORNO = "https://app-a.example/volver";
const DEEPLINK = "com.ejemplo.appa://lector/retorno";
const KT = "sk_test_00000000000000000000000000000000";
const SECRETO_KT = "whsec_sintetico_0123456789abcdef";
const PUERTO_WEBHOOK = 8096;
const WEBHOOK = `http://host.docker.internal:${PUERTO_WEBHOOK}/webhook`;
const AUT = { datos: true, sensibles: false, version_texto: "2026-10-01", otorgada_en: "2026-10-06T15:19:00Z" };

const cliente = crearCliente({ servidor: API, clave: KT });

test.use(conVideo("amarilla-1080p"));

interface Recibido {
  cuerpo: string;
  firma: string | undefined;
}

/** Enruta el dominio público al contenedor y la app del integrador a una página mínima; cuenta las peticiones. */
async function prepararRutas(page: Page): Promise<{ api: string[] }> {
  const api: string[] = [];
  await page.route(`${PUBLICA}/**`, async (r) => {
    const u = new URL(r.request().url());
    api.push(`${r.request().method()} ${u.pathname}`);
    const respuesta = await r.fetch({ url: `${API}${u.pathname}${u.search}` });
    await r.fulfill({ response: respuesta });
  });
  await page.route("https://app-a.example/**", (r) => r.fulfill({ contentType: "text/html", body: "<!doctype html><title>App A</title><p>De vuelta</p>" }));
  return { api };
}

/** Cuenta las llamadas a getUserMedia (Token alterado: no se pide la cámara). */
async function contarCamara(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __camara: number };
    w.__camara = 0;
    const md = navigator.mediaDevices;
    const original = md.getUserMedia.bind(md);
    md.getUserMedia = (c) => {
      w.__camara += 1;
      return original(c);
    };
  });
}
const llamadasCamara = (page: Page): Promise<number> => page.evaluate(() => (window as unknown as { __camara: number }).__camara);

test.describe("SDK-14 página alojada contra api-pruebas", { timeout: 300_000 }, () => {
  test.describe.configure({ mode: "serial", timeout: 300_000 });

  let receptor: Server;
  const recibidos: Recibido[] = [];

  test.beforeAll(async () => {
    const salud = await fetch(`${API}/salud`).catch(() => null);
    expect(salud?.ok, `api-pruebas no responde en ${API}: node e2e/alojada/imagen.mjs`).toBe(true);
    receptor = createServer((req, res) => {
      const trozos: Buffer[] = [];
      req.on("data", (t: Buffer) => trozos.push(t));
      req.on("end", () => {
        const firma = req.headers["x-lector-signature"];
        recibidos.push({ cuerpo: Buffer.concat(trozos).toString("utf8"), firma: Array.isArray(firma) ? firma[0] : firma });
        res.writeHead(204).end();
      });
    });
    await new Promise<void>((ok) => receptor.listen(PUERTO_WEBHOOK, "0.0.0.0", ok));
  });

  test.afterAll(async () => {
    await new Promise<void>((ok) => receptor.close(() => ok()));
  });

  test("SDK-14 Flujo completo con retorno, webhook firmado y una sola cara", async ({ page }) => {
    const sesion = await cliente.crearSesion({ autorizacion: AUT, tipoDocumento: "co_national-id-2000", urlRetorno: RETORNO, urlWebhook: WEBHOOK });
    const { api } = await prepararRutas(page);
    const subidas: string[][] = [];
    page.on("request", (r) => {
      if (r.method() === "POST" && /\/v1\/validations\/[^/]+\/images/u.test(r.url())) {
        const cuerpo = r.postDataBuffer()?.toString("latin1") ?? "";
        subidas.push([...cuerpo.matchAll(/; name="([^"]+)"/gu)].map((m) => m[1] ?? ""));
      }
    });
    await contarCamara(page);

    const respuesta = await page.goto(sesion.urlAlojada);
    expect(respuesta?.status()).toBe(200);
    // Aviso de autorización en la página alojada: antes de pedir la cámara.
    await expect(page.locator('[data-aviso="autorizacion"]')).toBeVisible();
    await expect(page.locator('[data-aviso="autorizacion"]')).toContainText("2026-10-01");
    await expect(page.locator('[data-aviso="autorizacion-reforzada"]')).toBeHidden();
    expect(await llamadasCamara(page)).toBe(0);
    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toStrictEqual([]);

    await page.locator('[data-accion="aceptar"]').click();
    await page.waitForURL((u) => u.origin === "https://app-a.example", { timeout: 240_000 });

    const destino = new URL(page.url());
    expect(`${destino.origin}${destino.pathname}`).toBe(RETORNO);
    expect([...destino.searchParams.keys()]).toStrictEqual(["validation_id", "estado"]);
    expect(destino.searchParams.get("validation_id")).toBe(sesion.id);
    expect(destino.searchParams.get("estado")).toBe("completada");
    expect(destino.hash).toBe("");
    expect(page.url()).not.toContain("9999123456");
    expect(page.url()).not.toContain(new URL(sesion.urlAlojada).pathname.slice(3));

    // Tarea 4.3: exactamente una subida, con una sola parte `front`; el resto del tráfico es la página, el motor e inicio.
    expect(subidas).toStrictEqual([["front"]]);
    expect(api.filter((p) => p.startsWith("POST"))).toStrictEqual([`POST /v/${new URL(sesion.urlAlojada).pathname.slice(3)}/inicio`, `POST /v1/validations/${sesion.id}/images`]);

    const validacion = await cliente.obtenerResultado(sesion.id);
    expect(validacion["status"]).toBe("success");

    // Webhook firmado al terminar, verificado con verificarWebhook y el secreto de la clave.
    await expect.poll(() => recibidos.length, { timeout: 60_000 }).toBeGreaterThan(0);
    const evento = recibidos.find((r) => r.cuerpo.includes(sesion.id));
    expect(evento).toBeDefined();
    const verificacion = await verificarWebhook({ cuerpo: evento?.cuerpo ?? "", firma: evento?.firma, secreto: SECRETO_KT });
    expect(verificacion).toMatchObject({ valido: true });
    expect(evento?.cuerpo).not.toContain("9999123456");
  });

  test("SDK-14 Cancelación", async ({ page }) => {
    const sesion = await cliente.crearSesion({ autorizacion: AUT, tipoDocumento: "co_national-id-2000", urlRetorno: RETORNO });
    await prepararRutas(page);
    await page.goto(sesion.urlAlojada);
    await page.locator('[data-accion="aceptar"]').click();
    await expect(page.locator("main")).toHaveAttribute("data-pantalla", "captura");
    await page.locator('[data-seccion="captura"] [data-accion="cancelar"]').click();
    await page.waitForURL((u) => u.origin === "https://app-a.example");
    const destino = new URL(page.url());
    expect([...destino.searchParams.entries()]).toStrictEqual([
      ["validation_id", sesion.id],
      ["estado", "cancelada"],
    ]);
    expect((await cliente.obtenerResultado(sesion.id))["status"]).toBe("pending");
  });

  test("SDK-14 Token alterado y cabeceras de la página alojada", async ({ page }) => {
    const sesion = await cliente.crearSesion({ autorizacion: AUT, tipoDocumento: "co_national-id-2000", urlRetorno: RETORNO });
    await prepararRutas(page);
    await contarCamara(page);
    const valida = await page.request.get(`${API}${new URL(sesion.urlAlojada).pathname}`);
    const ultimo = sesion.urlAlojada.at(-1) === "A" ? "B" : "A";
    const alterada = `${sesion.urlAlojada.slice(0, -1)}${ultimo}`;
    const respuesta = await page.goto(alterada);
    for (const r of [valida, respuesta]) {
      const cabeceras = r?.headers() ?? {};
      expect(cabeceras["cache-control"]).toBe("no-store");
      expect(cabeceras["referrer-policy"]).toBe("no-referrer");
      expect(cabeceras["content-security-policy"]?.replace("'wasm-unsafe-eval'", "")).not.toContain("unsafe-eval");
    }
    await expect(page.locator("main")).toHaveAttribute("data-pantalla", "sesion-invalida");
    await expect(page.locator('[data-seccion="sesion-invalida"]')).toBeVisible();
    expect(await llamadasCamara(page)).toBe(0);
    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toStrictEqual([]);
  });

  test("SDK-14 Retorno a deeplink", async ({ page }) => {
    const sesion = await cliente.crearSesion({ autorizacion: AUT, tipoDocumento: "co_national-id-2000", urlRetorno: DEEPLINK });
    await prepararRutas(page);
    const cdp = await page.context().newCDPSession(page);
    const intentos: string[] = [];
    cdp.on("Page.frameRequestedNavigation", (e: { url: string }) => intentos.push(e.url));
    await cdp.send("Page.enable");
    await page.goto(sesion.urlAlojada);
    await page.locator('[data-accion="aceptar"]').click();
    await expect.poll(() => intentos.find((u) => u.startsWith(DEEPLINK)), { timeout: 240_000 }).toBe(`${DEEPLINK}?validation_id=${sesion.id}&estado=completada`);
  });
});
