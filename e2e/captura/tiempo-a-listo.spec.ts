// CAL-13: tiempo desde "Iniciar cámara" hasta `listo`, 20 ejecuciones por dispositivo con recarga. El reporte solo
// contiene tiempos (ningún dato de imagen).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { esperarPantalla, iniciarCamara } from "./instrumentacion";

const N = 20;

test.describe.configure({ mode: "serial" });

test.describe("tiempo hasta listo", { timeout: 300_000 }, () => {
  test.describe.configure({ timeout: 300_000 });
  test("CAL-13 Medición y umbral @video:nitida-1080p", async ({ page }, info) => {
    const muestras: number[] = [];
    for (let i = 0; i < N; i++) {
      if (i === 0) await page.goto("/");
      else await page.reload();
      await iniciarCamara(page);
      await esperarPantalla(page, "listo", 30_000);
      const ms = await page.evaluate(() => performance.getEntriesByName("captura:tiempo-a-listo", "measure").at(-1)?.duration ?? null);
      expect(ms).not.toBeNull();
      muestras.push(ms as number);
    }
    const orden = [...muestras].sort((a, b) => a - b);
    const p95 = orden[18] as number; // rango más cercano: posición 19 de 20
    const mediana = ((orden[9] as number) + (orden[10] as number)) / 2;
    const reporte = { video: "nitida-1080p", proyecto: info.project.name, n: N, muestrasMs: muestras, medianaMs: mediana, p95Ms: p95, fecha: new Date().toISOString() };
    mkdirSync("reports/captura", { recursive: true });
    const ruta = `reports/captura/tiempo-a-listo-${info.project.name}.json`;
    writeFileSync(ruta, `${JSON.stringify(reporte, null, 2)}\n`);
    // CAL-13 "Reporte sin datos de imagen": se relee el archivo escrito, no el objeto en memoria.
    const leido = JSON.parse(readFileSync(ruta, "utf8")) as Record<string, unknown>;
    expect(Object.keys(leido).sort()).toStrictEqual(["fecha", "medianaMs", "muestrasMs", "n", "p95Ms", "proyecto", "video"]);
    expect(leido.n).toBe(20);
    const leidas = leido.muestrasMs;
    expect(Array.isArray(leidas) && leidas.length === 20 && leidas.every((m) => typeof m === "number")).toBe(true);
    expect([leido.video, leido.proyecto]).toStrictEqual(["nitida-1080p", info.project.name]);
    expect(p95).toBeLessThanOrEqual(3000);
    expect(mediana).toBeLessThanOrEqual(2000);
  });
});
