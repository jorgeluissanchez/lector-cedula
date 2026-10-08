// Lectura de los bytes crudos de una petición de Node (IncomingMessage de Express o Nest sobre Express),
// tolerando middlewares que ya consumieron el flujo. Tipos estructurales: no se importa ningún framework.

export interface PeticionNode extends AsyncIterable<unknown> {
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  rawBody?: unknown;
  readableEnded?: boolean;
}

export interface RespuestaNode {
  status(codigo: number): { end(): unknown };
}

const codificador = new TextEncoder();

/**
 * Orden: `rawBody` (Nest con `rawBody: true`, o un `verify` propio), cuerpo ya leído como bytes o texto,
 * flujo aún sin leer (troceado en Buffer) y, como último recurso, el JSON ya parseado re-serializado en forma compacta (la misma
 * que emite el servidor según AV-25), para el caso `express.json()` global antes del adaptador (SDK-21).
 */
export async function leerBytesNode(peticion: PeticionNode): Promise<Uint8Array> {
  if (peticion.rawBody instanceof Uint8Array) return peticion.rawBody;
  if (peticion.body instanceof Uint8Array) return peticion.body;
  if (typeof peticion.body === "string") return codificador.encode(peticion.body);
  if (peticion.readableEnded !== true) {
    const trozos: Uint8Array[] = [];
    for await (const trozo of peticion) trozos.push(trozo as Uint8Array);
    return Buffer.concat(trozos);
  }
  return codificador.encode(JSON.stringify(peticion.body) ?? "");
}

export function firmaNode(peticion: PeticionNode): string | undefined {
  const valor = peticion.headers["x-lector-signature"];
  return Array.isArray(valor) ? valor[0] : valor;
}
