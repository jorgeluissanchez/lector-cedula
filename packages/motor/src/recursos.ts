// MOT-06 (D2 de design.md): recursos del motor solo desde el disco local, nunca por red. `mrz.traineddata` se verifica
// con el SHA-256 del manifiesto (models/manifest.json) antes de crear el motor: un byte alterado da `recurso-corrupto`.
// zxing-wasm y el worker y core de tesseract.js vienen en node_modules (los carga @lector-cedula/capture en Node, sin CDN).
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ErrorMotor } from "@lector-cedula/protocolo";

/** SHA-256 de `tesseract-mrz` en models/manifest.json (DoubangoTelecom/tesseractMRZ, BSD-3-Clause). */
export const SHA256_MRZ = "e44f5b7a6bdd3f382ef3bfa84ee0057f5897946a84a094c26910e0a124f3a9bd";
export const ARCHIVO_MODELO = "mrz.traineddata";

/** Directorio del modelo: opción, variable LECTOR_CEDULA_RUTA_MODELO_MRZ (como la CLI) o `models/tesseract` del repositorio. */
export function rutaModeloPorDefecto(): string {
  return process.env.LECTOR_CEDULA_RUTA_MODELO_MRZ || fileURLToPath(new URL("../../../models/tesseract", import.meta.url));
}

/** Lee el modelo a memoria, comprueba su SHA-256 y pone a cero la copia. Lanza `recurso-corrupto` si falta o no coincide. */
export function verificarModelo(directorio: string, esperado: string = SHA256_MRZ): void {
  let bytes: Buffer;
  try {
    bytes = readFileSync(join(directorio, ARCHIVO_MODELO));
  } catch {
    throw new ErrorMotor("recurso-corrupto");
  }
  const sha = createHash("sha256").update(bytes).digest("hex");
  bytes.fill(0);
  if (sha !== esperado) throw new ErrorMotor("recurso-corrupto");
}

/**
 * Modo de prueba `__registroBuferes` (MOT-07): solo con NODE_ENV=test y un arreglo instalado en esta clave global, cada
 * copia interna de la imagen y cada búfer de píxeles se registra para comprobar que termina a cero. No está en los tipos
 * públicos. En los workers el registro es del propio worker (las pruebas usan `hilos: 0`).
 */
const CLAVE_REGISTRO = Symbol.for("@lector-cedula/motor.registroBuferes");

export function registrarBufer<T extends Uint8Array | Uint8ClampedArray>(b: T): T {
  if (process.env.NODE_ENV === "test") {
    const registro = (globalThis as Record<symbol, unknown>)[CLAVE_REGISTRO];
    if (Array.isArray(registro)) registro.push(b);
  }
  return b;
}
