/**
 * Base64 estándar (RFC 4648, sección 4) a bytes, sin `atob` ni `Buffer` (QuickJS y JavaScriptCore no los garantizan).
 * Estricto: devuelve `null` ante cualquier carácter fuera del alfabeto, relleno mal puesto o longitud no múltiplo de 4.
 */
const ALFABETO = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

const VALORES: ReadonlyMap<string, number> = new Map([...ALFABETO].map((c, i) => [c, i]));

export function decodificarBase64(texto: unknown): Uint8Array | null {
  if (typeof texto !== "string" || texto.length === 0 || texto.length % 4 !== 0) return null;
  const relleno = texto.endsWith("==") ? 2 : texto.endsWith("=") ? 1 : 0;
  const cuerpo = texto.slice(0, texto.length - relleno);
  const bytes = new Uint8Array((texto.length / 4) * 3 - relleno);
  let acumulado = 0;
  let bits = 0;
  let j = 0;
  for (const c of cuerpo) {
    const v = VALORES.get(c);
    if (v === undefined) return null;
    acumulado = ((acumulado << 6) | v) & 0xffffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[j++] = (acumulado >> bits) & 0xff;
    }
  }
  return bytes;
}
