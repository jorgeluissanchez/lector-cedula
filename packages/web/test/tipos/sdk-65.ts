// SDK-65 "Tipos precisos para el integrador" y "Sin campos inventados" (sdk-integracion): tipos públicos de
// `CamposDocumento` en `@lector-cedula/web`. Verificación: `npx tsc -p packages/web/test/tipos --noEmit` (lo corre
// tools/test/mot-15-tipos.test.mjs). Datos SINTÉTICOS (NUIP 9999...).
import type { CamposDocumento, FechaIso, LugarNacimiento, ResultadoPresentacion, Rh, SexoDocumento } from "@lector-cedula/web";
import { expectTypeOf } from "vitest";

expectTypeOf<SexoDocumento>().toEqualTypeOf<"M" | "F" | "X">();
expectTypeOf<Rh>().toEqualTypeOf<"A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-">();
expectTypeOf<FechaIso>().toEqualTypeOf<string>();
expectTypeOf<LugarNacimiento>().toEqualTypeOf<{ readonly codigo: string; readonly departamento: string; readonly municipio: string }>();
expectTypeOf<keyof LugarNacimiento>().toEqualTypeOf<"codigo" | "departamento" | "municipio">();

expectTypeOf<CamposDocumento["numeroDocumento"]>().toEqualTypeOf<string | null>();
expectTypeOf<CamposDocumento["apellidos"]>().toEqualTypeOf<string>();
expectTypeOf<CamposDocumento["nombres"]>().toEqualTypeOf<string>();
expectTypeOf<CamposDocumento["fechaNacimiento"]>().toEqualTypeOf<string | null>();
expectTypeOf<CamposDocumento["fechaVencimiento"]>().toEqualTypeOf<string | null>();
expectTypeOf<CamposDocumento["sexo"]>().toEqualTypeOf<"M" | "F" | "X" | null>();
expectTypeOf<CamposDocumento["nacionalidad"]>().toEqualTypeOf<string | null>();
expectTypeOf<CamposDocumento["paisEmisor"]>().toEqualTypeOf<string>();
expectTypeOf<CamposDocumento["nuip"]>().toEqualTypeOf<string | null | undefined>();
expectTypeOf<CamposDocumento["rh"]>().toEqualTypeOf<Rh | undefined>();
expectTypeOf<CamposDocumento["lugarNacimiento"]>().toEqualTypeOf<LugarNacimiento | null | undefined>();
expectTypeOf<keyof CamposDocumento>().toEqualTypeOf<
  "numeroDocumento" | "apellidos" | "nombres" | "fechaNacimiento" | "sexo" | "nacionalidad" | "paisEmisor" | "fechaVencimiento" | "nuip" | "rh" | "lugarNacimiento"
>();
expectTypeOf<ResultadoPresentacion["campos"]>().toEqualTypeOf<CamposDocumento>();

const amarilla: CamposDocumento = {
  numeroDocumento: "9999123456",
  apellidos: "PRUEBA EJEMPLO",
  nombres: "FICTICIA LUZ",
  fechaNacimiento: "1985-03-14",
  sexo: "F",
  nacionalidad: "COL",
  paisEmisor: "COL",
  fechaVencimiento: null,
  nuip: "9999123456",
  rh: "AB-",
  lugarNacimiento: { codigo: "16001", departamento: "BOGOTA D.C", municipio: "BOGOTA, D.C." },
};

// @ts-expect-error SDK-65: el sexo es "M", "F" o "X".
const sexoInvalido: CamposDocumento = { ...amarilla, sexo: "masculino" };
// @ts-expect-error SDK-65: "C+" no es un RH.
const rhInvalido: CamposDocumento = { ...amarilla, rh: "C+" };
// @ts-expect-error SDK-65: el lugar es { codigo, departamento, municipio }.
const lugarInvalido: CamposDocumento = { ...amarilla, lugarNacimiento: { x: 1 } };

// SDK-65 "Sin campos inventados": ningún parser produce estos campos.
// @ts-expect-error lugarExpedicion no existe.
void amarilla.lugarExpedicion;
// @ts-expect-error fechaExpedicion no existe.
void amarilla.fechaExpedicion;
// @ts-expect-error LugarNacimiento no tiene pais.
void amarilla.lugarNacimiento?.pais;

// Estrechamiento útil para el integrador: con el sexo se puede hacer un switch exhaustivo.
function etiqueta(s: SexoDocumento): string {
  switch (s) {
    case "M":
      return "masculino";
    case "F":
      return "femenino";
    case "X":
      return "no especificado";
  }
}

export { amarilla, etiqueta, lugarInvalido, rhInvalido, sexoInvalido };
