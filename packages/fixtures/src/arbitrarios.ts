import fc from "fast-check";
import { ErrorFixture } from "./errores.js";
import type { VariantePdf417 } from "./hipotesis.js";
import { type FixtureMrz, generarMrzTd1, type VarianteMrz, VARIANTES_MRZ } from "./mrz.js";
import { type FixturePdf417, generarPdf417, VARIANTES_PDF417 } from "./pdf417.js";
import { diasDelMes, GRUPOS_RH, type PersonaFicticia } from "./persona.js";
import { SEMILLA_MAXIMA } from "./prng.js";

/** Listas fijas de nombres claramente ficticios (FX-23). */
const PRIMEROS_NOMBRES = ["FICTICIA", "FICTICIO", "SINTETICA", "SINTETICO", "PRUEBA", "MUESTRA", "EJEMPLO"] as const;
const APELLIDOS = ["PRUEBA", "EJEMPLO", "MUESTRA", "FICTICIO", "SINTETICO", "PEÑA", "NUÑEZ", "MUÑOZ", "MARTINEZ", "DE LA OSSA"] as const;
const SEGUNDOS_NOMBRES = ["", "LUZ", "ANA", "JOSE", "MARIA", "DEL CARMEN"] as const;

/** Pares DIVIPOL (departamento, municipio) usados por los arbitrarios: solo códigos (D04). */
const PARES_DIVIPOL = [
  ["01", "001"],
  ["16", "001"],
  ["31", "001"],
  ["88", "001"],
  ["00", "000"],
] as const;

const digitos = (n: number): fc.Arbitrary<string> => fc.string({ unit: fc.constantFrom(..."0123456789"), minLength: n, maxLength: n });

/** Fecha `YYYY-MM-DD` válida por construcción con año en `[desde, hasta]`. */
function arbFecha(desde: number, hasta: number): fc.Arbitrary<string> {
  return fc
    .tuple(fc.integer({ min: desde, max: hasta }), fc.integer({ min: 1, max: 12 }))
    .chain(([anio, mes]) =>
      fc
        .integer({ min: 1, max: diasDelMes(anio, mes) })
        .map((dia) => `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`),
    );
}

/** Valida la opción `variantes` de un arbitrario: lista no vacía de variantes conocidas (FX-23). */
function validarVariantes<V extends string>(valor: unknown, permitidas: readonly V[]): readonly V[] {
  if (valor === undefined) return permitidas;
  if (!Array.isArray(valor) || valor.length === 0 || !valor.every((v) => (permitidas as readonly unknown[]).includes(v))) {
    throw new ErrorFixture("variante-invalida", "variantes");
  }
  return valor as V[];
}

/** Campos de la persona que no son nombres. */
function arbCamposNoNombre(nuipCorto: boolean) {
  const sufijoNuip = nuipCorto ? fc.integer({ min: 1, max: 6 }).chain(digitos) : digitos(6);
  return fc.record({
    nuip: sufijoNuip.map((d) => "9999" + d),
    serialDocumento: digitos(5).map((d) => "9999" + d),
    sexo: fc.constantFrom<PersonaFicticia["sexo"]>("M", "F"),
    fechaNacimiento: arbFecha(1930, 2007),
    fechaVencimiento: arbFecha(2030, 2045),
    divipol: fc.constantFrom(...PARES_DIVIPOL),
    expedicion: fc.constantFrom(...PARES_DIVIPOL),
    rh: fc.constantFrom(...GRUPOS_RH),
  });
}

interface Nombres {
  readonly primerApellido: string;
  readonly segundoApellido: string;
  readonly primerNombre: string;
  readonly segundoNombre: string;
}

function componer(nombres: Nombres, c: { nuip: string; serialDocumento: string; sexo: PersonaFicticia["sexo"]; fechaNacimiento: string; fechaVencimiento: string; divipol: readonly [string, string]; expedicion: readonly [string, string]; rh: PersonaFicticia["rh"] }): PersonaFicticia {
  return {
    nuip: c.nuip,
    serialDocumento: c.serialDocumento,
    primerApellido: nombres.primerApellido,
    segundoApellido: nombres.segundoApellido,
    primerNombre: nombres.primerNombre,
    segundoNombre: nombres.segundoNombre,
    sexo: c.sexo,
    fechaNacimiento: c.fechaNacimiento,
    fechaVencimiento: c.fechaVencimiento,
    departamento: c.divipol[0],
    municipio: c.divipol[1],
    lugarExpedicion: c.expedicion[0] + c.expedicion[1],
    rh: c.rh,
  };
}

/**
 * Personas ficticias válidas por construcción (FX-23): nombres de las listas fijas, NUIP `9999` + 6 dígitos
 * (o, con `nuipCorto`, de 5 a 10 dígitos en total), serial `9999` + 5 dígitos, fechas y DIVIPOL válidos.
 */
export function arbPersonaFicticia(o?: { readonly nuipCorto?: boolean }): fc.Arbitrary<PersonaFicticia> {
  const nombres = fc.record({
    primerApellido: fc.constantFrom(...APELLIDOS),
    segundoApellido: fc.constantFrom(...APELLIDOS),
    primerNombre: fc.constantFrom(...PRIMEROS_NOMBRES),
    segundoNombre: fc.constantFrom(...SEGUNDOS_NOMBRES),
  });
  return fc.tuple(nombres, arbCamposNoNombre(o?.nuipCorto === true)).map(([n, c]) => componer(n, c));
}

/** Fixtures PDF417 válidos por construcción, con variante de `variantes` (por omisión todas) y semilla arbitraria. */
export function arbFixturePdf417(o?: {
  readonly variantes?: readonly VariantePdf417[];
  readonly nuipCorto?: boolean;
}): fc.Arbitrary<FixturePdf417> {
  const variantes = validarVariantes(o?.variantes, VARIANTES_PDF417);
  return fc
    .record({
      persona: arbPersonaFicticia({ nuipCorto: o?.nuipCorto === true }),
      variante: fc.constantFrom(...variantes),
      semilla: fc.integer({ min: 0, max: SEMILLA_MAXIMA }),
    })
    .map(({ persona, variante, semilla }) => generarPdf417(persona, { variante, semilla }));
}

/** Ancho de la línea 3 de la MRZ (FX-18). */
const ANCHO_L3 = 30;

/**
 * Nombres que caben en la línea 3 de la MRZ por construcción (design.md, decisión 9): primer nombre y primer apellido
 * libres; después, segundo apellido entre los que caben (siempre cabe `PEÑA`) y segundo nombre entre los que caben
 * (siempre cabe `""`). Las listas se recortan antes de elegir: no hay `filter` de fast-check ni `fc.pre`.
 */
const arbNombresMrz: fc.Arbitrary<Nombres> = fc
  .tuple(fc.constantFrom(...PRIMEROS_NOMBRES), fc.constantFrom(...APELLIDOS))
  .chain(([primerNombre, primerApellido]) => {
    const usado = primerApellido.length + 1 + 2 + primerNombre.length;
    const segundos = APELLIDOS.filter((a) => usado + a.length <= ANCHO_L3);
    return fc.constantFrom(...segundos).chain((segundoApellido) => {
      const total = usado + segundoApellido.length;
      const nombres = SEGUNDOS_NOMBRES.filter((n) => n === "" || total + 1 + n.length <= ANCHO_L3);
      return fc.constantFrom(...nombres).map((segundoNombre) => ({ primerApellido, segundoApellido, primerNombre, segundoNombre }));
    });
  });

/**
 * Fixtures MRZ válidos por construcción (FX-23): NUIP de 10 dígitos, línea 3 de 30 caracteres o menos, variante de
 * `variantes` (por omisión todas), semilla arbitraria y, en `ocr-b`, de 1 a 5 errores.
 */
export function arbFixtureMrz(o?: { readonly variantes?: readonly VarianteMrz[] }): fc.Arbitrary<FixtureMrz> {
  const variantes = validarVariantes(o?.variantes, VARIANTES_MRZ);
  return fc
    .record({
      nombres: arbNombresMrz,
      campos: arbCamposNoNombre(false),
      variante: fc.constantFrom(...variantes),
      semilla: fc.integer({ min: 0, max: SEMILLA_MAXIMA }),
      erroresOcr: fc.integer({ min: 1, max: 5 }),
    })
    .map(({ nombres, campos, variante, semilla, erroresOcr }) =>
      generarMrzTd1(componer(nombres, campos), variante === "ocr-b" ? { variante, semilla, erroresOcr } : { variante, semilla }),
    );
}
