// Solo pruebas (MS-16): escribe en la salida estándar un PNG con el PDF417 del payload recibido en hexadecimal por
// la entrada estándar, con el writer de zxing-wasm empaquetado en la imagen. Todo en memoria; sin red.
// El payload viene de evals/fixtures/sinteticos (persona ficticia, números 9999...).
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const requerir = createRequire("/srv/lector/node_modules/");
const { prepareZXingModule, writeBarcode } = await import(requerir.resolve("zxing-wasm/writer"));
const wasm = readFileSync(requerir.resolve("zxing-wasm/writer/zxing_writer.wasm"));
await prepareZXingModule({ overrides: { wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) }, fireImmediately: true });

let hex = "";
for await (const trozo of process.stdin) hex += trozo;
const escrito = await writeBarcode(new Uint8Array(Buffer.from(hex.trim(), "hex")), { format: "PDF417", scale: 3 });
if (escrito.image === null) throw new Error("writer sin imagen");
process.stdout.write(Buffer.from(await escrito.image.arrayBuffer()));
