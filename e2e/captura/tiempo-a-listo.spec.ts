// CAL-13: tiempo desde "Iniciar cámara" hasta `listo`, 20 ejecuciones por dispositivo con recarga. El reporte solo
// contiene tiempos (ningún dato de imagen).
import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { esperarPantalla, iniciarCamara } from "./instrumentacion";

const N = 20;

test.describe.configure({ mode: "serial" });

test.describe("tiempo hasta listo", { timeout: 300_000 }, () => {
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
    writeFileSync(`reports/captura/tiempo-a-listo-${info.project.name}.json`, `${JSON.stringify(reporte, null, 2)}\n`);
    expect(Object.keys(reporte).sort()).toStrictEqual(["fecha", "medianaMs", "muestrasMs", "n", "p95Ms", "proyecto", "video"]);
    expect(muestras).toHaveLength(N);
    expect(p95).toBeLessThanOrEqual(3000);
    expect(mediana).toBeLessThanOrEqual(2000);
  });
});
