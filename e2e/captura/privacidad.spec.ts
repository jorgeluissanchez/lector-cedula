// CAM-11 (red y almacenamiento), CAM-01 (caché limitada), CAM-12 (Worker diferido) y CAL-15 (sin decodificadores).
import { expect, test, type Request } from "@playwright/test";
import { esperarPantalla, iniciarCamara, RUTA_PERMITIDA } from "./instrumentacion";

test.describe("privacidad", { timeout: 60_000 }, () => {
  test("CAM-11 Red y almacenamiento durante el flujo completo @video:nitida-1080p", async ({ page, context, baseURL }) => {
    const peticiones: Request[] = [];
    let websockets = 0;
    context.on("request", (r) => peticiones.push(r));
    page.on("websocket", () => websockets++);
    await page.goto("/");
    await iniciarCamara(page);
    await esperarPantalla(page, "listo", 30_000);
    await page.getByRole("button", { name: "Repetir" }).click();
    await esperarPantalla(page, "listo", 30_000);

    const origen = new URL(baseURL ?? "").origin;
    expect(peticiones.length).toBeGreaterThan(0);
    const fuera = peticiones
      .map((r) => ({ metodo: r.method(), url: new URL(r.url()), datos: r.postData() }))
      .filter((r) => r.metodo !== "GET" || r.url.origin !== origen || r.datos !== null || !RUTA_PERMITIDA.test(r.url.pathname))
      .map((r) => `${r.metodo} ${r.url.href}`);
    expect(fuera).toStrictEqual([]);
    expect(websockets).toBe(0);

    // CAL-15: ningún decodificador.
    expect(peticiones.map((r) => r.url()).filter((u) => /zxing|barcode|\.wasm$/i.test(new URL(u).pathname))).toStrictEqual([]);

    const almacenamiento = await page.evaluate(async () => {
      const raiz = await navigator.storage.getDirectory();
      const entradas: string[] = [];
      for await (const k of (raiz as unknown as { keys(): AsyncIterable<string> }).keys()) entradas.push(k);
      const urls: string[] = [];
      for (const n of await caches.keys()) for (const r of await (await caches.open(n)).keys()) urls.push(r.url);
      return { local: localStorage.length, sesion: sessionStorage.length, idb: await indexedDB.databases(), opfs: entradas, urls };
    });
    expect({ ...almacenamiento, urls: undefined }).toStrictEqual({ local: 0, sesion: 0, idb: [], opfs: [], urls: undefined });
    for (const u of almacenamiento.urls) {
      expect(new URL(u).origin).toBe(origen);
      expect(new URL(u).pathname).toMatch(RUTA_PERMITIDA);
    }
    expect(await context.cookies()).toStrictEqual([]);
  });

  test("CAM-12 Worker diferido @video:nitida-1080p", async ({ page, request }) => {
    // Solo peticiones de la página: la precarga del service worker no es carga en ejecución.
    const rutas: string[] = [];
    page.on("request", (r) => rutas.push(new URL(r.url()).pathname));
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Iniciar cámara" })).toBeVisible();
    const primerTramo = rutas.filter((r) => r.includes("calidad.worker"));
    const corte = rutas.length;
    await iniciarCamara(page);
    await esperarPantalla(page, "activo");
    await expect.poll(() => rutas.slice(corte).filter((r) => r.includes("calidad.worker")).length).toBe(1);
    expect(primerTramo).toStrictEqual([]);
    // El código del Worker no está en la carga inicial: se recorren el script de entrada, los modulepreload y sus
    // importaciones estáticas, y ninguno contiene el testigo del Worker; el chunk del Worker sí lo contiene.
    const html = await (await request.get("/")).text();
    const iniciales = [...html.matchAll(/<(?:script[^>]*\ssrc|link[^>]*rel="modulepreload"[^>]*\shref)="([^"]+\.js)"/g)].map((m) => m[1] as string);
    expect(iniciales.length).toBeGreaterThan(0);
    const visitados = new Map<string, string>();
    const pendientes = [...iniciales];
    while (pendientes.length > 0) {
      const ruta = pendientes.pop() as string;
      if (visitados.has(ruta)) continue;
      const codigo = await (await request.get(ruta)).text();
      visitados.set(ruta, codigo);
      // Importaciones estáticas (no `import(` dinámico ni `new URL(...)`).
      for (const m of codigo.matchAll(/(?:\bimport\s*|\bfrom\s*)["'](\.{1,2}\/[^"']+\.js)["']/g)) {
        pendientes.push(new URL(m[1] as string, `http://x${ruta}`).pathname);
      }
    }
    const TESTIGO = "frame-invalido";
    expect([...visitados].filter(([, c]) => c.includes(TESTIGO)).map(([r]) => r)).toStrictEqual([]);
    const rutaWorker = rutas.find((r) => r.includes("calidad.worker")) as string;
    expect(await (await request.get(rutaWorker)).text()).toContain(TESTIGO);
  });
});
