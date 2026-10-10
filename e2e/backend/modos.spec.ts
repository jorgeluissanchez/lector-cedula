// motor-backend-embebido 1.5 y sdk-integracion B.7 (plan: e2e/planes/sdk-backend-propio.md): front React del ejemplo
// Express con el backend real en proceso, en cada modo. Cámara simulada con la amarilla sintética (PERSONA_BASE).
// SDK-60 (matriz de modos con streaming activado y desactivado, y front-back sin red), SDK-46 (secuencia con el backend
// real), SDK-58 (cola sin red sin persistencia) y MOT-15.
import AxeBuilder from "@axe-core/playwright";
import { gzipSync } from "node:zlib";
import { expect, test, type Page, type Request } from "@playwright/test";
import { PRESUPUESTO_BACK } from "../../packages/web/scripts/tamano-back.mjs";

const BASE = "http://localhost:4195/";
const NUIP = "9999123456";

function peticionesBackend(page: Page): Request[] {
  const lista: Request[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).pathname === "/api/cedula") lista.push(r);
  });
  return lista;
}

/** Rutas de todos los recursos pedidos por la página (para comprobar que no se descargó ninguno `pesado`). */
function rutasPedidas(page: Page): string[] {
  const lista: string[] = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.protocol === "http:") lista.push(u.pathname);
  });
  return lista;
}

async function recursosPesados(page: Page): Promise<string[]> {
  const r = await page.request.get(`${BASE}lector-cedula/manifest.json`);
  const m = (await r.json()) as { recursos: { archivo: string; pesado?: boolean }[] };
  return m.recursos.filter((e) => e.pesado === true).map((e) => `/lector-cedula/${e.archivo}`);
}

/**
 * SDK-56 (decisión del orquestador 2026-10-10): bytes gzip (nivel 9, como `TB`) de lo que la página descargó del SDK:
 * el chunk `assets/sdk-*.js` del ejemplo (sin React ni el código de la app, examples/vite-chunks-sdk.mjs) y TODO lo
 * pedido bajo `/lector-cedula/`, sin excluir nada (Worker de calidad, `manifest.json` y cualquier otro recurso). Los
 * avisos legales (`aviso: true`) no deben aparecer: el cargador no los pide por red.
 */
async function bytesSdk(page: Page, rutas: readonly string[]): Promise<{ chunks: string[]; recursos: string[]; total: number }> {
  const medidas = [...new Set(rutas)].filter((r) => /^\/assets\/sdk-[^/]+\.js$/u.test(r) || r.startsWith("/lector-cedula/"));
  let total = 0;
  for (const ruta of medidas) total += gzipSync(await (await page.request.get(new URL(ruta, BASE).href)).body(), { level: 9 }).byteLength;
  return { chunks: medidas.filter((r) => r.startsWith("/assets/")), recursos: medidas.filter((r) => !r.startsWith("/assets/")).sort(), total };
}

const prueba = (page: Page, nombre: string) => page.locator(`[data-prueba="${nombre}"]`);

/** Abre el ejemplo y marca la autorización del titular (Ley 1581, SDK-51): sin ella la cámara no se abre. */
async function abrir(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await prueba(page, "autorizacion").check();
}

async function esperarResultado(page: Page): Promise<void> {
  await expect(prueba(page, "fase")).toHaveText("resultado", { timeout: 180_000 });
  await expect(prueba(page, "nuip")).toHaveText(NUIP);
}

function vigilarConsola(page: Page): string[] {
  const mensajes: string[] = [];
  page.on("console", (m) => mensajes.push(m.text()));
  page.on("pageerror", (e) => mensajes.push(e.message));
  return mensajes;
}

/**
 * Playwright no expone los cuerpos multipart con Blob: se registran las claves del FormData de cada fetch a
 * /api/cedula desde la página (solo nombres de campo, nunca valores).
 */
async function vigilarCampos(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __campos: string[][] };
    w.__campos = [];
    const original = window.fetch.bind(window);
    window.fetch = (entrada, init) => {
      if (String(entrada).includes("/api/cedula") && init?.body instanceof FormData) w.__campos.push([...init.body.keys()]);
      return original(entrada, init);
    };
  });
}

const campos = (page: Page): Promise<string[][]> => page.evaluate(() => (window as unknown as { __campos: string[][] }).__campos);

interface CasoModo {
  readonly nombre: string;
  readonly consulta: string;
  readonly memoria?: number;
  readonly modo: string;
  readonly frontActivo: boolean;
  readonly confiable: boolean;
}

/** SDK-60, escenario "Matriz de modos": valores literales del escenario. */
const CASOS: readonly CasoModo[] = [
  { nombre: "front", consulta: "modo=front", modo: "front", frontActivo: true, confiable: false },
  { nombre: "back", consulta: "modo=back", modo: "back", frontActivo: false, confiable: true },
  { nombre: "front-back estricta", consulta: "modo=front-back&validacion=estricta", modo: "front-back", frontActivo: true, confiable: true },
  { nombre: "front-back auto sin limitar", consulta: "modo=front-back&validacion=auto", modo: "front-back", frontActivo: true, confiable: true },
  { nombre: "front-back auto con deviceMemory 2", consulta: "modo=front-back&validacion=auto", memoria: 2, modo: "front-back", frontActivo: false, confiable: true },
];

test.describe("SDK-60 Matriz de modos sobre el ejemplo Express", () => {
  test.describe.configure({ timeout: 300_000 });

  for (const caso of CASOS) {
    // `front` no contacta el backend: no tiene variante de streaming.
    for (const streaming of caso.modo === "front" ? [true] : [true, false]) {
      test(`SDK-60 ${caso.nombre}${caso.modo === "front" ? "" : streaming ? " con streaming" : " sin streaming"}`, async ({ page }) => {
        if (caso.memoria !== undefined) {
          const gb = caso.memoria;
          await page.addInitScript((v) => Object.defineProperty(Navigator.prototype, "deviceMemory", { get: () => v, configurable: true }), gb);
        }
        await vigilarCampos(page);
        const peticiones = peticionesBackend(page);
        const rutas = rutasPedidas(page);
        await abrir(page, `${BASE}?${caso.consulta}${streaming ? "" : "&streaming=0"}`);
        await esperarResultado(page);
        await expect(prueba(page, "modo")).toHaveText(caso.modo);
        await expect(prueba(page, "front-activo")).toHaveText(String(caso.frontActivo));
        await expect(prueba(page, "confiable")).toHaveText(String(caso.confiable));
        if (caso.modo === "front") {
          expect(peticiones).toHaveLength(0);
        } else {
          expect(peticiones).toHaveLength(1);
          expect(await campos(page)).toStrictEqual([caso.frontActivo ? ["imagen", "cliente"] : ["imagen"]]);
          const tipo = (await peticiones[0]?.response())?.headers()["content-type"];
          expect(tipo).toBe(streaming ? "application/x-ndjson; charset=utf-8" : "application/json; charset=utf-8");
        }
        if (!caso.frontActivo) {
          const pesados = await recursosPesados(page);
          expect(pesados.length).toBeGreaterThan(0);
          expect(rutas.filter((r) => pesados.includes(r))).toStrictEqual([]);
          const sdk = await bytesSdk(page, rutas);
          expect(sdk.chunks).toHaveLength(1);
          // Sin avisos legales ni nada pesado: solo el Worker de calidad y el manifiesto (SDK-56).
          expect(sdk.recursos).toStrictEqual(["/lector-cedula/calidad.js", "/lector-cedula/manifest.json"]);
          expect(sdk.total).toBeLessThanOrEqual(PRESUPUESTO_BACK);
        }
      });
    }
  }
});

test.describe("SDK-46 y MOT-15 front + backend propio de punta a punta", () => {
  test.describe.configure({ timeout: 300_000 });

  test("MOT-15 Front y back de punta a punta (front-back estricta): confiable, 1 petición con cliente y axe", async ({ page }) => {
    const consola = vigilarConsola(page);
    await vigilarCampos(page);
    const peticiones = peticionesBackend(page);
    await abrir(page, BASE);
    await esperarResultado(page);
    await expect(prueba(page, "confiable")).toHaveText("true");
    expect(peticiones).toHaveLength(1);
    expect(peticiones[0]?.method()).toBe("POST");
    expect(await campos(page)).toStrictEqual([["imagen", "cliente"]]);
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toStrictEqual([]);
    for (const m of consola) expect(m).not.toContain(NUIP);
  });

  test("SDK-46 Secuencia completa con el backend real: verificando entre leyendo y resultado, etapas en orden", async ({ page }) => {
    await abrir(page, BASE);
    await esperarResultado(page);
    const fases = (await prueba(page, "fases").textContent())?.split(",") ?? [];
    expect(fases.slice(0, 2)).toStrictEqual(["permiso", "activo"]);
    expect(fases.slice(-3)).toStrictEqual(["leyendo", "verificando", "resultado"]);
    // Con NDJSON en vivo cada evento se observa (suscribir no pierde estados): la secuencia literal de SDK-46.
    await expect(prueba(page, "etapas")).toHaveText("recibido,leyendo,fraude,comparando");
    await expect(prueba(page, "etapa")).toHaveText("");
  });
});

test.describe("SDK-60 y SDK-58 front-back sin red", () => {
  test.describe.configure({ timeout: 300_000 });

  test("SDK-60 Front-back sin red: en-espera con el resultado local no confiable y, al volver la red, confiable", async ({ page, context }) => {
    const peticiones = peticionesBackend(page);
    await abrir(page, BASE);
    // El motor local se verifica y se carga en memoria (blob:) antes de abrir la cámara: en `activo` ya no hace falta red.
    await expect(prueba(page, "fase")).toHaveText(/activo|listo/u, { timeout: 120_000 });
    await context.setOffline(true);
    await expect(prueba(page, "etapa")).toHaveText("en-espera", { timeout: 180_000 });
    await expect(prueba(page, "fase")).toHaveText("verificando");
    await expect(prueba(page, "nuip")).toHaveText(NUIP);
    await expect(prueba(page, "confiable")).toHaveText("false");
    expect(peticiones).toHaveLength(0);
    // SDK-58: la cola vive solo en memoria.
    const almacenado = await page.evaluate(async () => ({
      local: localStorage.length,
      sesion: sessionStorage.length,
      bases: (await indexedDB.databases()).length,
      caches: (await caches.keys()).filter((k) => !k.startsWith("lector-cedula-sdk-")),
    }));
    expect(almacenado).toStrictEqual({ local: 0, sesion: 0, bases: 0, caches: [] });
    await context.setOffline(false);
    await expect(prueba(page, "confiable")).toHaveText("true", { timeout: 180_000 });
    await expect(prueba(page, "fase")).toHaveText("resultado");
    expect(peticiones).toHaveLength(1);
  });
});
