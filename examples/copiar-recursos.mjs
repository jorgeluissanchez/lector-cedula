// Copia los assets de @lector-cedula/web (Worker, WASM, traineddata, DIVIPOL y manifest.json con SHA-256) a la carpeta
// pública del ejemplo, como haría un integrador (docs/sdk). Uso: node ../copiar-recursos.mjs <destino>
import { cp } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

const destino = process.argv[2];
if (destino === undefined) {
  console.error("uso: node copiar-recursos.mjs <destino>");
  process.exit(2);
}
const manifiesto = createRequire(import.meta.url).resolve("@lector-cedula/web/assets/manifest.json");
await cp(dirname(manifiesto), resolve(destino), { recursive: true });
