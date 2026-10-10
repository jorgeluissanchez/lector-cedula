// MOT-10 (D6 de design.md): compara la lectura del servidor con la que envió el cliente. Pura; devuelve solo rutas de
// campo, nunca valores, para no filtrar datos en los registros del integrador. La decisión es del integrador.
// Los nombres siguen CamposDocumento (OD-22a), la salida común de leerDocumento en el front y en el motor; `tipo` es el
// tipo de documento (`tipo` en ResultadoPresentacion del SDK web, `tipoDocumento` en ResultadoLectura).
import type { ResultadoMotor } from "@lector-cedula/protocolo";

export const CAMPOS_COMPARADOS = [
  "tipo",
  "campos.nuip",
  "campos.apellidos",
  "campos.nombres",
  "campos.fechaNacimiento",
  "campos.sexo",
  "campos.rh",
] as const;

export type CampoComparado = (typeof CAMPOS_COMPARADOS)[number];

export interface Comparacion {
  readonly coincide: boolean;
  readonly diferencias: readonly (CampoComparado | "cliente-invalido")[];
}

const INVALIDO: Comparacion = { coincide: false, diferencias: ["cliente-invalido"] };

type Registro = Record<string, unknown>;

function esRegistro(x: unknown): x is Registro {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/** `undefined` y `null` son el mismo "ausente". Solo se comparan primitivos; un objeto nunca coincide. */
function iguales(a: unknown, b: unknown): boolean {
  const x = a ?? null;
  const y = b ?? null;
  if ((typeof x === "object" && x !== null) || (typeof y === "object" && y !== null)) return false;
  return x === y;
}

export function compararConCliente(servidor: ResultadoMotor, cliente: unknown): Comparacion {
  if (!esRegistro(cliente) || !esRegistro(cliente.campos)) return INVALIDO;
  const tipoCliente = cliente.tipo ?? cliente.tipoDocumento;
  if (typeof tipoCliente !== "string") return INVALIDO;
  const camposServidor: Registro = servidor.ok ? { ...(servidor.campos as Registro) } : {};
  const tipoServidor = servidor.ok ? servidor.tipoDocumento : null;
  const diferencias: CampoComparado[] = [];
  for (const ruta of CAMPOS_COMPARADOS) {
    if (ruta === "tipo") {
      if (!iguales(tipoServidor, tipoCliente)) diferencias.push(ruta);
      continue;
    }
    const clave = ruta.slice("campos.".length);
    if (!iguales(camposServidor[clave], cliente.campos[clave])) diferencias.push(ruta);
  }
  return { coincide: diferencias.length === 0, diferencias };
}
