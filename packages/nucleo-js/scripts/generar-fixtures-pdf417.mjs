// Fixtures sintéticos de NAT-05 para las instrumentadas de Android (sdk-nativo, tarea 1.4; KI). Lee el frame 0 de
// `amarilla-1080p` y `digital-1080p` (e2e/videos/sinteticos, `npm run e2e:videos`), los pasa a RGBA con la misma
// conversión BT.601 que las pruebas Kotlin (Fixtures.kt), compone el anverso con un QR sintético sin datos y escribe:
// - `amarilla-1080p.rgba` y `digital-qr-1080p.rgba` (RGBA crudo, 1920x1080);
// - `oraculo.json`: los bytes que devuelve `decodificarPdf417Imagen` de packages/capture sobre el mismo frame de la
//   amarilla (diferencial con la web) y la comprobación de que el QR es legible para zxing-wasm (prueba no vacía).
// fixture-sintetico: PERSONA_BASE (NUIP 9999123456) y un QR con texto fijo; ningún dato real. Las imágenes solo existen
// en `native/android/lector-cedula/src/androidTest/assets/sinteticos/pdf417`, assets de las instrumentadas ignorados por
// git (native/android/.gitignore).
// Uso: node packages/nucleo-js/scripts/generar-fixtures-pdf417.mjs
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PNG } from "pngjs";
import { readBarcodes } from "zxing-wasm/reader";
import { writeBarcode } from "zxing-wasm/writer";
import { prepararZxing } from "../../capture/test/pdf417/sintetica.ts";
import { fuentesParsers } from "./construir.mjs";

const dirPaquete = fileURLToPath(new URL("..", import.meta.url));
const raiz = resolve(dirPaquete, "..", "..");
export const DIR_SALIDA = resolve(raiz, "native", "android", "lector-cedula", "src", "androidTest", "assets", "sinteticos", "pdf417");
// `DIR_VIDEOS_SINTETICOS` permite leer los vídeos de otro checkout (p. ej. un worktree sin vídeos generados).
const DIR_VIDEOS = process.env.DIR_VIDEOS_SINTETICOS ?? resolve(raiz, "e2e", "videos", "sinteticos");

/** Texto del QR sintético: no es un dato de ninguna persona ni el formato del QR de la cédula digital. */
export const TEXTO_QR = "QR SINTETICO SIN DATOS";
/** Posición y lado del QR (con su zona de silencio) dentro de la tarjeta de `digital-1080p`. */
const QR = { x: 1330, y: 600, lado: 320, silencio: 32 };

const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

/** Frame 0 de un `.y4m` 4:2:0 en RGBA (BT.601 entero de rango limitado, igual que Fixtures.kt). */
export function frameY4m(bytes) {
  const finCabecera = bytes.indexOf(0x0a);
  const campos = new TextDecoder("latin1").decode(bytes.subarray(0, finCabecera)).split(" ");
  const w = Number(campos.find((c) => c.startsWith("W")).slice(1));
  const h = Number(campos.find((c) => c.startsWith("H")).slice(1));
  const inicio = bytes.indexOf(0x0a, finCabecera + 1) + 1;
  const cw = w / 2;
  const u0 = inicio + w * h;
  const v0 = u0 + cw * (h / 2);
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = bytes[inicio + y * w + x] - 16;
      const d = bytes[u0 + (y >> 1) * cw + (x >> 1)] - 128;
      const e = bytes[v0 + (y >> 1) * cw + (x >> 1)] - 128;
      const o = (y * w + x) * 4;
      data[o] = clamp((298 * c + 409 * e + 128) >> 8);
      data[o + 1] = clamp((298 * c - 100 * d - 208 * e + 128) >> 8);
      data[o + 2] = clamp((298 * c + 516 * d + 128) >> 8);
      data[o + 3] = 255;
    }
  }
  return { data, width: w, height: h };
}

/** Copia de `p` con el QR de `TEXTO_QR` (escalado sin suavizado) sobre un cuadrado blanco. */
export async function conQr(p) {
  const escrito = await writeBarcode(TEXTO_QR, { format: "QRCode" });
  if (escrito.image === null) throw new Error(`writer: ${escrito.error}`);
  const codigo = PNG.sync.read(Buffer.from(await escrito.image.arrayBuffer()));
  const data = Uint8ClampedArray.from(p.data);
  const total = QR.lado + 2 * QR.silencio;
  for (let y = 0; y < total; y++) {
    for (let x = 0; x < total; x++) {
      const qx = x - QR.silencio;
      const qy = y - QR.silencio;
      let v = 255;
      if (qx >= 0 && qy >= 0 && qx < QR.lado && qy < QR.lado) {
        const sx = Math.floor((qx * codigo.width) / QR.lado);
        const sy = Math.floor((qy * codigo.height) / QR.lado);
        v = codigo.data[(sy * codigo.width + sx) * 4] < 128 ? 0 : 255;
      }
      const o = ((QR.y + y) * p.width + QR.x + x) * 4;
      data[o] = v;
      data[o + 1] = v;
      data[o + 2] = v;
      data[o + 3] = 255;
    }
  }
  return { data, width: p.width, height: p.height };
}

/** `decodificarPdf417Imagen` de packages/capture compilado desde la fuente (parsers incluidos) a un módulo temporal. */
async function decodificadorWeb() {
  const { build } = await import("esbuild");
  const salida = resolve(dirPaquete, "dist", "oraculo-pdf417.mjs");
  await build({
    entryPoints: [resolve(raiz, "packages", "capture", "src", "pdf417", "decodificar.ts")],
    outfile: salida,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node22",
    logLevel: "silent",
    absWorkingDir: raiz,
    plugins: [fuentesParsers],
    external: ["zxing-wasm", "zxing-wasm/*", "pngjs", "jpeg-js"],
  });
  try {
    return (await import(pathToFileURL(salida).href)).decodificarPdf417Imagen;
  } finally {
    rmSync(salida, { force: true });
  }
}

const base64 = (b) => Buffer.from(b).toString("base64");

export async function generar() {
  await prepararZxing();
  const decodificar = await decodificadorWeb();
  const amarilla = frameY4m(readFileSync(join(DIR_VIDEOS, "amarilla-1080p.y4m")));
  const digital = frameY4m(readFileSync(join(DIR_VIDEOS, "digital-1080p.y4m")));
  const qr = await conQr(digital);

  const web = await decodificar(amarilla);
  if (!web.ok) throw new Error(`la web no lee amarilla-1080p: ${web.error}`);
  const leidosQr = await readBarcodes(qr, { formats: ["QRCode"], maxNumberOfSymbols: 1 });
  const qrLegible = leidosQr.some((r) => r.isValid && r.text === TEXTO_QR);
  if (!qrLegible) throw new Error("el QR sintético no es legible: la prueba de NAT-05 sería vacía");
  const webQr = await decodificar(qr);
  if (webQr.ok) throw new Error("la web encontró un PDF417 en el anverso con QR");

  mkdirSync(DIR_SALIDA, { recursive: true });
  writeFileSync(join(DIR_SALIDA, "amarilla-1080p.rgba"), amarilla.data);
  writeFileSync(join(DIR_SALIDA, "digital-qr-1080p.rgba"), qr.data);
  const oraculo = {
    sintetico: true,
    ancho: amarilla.width,
    alto: amarilla.height,
    amarilla: { bytes: base64(web.bytes), intento: web.intento },
    qr: { qrLegible, pdf417Web: webQr.error },
  };
  writeFileSync(join(DIR_SALIDA, "oraculo.json"), `${JSON.stringify(oraculo, null, 2)}\n`);
  return oraculo;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const o = await generar();
  process.stdout.write(`fixtures NAT-05 en ${dirname(join(DIR_SALIDA, "x"))}: amarilla (${o.amarilla.intento}), QR legible ${o.qr.qrLegible}\n`);
}
