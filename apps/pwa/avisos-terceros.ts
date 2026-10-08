/**
 * THIRD_PARTY_LICENSES.txt de la PWA (pwa-lectura-offline, OFF-20; condición C3 del revisor de licencias). Se genera
 * en la compilación con los textos de licencia de los componentes redistribuidos: los de node_modules se leen de sus
 * archivos LICENSE; los que no vienen en un paquete npm (Tesseract OCR, Leptonica, libtiff, zlib, zxing-cpp, tabla DIVIPOL de Eitol, modelo tesseract-mrz) están en
 * apps/pwa/licencias/. El modelo se describe con la fuente y el sha256 de models/manifest.json.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");

function licenciaPaquete(paquete: string, archivo: string): string {
  // Ruta directa: algunos paquetes (zxing-wasm) no exportan package.json. npm workspaces los instala en la raíz.
  return readFileSync(join(RAIZ, "node_modules", paquete, archivo), "utf8").trim();
}

const curada = (nombre: string): string => readFileSync(join(AQUI, "licencias", nombre), "utf8").trim();

interface EntradaModelo {
  readonly nombre: string;
  readonly licencia: string;
  readonly fuente: string;
  readonly sha256: string;
}

function seccion(titulo: string, cuerpo: string): string {
  return `${"=".repeat(78)}\n${titulo}\n${"=".repeat(78)}\n\n${cuerpo}\n`;
}

export function textoAvisosTerceros(): string {
  const modelos = JSON.parse(readFileSync(join(RAIZ, "models", "manifest.json"), "utf8")) as EntradaModelo[];
  const mrz = modelos.find((m) => m.nombre === "tesseract-mrz");
  if (mrz === undefined) throw new Error("models/manifest.json sin tesseract-mrz");
  const apache = licenciaPaquete("tesseract.js", "LICENSE.md");
  return [
    "Avisos de terceros de Lector de cédula (PWA). El código propio se distribuye bajo licencia MIT.\n",
    seccion("tesseract.js 7.0.0 (Apache-2.0)", apache),
    seccion("tesseract.js-core (Apache-2.0)", licenciaPaquete("tesseract.js-core", "LICENSE")),
    seccion(
      "Bibliotecas incluidas en el binario WebAssembly de tesseract.js-core",
      ["TESSERACT-OCR.txt", "LEPTONICA.txt", "LIBTIFF.txt", "ZLIB.txt"].map(curada).join("\n\n"),
    ),
    seccion("zxing-wasm 3.1.5 (MIT)", licenciaPaquete("zxing-wasm", "LICENSE")),
    seccion("zxing-cpp (Apache-2.0), compilado dentro de zxing_reader.wasm", curada("ZXING-CPP.txt")),
    seccion("Preact (MIT)", licenciaPaquete("preact", "LICENSE")),
    seccion("mrz 5.0.2 (MIT)", licenciaPaquete("mrz", "LICENSE")),
    seccion("Tabla DIVIPOL: Eitol/colombian-cedula-reader (MIT)", curada("EITOL-DIVIPOL.txt")),
    seccion(`tesseract-mrz: mrz.traineddata (${mrz.licencia})`, `Fuente: ${mrz.fuente}\nsha256: ${mrz.sha256}\n\n${curada("TESSERACT-MRZ.txt")}`),
  ].join("\n");
}
