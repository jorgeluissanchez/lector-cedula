// Lector de imagen del motor real (cambio motor-real-servidor, MS-16 a MS-19): el mismo lector de
// packages/capture que usan la CLI (tools/leer-foto.mjs) y la PWA, ejecutado con Node en el contenedor.
//
// Lee una petición JSON de la entrada estándar y escribe una respuesta JSON en la salida estándar:
//   entrada: {"tipo": "co_national-id-2000" | "co_national-id-2020", "fecha_referencia": "AAAA-MM-DD",
//             "imagenes_b64": [<reverso>, <anverso>]}
//   salida:  {"ok": true, "pdf417_b64": "..."} | {"ok": true, "mrz": [l1, l2, l3]} | {"ok": false, "motivo": "..."}
// Privacidad (principio III): las imágenes solo viven en memoria y se ponen a cero tras leerlas; no se escribe a
// disco, no hay red (WASM, worker y modelo vienen en la imagen) y la salida de errores no lleva nada.
import { crearLectorMrz, decodificarPdf417Imagen } from "@lector-cedula/capture";

const RUTA_MODELO = process.env.LECTOR_CEDULA_RUTA_MODELO_MRZ ?? "/srv/modelos/tesseract";
// Presupuesto de la MRZ en el servidor (MS-18): menor que los 60 s de la CLI para acotar la subida.
const TIEMPO_LIMITE_MRZ_MS = Number(process.env.LECTOR_TIEMPO_LIMITE_MRZ_MS ?? 20_000);
const MAX_ENTRADA = 24 * 1024 * 1024;

async function leerEntrada() {
  const trozos = [];
  let total = 0;
  for await (const trozo of process.stdin) {
    total += trozo.length;
    if (total > MAX_ENTRADA) return null;
    trozos.push(trozo);
  }
  try {
    return JSON.parse(Buffer.concat(trozos).toString("utf8"));
  } catch {
    return null;
  }
}

async function leerPdf417(imagenes) {
  for (const imagen of imagenes) {
    const r = await decodificarPdf417Imagen(imagen);
    if (r.ok) {
      const salida = { ok: true, pdf417_b64: Buffer.from(r.bytes).toString("base64") };
      r.bytes.fill(0);
      return salida;
    }
  }
  return { ok: false, motivo: "no-encontrado" };
}

/** El presupuesto es de toda la subida: cada imagen recibe lo que queda (MS-18). */
async function leerMrz(imagenes, fechaReferencia) {
  const limite = Date.now() + TIEMPO_LIMITE_MRZ_MS;
  for (const imagen of imagenes) {
    const restante = limite - Date.now();
    if (restante <= 0) break;
    const lector = crearLectorMrz({ rutaModelo: RUTA_MODELO, tiempoLimiteMs: restante });
    try {
      const r = await lector.leer(imagen, { fechaReferencia });
      if (r.ok) return { ok: true, mrz: r.resultado.lineasCorregidas };
      if (r.error === "modelo-no-disponible" || r.error === "fecha-referencia-invalida") {
        return { ok: false, motivo: r.error };
      }
    } finally {
      await lector.terminar();
    }
  }
  return { ok: false, motivo: "no-encontrado" };
}

async function principal() {
  const peticion = await leerEntrada();
  if (
    peticion === null ||
    typeof peticion !== "object" ||
    !Array.isArray(peticion.imagenes_b64) ||
    peticion.imagenes_b64.length === 0 ||
    !peticion.imagenes_b64.every((i) => typeof i === "string")
  ) {
    return { ok: false, motivo: "entrada-no-valida" };
  }
  const imagenes = peticion.imagenes_b64.map((i) => new Uint8Array(Buffer.from(i, "base64")));
  peticion.imagenes_b64 = null;
  try {
    if (peticion.tipo === "co_national-id-2000") return await leerPdf417(imagenes);
    if (peticion.tipo === "co_national-id-2020") return await leerMrz(imagenes, peticion.fecha_referencia);
    return { ok: false, motivo: "tipo-desconocido" };
  } finally {
    for (const imagen of imagenes) imagen.fill(0);
  }
}

// Cualquier fallo sale como respuesta fija y código 1, sin mensaje ni traza (podrían llevar datos).
try {
  process.stdout.write(JSON.stringify(await principal()));
} catch {
  process.stdout.write(JSON.stringify({ ok: false, motivo: "error-interno" }));
  process.exitCode = 1;
}
