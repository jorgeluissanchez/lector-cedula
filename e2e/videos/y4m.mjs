// Lectura pura de la cabecera Y4M (YUV4MPEG2), la primera línea del archivo. Tarea 5.4 de captura-calidad-pwa.

/**
 * @param {Uint8Array} bytes primeros bytes del archivo (basta con la primera línea)
 * @returns {{ ancho: number, alto: number, fps: number, croma: string, texto: string }}
 */
export function leerCabeceraY4m(bytes) {
  const fin = bytes.indexOf(0x0a);
  if (fin < 0) throw new Error("y4m-sin-fin");
  const texto = new TextDecoder("latin1").decode(bytes.subarray(0, fin));
  const [firma, ...campos] = texto.split(" ");
  if (firma !== "YUV4MPEG2") throw new Error("y4m-firma");
  const valor = (letra) => campos.find((c) => c.startsWith(letra))?.slice(1);
  const ancho = Number(valor("W"));
  const alto = Number(valor("H"));
  if (!(Number.isInteger(ancho) && ancho > 0 && Number.isInteger(alto) && alto > 0)) throw new Error("y4m-dimensiones");
  const [num, den] = (valor("F") ?? "").split(":").map(Number);
  if (!(num > 0 && den > 0)) throw new Error("y4m-fps");
  return { ancho, alto, fps: num / den, croma: valor("C") ?? "420", texto };
}
