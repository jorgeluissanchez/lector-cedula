// SDK-56: carga solo de recursos ligeros (sin los marcados `pesado`) y marcado del manifiesto real.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cargarMotor, motorMemorizado } from "../../src/cargador.js";
import { leerManifiesto } from "../../src/integridad.js";
import { VERSION } from "../../src/version.js";

const REC = "https://app-a.example/lector-cedula/";
const sha = (b: Uint8Array): string => createHash("sha256").update(b).digest("hex");
const ARCHIVOS: Record<string, { datos: Uint8Array; pesado: boolean }> = {
  "calidad.js": { datos: new TextEncoder().encode("self.onmessage=null;"), pesado: false },
  "lector.js": { datos: new TextEncoder().encode("self.x=1;"), pesado: true },
  "zxing_reader.wasm": { datos: new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]), pesado: true },
};
const MANIFIESTO = new TextEncoder().encode(
  JSON.stringify({ version: VERSION, recursos: Object.entries(ARCHIVOS).map(([archivo, a]) => ({ archivo, bytes: a.datos.byteLength, sha256: sha(a.datos), tipo: "text/javascript", pesado: a.pesado })) }),
);

function entorno() {
  const pedidas: string[] = [];
  return {
    pedidas,
    fetch: async (u: string) => {
      pedidas.push(u.slice(u.lastIndexOf("/") + 1));
      const nombre = u.slice(u.lastIndexOf("/") + 1);
      const datos = nombre === "manifest.json" ? MANIFIESTO : ARCHIVOS[nombre]?.datos;
      return datos === undefined ? new Response("no", { status: 404 }) : new Response(datos.slice());
    },
    crearUrl: (b: Blob) => `blob:${b.size}`,
  };
}

describe("SDK-56 Carga solo de recursos ligeros", () => {
  it("con soloLigeros solo se descargan el manifiesto y los recursos sin pesado", async () => {
    const e = entorno();
    const m = await cargarMotor(REC, e, { soloLigeros: true });
    expect(e.pedidas.sort()).toStrictEqual(["calidad.js", "manifest.json"]);
    expect(Object.keys(m.urls)).toStrictEqual(["calidad.js"]);
  });

  it("sin la opción se descarga todo", async () => {
    const e = entorno();
    await cargarMotor(REC, e);
    expect(e.pedidas.sort()).toStrictEqual(["calidad.js", "lector.js", "manifest.json", "zxing_reader.wasm"]);
  });

  it("la memoria distingue la carga ligera de la completa", async () => {
    const e = entorno();
    await motorMemorizado("https://ligero.example/r/", e, { soloLigeros: true });
    await motorMemorizado("https://ligero.example/r/", e);
    expect(e.pedidas.filter((p) => p === "lector.js")).toHaveLength(1);
  });

  it("leerManifiesto acepta pesado booleano y rechaza otro tipo", () => {
    const base = { archivo: "a.js", bytes: 1, sha256: "a".repeat(64), tipo: "text/javascript" };
    expect(leerManifiesto({ version: "1", recursos: [{ ...base, pesado: true }] })?.recursos[0]?.pesado).toBe(true);
    expect(leerManifiesto({ version: "1", recursos: [{ ...base, pesado: "si" }] })).toBeNull();
  });

  it("el manifest.json construido marca como pesados el motor y no la calidad", () => {
    const ruta = new URL("../../dist/assets/manifest.json", import.meta.url);
    if (!existsSync(ruta)) return;
    const m = JSON.parse(readFileSync(ruta, "utf8")) as { recursos: { archivo: string; pesado?: boolean }[] };
    const pesados = m.recursos.filter((r) => r.pesado === true).map((r) => r.archivo).sort();
    expect(pesados).toStrictEqual(["lector.js", "mrz.traineddata", "tesseract-core-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js", "tesseract-worker.min.js", "zxing_reader.wasm"]);
    expect(m.recursos.find((r) => r.archivo === "calidad.js")?.pesado).toBe(false);
  });
});
