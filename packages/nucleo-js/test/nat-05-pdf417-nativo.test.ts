// NAT-05 (sdk-nativo, tarea 1.4): análisis estático del decodificador PDF417 nativo (solo el formato PDF417, sin logs)
// y pruebas del generador de fixtures de las instrumentadas (scripts/generar-fixtures-pdf417.mjs).
// fixture-sintetico: un Y4M de 2x2 escrito en la prueba y un QR con texto fijo; ningún dato real.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { readBarcodes } from "zxing-wasm/reader";
import { describe, expect, it } from "vitest";
import { prepararZxing } from "../../capture/test/pdf417/sintetica.ts";
import { conQr, frameY4m, TEXTO_QR } from "../scripts/generar-fixtures-pdf417.mjs";

const RAIZ = fileURLToPath(new URL("../../..", import.meta.url));
const ES_PRUEBA = /(^|\/)(test|androidTest|testFixtures|Tests|[A-Za-z]+Tests)\//u;

/** Hallazgos de NAT-05 en una fuente nativa de producción: formatos distintos de PDF_417 y escrituras en log. */
export function hallazgosPdf417(ruta: string, contenido: string): string[] {
  const r = ruta.split(sep).join("/");
  if (!/\.(kt|swift)$/u.test(r) || ES_PRUEBA.test(r)) return [];
  const hallazgos: string[] = [];
  for (const m of contenido.matchAll(/\bFormat\.([A-Z_0-9]+)/gu)) if (m[1] !== "PDF_417") hallazgos.push(`${r}: Format.${m[1]}`);
  if (/\bBarcodeFormat\.(qr|QR)|\.qrCode\b|QR_CODE/u.test(contenido)) hallazgos.push(`${r}: QR`);
  if (/\bLog\.[a-z]+\(|\bprintln\(|\bSystem\.(out|err)\b|\bTimber\./u.test(contenido)) hallazgos.push(`${r}: log`);
  return hallazgos;
}

function fuentes(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name === "build" || e.name === ".gradle" || e.name.startsWith(".")) return [];
    const ruta = join(dir, e.name);
    return e.isDirectory() ? fuentes(ruta) : [ruta];
  });
}

describe("NAT-05 PDF417 nativo: análisis estático", () => {
  it("NAT-05 QR de la digital ignorado: el detector marca otros formatos, el QR y los logs, y no las pruebas", () => {
    const kt = "val o = Options(formats = setOf(Format.PDF_417, Format.QR_CODE))\nLog.d(\"x\", bytes)\nprintln(t)\nSystem.out.write(b)";
    expect(hallazgosPdf417("native/android/lector-cedula/src/main/kotlin/X.kt", kt)).toStrictEqual([
      "native/android/lector-cedula/src/main/kotlin/X.kt: Format.QR_CODE",
      "native/android/lector-cedula/src/main/kotlin/X.kt: QR",
      "native/android/lector-cedula/src/main/kotlin/X.kt: log",
    ]);
    expect(hallazgosPdf417("native/android/lector-cedula/src/main/kotlin/X.kt", "setOf(Format.PDF_417)")).toStrictEqual([]);
    expect(hallazgosPdf417("native/android/lector-cedula/src/androidTest/kotlin/XTest.kt", kt)).toStrictEqual([]);
  });

  it("NAT-05 las fuentes nativas de producción solo usan PDF_417 y no escriben en logs", () => {
    const archivos = fuentes(join(RAIZ, "native"));
    expect(archivos.flatMap((a) => hallazgosPdf417(relative(RAIZ, a), readFileSync(a, "utf8")))).toStrictEqual([]);
    // El binding de zxing-cpp existe y declara PDF_417: el análisis no es vacío.
    const binding = archivos.find((a) => a.endsWith("LectorCodigosZxing.kt"));
    expect(binding).toBeDefined();
    expect(readFileSync(binding as string, "utf8")).toContain("setOf(BarcodeReader.Format.PDF_417)");
  });
});

describe("NAT-05 generador de fixtures de las instrumentadas", { timeout: 60_000 }, () => {
  it("frameY4m convierte el frame 0 de un Y4M 4:2:0 con BT.601 de rango limitado", () => {
    const cabecera = Buffer.from("YUV4MPEG2 W2 H2 F10:1 C420jpeg\nFRAME\n", "latin1");
    // Y = 16 (negro), 235 (blanco), 126 y 81; U = 128, V = 128 (gris) para los cuatro píxeles.
    const datos = Buffer.from([16, 235, 126, 81, 128, 128]);
    const f = frameY4m(new Uint8Array(Buffer.concat([cabecera, datos, Buffer.from("FRAME\n"), Buffer.alloc(6)])));
    expect(f.width).toBe(2);
    expect(f.height).toBe(2);
    expect(Array.from(f.data)).toStrictEqual([0, 0, 0, 255, 255, 255, 255, 255, 128, 128, 128, 255, 76, 76, 76, 255]);
  });

  it("conQr pone un QR legible con el texto fijo y no cambia los píxeles fuera de su cuadrado", async () => {
    await prepararZxing();
    const ancho = 1920;
    const alto = 1080;
    const base = { data: new Uint8ClampedArray(ancho * alto * 4).fill(90), width: ancho, height: alto };
    const conCodigo = await conQr(base);
    const leidos = await readBarcodes(conCodigo, { formats: ["QRCode"] });
    expect(leidos.map((r) => r.text)).toStrictEqual([TEXTO_QR]);
    expect(Array.from(base.data.subarray(0, 8))).toStrictEqual([90, 90, 90, 90, 90, 90, 90, 90]);
    expect(Array.from(conCodigo.data.subarray(0, 4))).toStrictEqual([90, 90, 90, 90]);
    const fin = conCodigo.data.length;
    expect(Array.from(conCodigo.data.subarray(fin - 4, fin))).toStrictEqual([90, 90, 90, 90]);
    expect(await readBarcodes(conCodigo, { formats: ["PDF417"] })).toStrictEqual([]);
  });
});
