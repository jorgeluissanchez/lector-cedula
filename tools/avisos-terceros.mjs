/**
 * Avisos de terceros (THIRD_PARTY_LICENSES.txt) compartidos por la PWA (pwa-lectura-offline, OFF-20) y por el paquete
 * npm @lector-cedula/web (sdk-integracion, SDK-26). Los textos de node_modules se leen de sus archivos LICENSE; los que
 * no vienen en un paquete npm (Tesseract OCR, Leptonica, libtiff, zlib, zxing-cpp, tabla DIVIPOL de Eitol, modelo
 * tesseract-mrz) están en apps/pwa/licencias/. El modelo se describe con la fuente y el sha256 de models/manifest.json.
 * Los datos de consulados 2018 (Registraduría) son CC BY-SA 4.0: se atribuyen con su código legal.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const CURADAS = join(RAIZ, "apps", "pwa", "licencias");
export const CODIGO_LEGAL_CC_BY_SA = "https://creativecommons.org/licenses/by-sa/4.0/legalcode.es";

/** Ruta directa: algunos paquetes (zxing-wasm) no exportan package.json. npm workspaces los instala en la raíz. */
function licenciaPaquete(paquete, archivo) {
  return readFileSync(join(RAIZ, "node_modules", paquete, archivo), "utf8").trim();
}

function versionPaquete(paquete) {
  return JSON.parse(readFileSync(join(RAIZ, "node_modules", paquete, "package.json"), "utf8")).version;
}

const curada = (nombre) => readFileSync(join(CURADAS, nombre), "utf8").trim();

function seccion(titulo, cuerpo) {
  return `${"=".repeat(78)}\n${titulo}\n${"=".repeat(78)}\n\n${cuerpo}\n`;
}

function seccionModelo() {
  const modelos = JSON.parse(readFileSync(join(RAIZ, "models", "manifest.json"), "utf8"));
  const mrz = modelos.find((m) => m.nombre === "tesseract-mrz");
  if (mrz === undefined) throw new Error("models/manifest.json sin tesseract-mrz");
  return seccion(`tesseract-mrz: mrz.traineddata (${mrz.licencia})`, `Fuente: ${mrz.fuente}\nsha256: ${mrz.sha256}\n\n${curada("TESSERACT-MRZ.txt")}`);
}

/** Secciones del motor (tesseract.js y zxing-wasm con lo que compilan dentro), comunes a la PWA y al SDK. */
function seccionesMotor() {
  return [
    seccion("tesseract.js 7.0.0 (Apache-2.0)", licenciaPaquete("tesseract.js", "LICENSE.md")),
    seccion("tesseract.js-core (Apache-2.0)", licenciaPaquete("tesseract.js-core", "LICENSE")),
    seccion(
      "Bibliotecas incluidas en el binario WebAssembly de tesseract.js-core",
      ["TESSERACT-OCR.txt", "LEPTONICA.txt", "LIBTIFF.txt", "ZLIB.txt"].map(curada).join("\n\n"),
    ),
    seccion("zxing-wasm 3.1.5 (MIT)", licenciaPaquete("zxing-wasm", "LICENSE")),
    seccion("zxing-cpp (Apache-2.0), compilado dentro de zxing_reader.wasm", curada("ZXING-CPP.txt")),
  ];
}

const DIVIPOL = () => seccion("Tabla DIVIPOL: Eitol/colombian-cedula-reader (MIT)", curada("EITOL-DIVIPOL.txt"));

/** THIRD_PARTY_LICENSES.txt de la PWA (OFF-20, condición C3 del revisor de licencias). */
export function textoAvisosTercerosPwa() {
  return [
    "Avisos de terceros de Lector de cédula (PWA). El código propio se distribuye bajo licencia MIT.\n",
    ...seccionesMotor(),
    seccion("Preact (MIT)", licenciaPaquete("preact", "LICENSE")),
    seccion("mrz 5.0.2 (MIT)", licenciaPaquete("mrz", "LICENSE")),
    DIVIPOL(),
    seccionModelo(),
  ].join("\n");
}

const CONSULADOS_2018 = [
  "Autor: Registraduría Nacional del Estado Civil.",
  "Título: Divipole Exterior Presidente 2018 (datos.gov.co, conjunto vh8b-jfhg).",
  "Fuente: https://www.datos.gov.co/d/vh8b-jfhg",
  `Licencia: Creative Commons Atribución-CompartirIgual 4.0 Internacional (CC BY-SA 4.0), ${CODIGO_LEGAL_CC_BY_SA}`,
  "Cambios: se extrajeron solo los códigos y nombres de consulados; se corrigieron erratas (AZERBAIYAN, VIETNAM y",
  "SINGAPUR) y se añadieron los códigos alternos 88195 y 88480. La tabla adaptada va compilada dentro de",
  "dist/assets/lector.js y se redistribuye bajo la misma licencia CC BY-SA 4.0.",
  "El material adaptado se ofrece tal cual, sin garantías de ningún tipo, y se usa sin aval de la Registraduría.",
  "El código de @lector-cedula/web es MIT y no queda sujeto a CC BY-SA 4.0.",
].join("\n");

/**
 * THIRD_PARTY_NOTICES de los paquetes npm del backend (motor-backend-embebido, MOT-18): @lector-cedula/motor ejecuta en
 * el servidor tesseract.js (Tesseract y Leptonica en su WASM), zxing-wasm (zxing-cpp), jpeg-js y pngjs con
 * mrz.traineddata, y la tabla DIVIPOL va dentro de @lector-cedula/parsers; @lector-cedula/servidor los carga con el motor.
 */
export function textoAvisosTercerosMotor(paquete) {
  const consulados = CONSULADOS_2018.split("\n")
    .slice(0, 5)
    .concat([
      "SINGAPUR) y se añadieron los códigos alternos 88195 y 88480. La tabla adaptada va dentro de @lector-cedula/parsers,",
      "que el motor usa en el servidor, y se redistribuye bajo la misma licencia CC BY-SA 4.0.",
      "El material adaptado se ofrece tal cual, sin garantías de ningún tipo, y se usa sin aval de la Registraduría.",
      `El código de ${paquete} es MIT y no queda sujeto a CC BY-SA 4.0.`,
    ])
    .join("\n");
  return [
    `Avisos de terceros de ${paquete}. El código propio se distribuye bajo licencia MIT (archivo LICENSE).\n`,
    ...seccionesMotor(),
    seccion(`jpeg-js ${versionPaquete("jpeg-js")} (BSD-3-Clause)`, licenciaPaquete("jpeg-js", "LICENSE")),
    seccion(`pngjs ${versionPaquete("pngjs")} (MIT)`, licenciaPaquete("pngjs", "LICENSE")),
    DIVIPOL(),
    seccion("Consulados DIVIPOL 2018: Registraduría Nacional del Estado Civil (CC BY-SA 4.0)", consulados),
    seccionModelo(),
  ].join("\n");
}

/** THIRD_PARTY_LICENSES.txt del paquete npm @lector-cedula/web (SDK-26): solo lo que va en su tarball. */
export function textoAvisosTercerosWeb() {
  return [
    "Avisos de terceros de @lector-cedula/web. El código propio se distribuye bajo licencia MIT (archivo LICENSE).\n",
    ...seccionesMotor(),
    seccion(`jpeg-js ${versionPaquete("jpeg-js")} (BSD-3-Clause)`, licenciaPaquete("jpeg-js", "LICENSE")),
    seccion(`pngjs ${versionPaquete("pngjs")} (MIT)`, licenciaPaquete("pngjs", "LICENSE")),
    DIVIPOL(),
    seccion("Consulados DIVIPOL 2018: Registraduría Nacional del Estado Civil (CC BY-SA 4.0)", CONSULADOS_2018),
    seccionModelo(),
  ].join("\n");
}
