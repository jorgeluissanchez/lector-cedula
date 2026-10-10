# Design

## Context

Motivación: ver `proposal.md` (Why). Requisitos: `specs/fixtures-sinteticos/spec.md` (FX-01 a FX-24). Estado observado (2026-10-06):

- Monorepo con npm workspaces `packages/*` y `apps/*`; solo existe `packages/parsers` (`@lector-cedula/parsers`, publicable, `files: ["dist"]`). TypeScript 5 strict con `module: NodeNext`, `noUncheckedIndexedAccess` y `exactOptionalPropertyTypes` (`tsconfig.base.json`); `tsconfig.json` raíz con `references`.
- `vitest.config.ts` ya incluye `packages/*/test/**/*.test.ts` y mide cobertura de `packages/*/src/**` (umbral global de ramas 85). `vitest.stryker.config.ts` lo extiende. `stryker.config.mjs` muta `packages/parsers/src/**/*.ts` y `evals/runners/metricas.mjs` con `break: 85`.
- `fast-check` 4.10 está en las `devDependencies` de la raíz. `mrz` no está instalado (`npm view mrz`: 5.0.2, MIT; `node tools/licencia-check.mjs --package mrz`: OK). `zxing-wasm` tampoco (3.1.5, MIT; `licencia-check --package zxing-wasm`: OK).
- `tools/privacidad-check.mjs` marca toda línea con `PubDSK_1` en `packages/`, `apps/` o `server/`, salvo que la línea lleve `privacidad-ok:` o el archivo sea de prueba y contenga `fixture-sintetico`. También marca `writeFile` en `packages/*/src/`. Exporta `revisarArchivo(ruta, contenido)`.
- El ejemplo MRZ de Eitol (`ICCOL000000012305001...`) tiene el dígito del documento inválido (calcula 5, impreso 3) y `C0L` con cero: no sirve como fixture positiva (igual que `back-ccd.png`, M04).
- Los cambios paralelos `parser-pdf417-amarilla` y `parser-mrz-cedula-digital` consumen este paquete desde sus pruebas; otro redactor añadió la sección DIVIPOL (D01 a D05) al registro de hipótesis.
- `docs/decisiones/2026-10-06-evidencia-hipotesis-formato.md` (layout observado en un payload público de 531 bytes y en código de terceros) refuta en parte G01: `[32,40)` son 8 NUL y `[40,48)` es un campo numérico de 8 bytes; no existe un campo de 6 dígitos en `[33,39)`. También indica que el desplazamiento sin `PubDSK` (H07) probablemente es +1, no −1 (evidencia [E]). Confirma H01, H03, H04 (cuatro campos de 23 bytes), H05, H06 y H09. Ver "Ajuste por evidencia" al final.

## Goals / Non-Goals

**Goals:**
- Una sola fuente de verdad sintética para los dos parsers, con una interfaz pequeña, tipada y versionada.
- Que cada suposición del formato quede nombrada por un ID y visible en cada fixture.
- Determinismo total (bytes idénticos por semilla) para que los contraejemplos de `fast-check` y los fallos de CI se reproduzcan.
- Oráculos independientes del generador en sus propias pruebas.

**Non-Goals:**
- Parsear. El generador no decodifica nada; los parsers no se importan desde aquí (evita dependencias circulares y oráculos que se copian).
- Realismo biométrico: la cola es ruido uniforme a propósito (principio III).
- Imágenes PDF417 y distorsiones (tarea posterior, decisión 13).
- Escribir archivos en `evals/fixtures/` (lo hacen los cambios de los parsers con `casosPdf417()`/`casosMrz()`).
- Tarjeta de identidad (H10, N01), tildes en nombres, truncamiento ICAO de nombres largos, segundo apellido ausente.

## Decisions

1. **Ubicación: `packages/fixtures` (`@lector-cedula/fixtures`, `"private": true`).** Hereda TypeScript strict, `tsc -b`, la inclusión de pruebas y la cobertura de Vitest y la mutación de Stryker sin infraestructura nueva, y da tipos a los consumidores.
   - Alternativa descartada: `evals/generadores/*.mjs`. Sin tipos ni `typecheck`, y `evals/` es del corredor de métricas; la mutación habría que configurarla aparte.
   - Alternativa descartada: helpers dentro de `packages/parsers/test/`. Mezcla el oráculo con el código bajo prueba y no lo puede reutilizar otro paquete.
   - "No se publica en producción" se garantiza con `private: true` (npm se niega a publicarlo) y con la prueba de FX-01 que recorre los `package.json` de `packages/*` y `apps/*`.
   - `package.json`: `"type": "module"`, `"sideEffects": false`, `"exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } }`, `"peerDependencies": { "fast-check": "^4.10.2" }` (ya instalado en la raíz), sin `dependencies`.

2. **Interfaz pública (contrato con los consumidores, `VERSION_CONTRATO = "1.0.0"`).** Exportada desde `src/index.ts`, documentada con TSDoc:

   ```ts
   export const VERSION_CONTRATO: "1.0.0";
   export type Sexo = "M" | "F";
   export type Rh = "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-";
   export interface PersonaFicticia {
     readonly nuip: string; readonly serialDocumento: string;
     readonly primerApellido: string; readonly segundoApellido: string;
     readonly primerNombre: string; readonly segundoNombre: string; // "" = ausente
     readonly sexo: Sexo; readonly fechaNacimiento: string; readonly fechaVencimiento: string; // YYYY-MM-DD
     readonly departamento: string; readonly municipio: string; readonly lugarExpedicion: string;
     readonly rh: Rh;
   }
   export const PERSONA_BASE: PersonaFicticia; // congelada
   export type IdHipotesis = "H01" | "H02" | "H03" | "H04" | "H05" | "H06" | "H07" | "H08" | "H09" | "H11"
     | "M01" | "M02" | "M03" | "G01" | "G02" | "G03" | "G04" | "G05";
   export type CodigoErrorFixture = "persona-invalida" | "nuip-fuera-de-rango-sintetico"
     | "serial-fuera-de-rango-sintetico" | "nombre-invalido" | "nombre-demasiado-largo" | "sexo-invalido"
     | "fecha-invalida" | "divipol-invalido" | "rh-invalido" | "variante-invalida" | "semilla-invalida"
     | "opcion-ocr-invalida" | "nuip-no-soportado-en-mrz" | "nombre-excede-mrz";
   export class ErrorFixture extends Error {
     readonly name: "ErrorFixture"; readonly codigo: CodigoErrorFixture; readonly campo: string | null;
   }
   export type Rango = readonly [inicio: number, fin: number]; // semiabierto
   export type VariantePdf417 = "completa" | "windows-truncada" | "sin-pubdsk" | "fecha-primero";
   export interface OpcionesPdf417 { readonly variante?: VariantePdf417; readonly semilla?: number }
   export interface CamposPdf417 {
     readonly nuip: string; readonly primerApellido: string; readonly segundoApellido: string;
     readonly primerNombre: string; readonly segundoNombre: string; readonly sexo: Sexo;
     readonly fechaNacimiento: string; readonly departamento: string; readonly municipio: string; readonly rh: Rh;
   }
   export interface RangosPdf417 {
     readonly afis: Rango; readonly marcador: Rango | null; readonly nuip: Rango;
     readonly primerApellido: Rango; readonly segundoApellido: Rango; readonly primerNombre: Rango;
     readonly segundoNombre: Rango; readonly bloqueDemografico: Rango; readonly rh: Rango; readonly cola: Rango;
   }
   export interface FixturePdf417 {
     readonly sintetico: true; readonly variante: VariantePdf417; readonly semilla: number;
     readonly bytes: Uint8Array; readonly hipotesis: readonly IdHipotesis[];
     readonly persona: PersonaFicticia; readonly esperado: CamposPdf417; readonly rangos: RangosPdf417;
   }
   export function generarPdf417(persona: PersonaFicticia, opciones?: OpcionesPdf417): FixturePdf417;

   export type VarianteMrz = "valida" | "cd-documento-alterado" | "cd-nacimiento-alterado"
     | "cd-vencimiento-alterado" | "cd-compuesto-alterado" | "cd-documento-relleno" | "ocr-b";
   export interface PosicionOcr { readonly linea: 1 | 2; readonly posicion: number; readonly caracter?: string }
   export interface OpcionesMrz {
     readonly variante?: VarianteMrz; readonly semilla?: number;
     readonly erroresOcr?: number; readonly posicionesOcr?: readonly PosicionOcr[];
   }
   export interface InyeccionOcr { readonly linea: 1 | 2; readonly posicion: number; readonly original: string; readonly inyectado: string }
   export type EstadoDigitoControl = "valido" | "invalido" | "relleno";
   export interface CamposMrz {
     readonly serialDocumento: string; readonly lugarExpedicion: string; readonly fechaNacimiento: string;
     readonly sexo: Sexo; readonly fechaVencimiento: string; readonly nacionalidad: "COL"; readonly nuip: string;
     readonly primerApellido: string; readonly segundoApellido: string; readonly primerNombre: string;
     readonly segundoNombre: string; // transliterados (G05)
     readonly digitosControl: { readonly documento: EstadoDigitoControl; readonly nacimiento: EstadoDigitoControl;
       readonly vencimiento: EstadoDigitoControl; readonly compuesto: EstadoDigitoControl };
   }
   export interface FixtureMrz {
     readonly sintetico: true; readonly variante: VarianteMrz; readonly semilla: number;
     readonly lineas: readonly [string, string, string]; readonly texto: string;
     readonly lineasSinErrores: readonly [string, string, string]; readonly inyecciones: readonly InyeccionOcr[];
     readonly hipotesis: readonly IdHipotesis[]; readonly persona: PersonaFicticia; readonly esperado: CamposMrz;
   }
   export function generarMrzTd1(persona: PersonaFicticia, opciones?: OpcionesMrz): FixtureMrz;

   export interface Caso<F> { readonly id: string; readonly descripcion: string; readonly fixture: F }
   export function casosPdf417(): readonly Caso<FixturePdf417>[];
   export function casosMrz(): readonly Caso<FixtureMrz>[];
   export function arbPersonaFicticia(o?: { readonly nuipCorto?: boolean }): fc.Arbitrary<PersonaFicticia>;
   export function arbFixturePdf417(o?: { readonly variantes?: readonly VariantePdf417[]; readonly nuipCorto?: boolean }): fc.Arbitrary<FixturePdf417>;
   export function arbFixtureMrz(o?: { readonly variantes?: readonly VarianteMrz[] }): fc.Arbitrary<FixtureMrz>;
   ```

   - Los parámetros son `unknown` en tiempo de ejecución (se validan, FX-03); el tipo estático ayuda al consumidor.
   - Todo objeto devuelto se congela en profundidad (`Object.freeze` recursivo) salvo `bytes`, que es un `Uint8Array` nuevo en cada llamada (no se puede congelar un TypedArray no vacío).
   - `esperado` usa el vocabulario de este paquete. Cada parser traduce a su forma de salida en sus pruebas (o adopta estos nombres, pregunta abierta 1). Así el generador no depende del esquema `salida-json`, aún sin spec.
   - Alternativa descartada: exportar `digitoControlIcao`. Invitaría a que las pruebas de los parsers usen el mismo cálculo como oráculo (antipatrón de la skill `estrategia-pruebas`).

3. **Validación de la persona** (FX-03, FX-04). Un único `validarPersona(valor: unknown)` interno, común a ambos generadores, recorre los campos en el orden de FX-03 y lanza el primer `ErrorFixture`. Fechas: `^[0-9]{4}-[0-9]{2}-[0-9]{2}$` y comprobación aritmética de mes y día (bisiestos gregorianos) sin `Date` (FX-01 prohíbe `new Date(`). Después se validan las opciones (`variante` en la lista, `semilla` con `Number.isInteger` y rango, opciones OCR) y por último las restricciones de la MRZ.

4. **Construcción del PDF417: una trama completa y transformaciones** (FX-07 a FX-13, G01 a G04). `construirCompleta(persona, prng, bloque)` escribe la disposición de G01; las variantes se derivan:
   - `windows-truncada` = completa sin `[13,24)`; `sin-pubdsk` = completa con `[24,32)` a NUL, un NUL insertado en la posición 32 y sin el último byte de la cola (531 bytes, H01); `fecha-primero` = completa con el bloque fecha-primero.
   - Los `rangos` se calculan desplazando los de la completa (−11 desde el byte 24 o +1 desde el byte 32), no a mano.
   - Por qué: los escenarios de FX-10 y FX-11 son relaciones exactas con la completa; derivarlas garantiza por construcción que "misma persona, trama completa y truncada" difieren solo donde la hipótesis dice.
   - Codificación ISO-8859-1 propia (cada carácter de `[A-ZÑ 0-9]` es un byte; la Ñ es 0xD1), sin `TextEncoder` (solo UTF-8).
   - Tabla de hipótesis por variante: constante en `src/hipotesis.ts`, idéntica a la de FX-14.

5. **PRNG mulberry32 y orden de consumo** (FX-06). Implementación de referencia (dominio público), estado de 32 bits:

   ```ts
   function mulberry32(semilla: number): () => number {
     let a = semilla >>> 0;
     return () => {
       a = (a + 0x6d2b79f5) | 0;
       let t = Math.imul(a ^ (a >>> 15), 1 | a);
       t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
       return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
     };
   }
   ```

   - Dígito = `Math.floor(r() * 10)`; byte = `Math.floor(r() * 256)`.
   - Orden en el PDF417 (un PRNG nuevo por llamada): 2 dígitos de cabecera, 4 dígitos del AFIS (tras el prefijo `9999`), 8 dígitos del campo numérico `[40,48)`, 1 dígito desconocido del bloque, y los bytes de la cola en orden. La cola depende así solo de la semilla y de su longitud (FX-13).
   - MRZ: solo la variante `ocr-b` consume el PRNG (decisión 7).
   - Los valores literales de FX-06 (semillas 1 y 2) y de FX-20 (semilla 1) se calcularon con esta implementación fuera del repositorio al redactar la spec; son el oráculo literal del PRNG.
   - Alternativa descartada: el generador de `fast-check` como PRNG. Ataría los bytes a la versión de `fast-check` y obligaría a pasar un `Random` desde fuera.
   - Alternativa descartada: huella SHA-256 del catálogo registrada tras implementar. Sería ajustar la prueba al código; los literales de la spec la sustituyen.

6. **MRZ TD1** (FX-16 a FX-19, M01 a M03, G05). Fechas `YYYY-MM-DD` -> `YYMMDD` por recorte. Dígito de control según FX-17. `digitosControl` del `esperado` se fija por variante, no se recalcula comprobando el resultado (evita que un error de cálculo se autoconfirme). Alteración: `(d + 1) % 10`; en las tres primeras variantes se recalcula el compuesto sobre las líneas ya alteradas. Relleno: `<` en `L1[14]` antes de calcular el compuesto.

7. **Inyección OCR-B** (FX-20, FX-21). Posiciones elegibles = dígitos de la tabla de confusiones en las zonas numéricas de `lineasSinErrores`, en orden: `L1[5..19]`, `L2[0..6]`, `L2[8..14]`, `L2[18..27]`, `L2[29]`. Para cada uno de los `erroresOcr` errores: `i = Math.floor(r() * restantes.length)`, se toma y se quita `restantes[i]`; si el dígito es `0`, otra extracción elige `O` (`r() < 0.5`) o `Q`. Si hay menos elegibles que `erroresOcr`, se inyectan todos (no se lanza). Con `posicionesOcr` no se usa el PRNG. Tabla de confusiones: `0: ["O","Q"], 1: ["I"], 2: ["Z"], 5: ["S"], 6: ["G"], 8: ["B"]` (inversa de las correcciones de la skill `formato-cedula`).

8. **Hipótesis nuevas con prefijo `G`** (FX-14). Las concreciones que el generador necesita (offsets exactos, alcance del truncado, dirección del desplazamiento, orden fecha-primero, línea 3) se registran como `G01` a `G05` en una sección propia de `docs/decisiones/hipotesis-formato.md` (ya escrita en este cambio). Prefijo propio para no chocar con IDs `H12`, `M05` o `D0x` que añadan los redactores paralelos. Los parsers que dependan de la misma concreción emiten el ID `G` correspondiente en `warnings[]`.

9. **Arbitrarios válidos por construcción** (FX-23, FX-24). Sin `filter` ni `fc.pre`:
   - Persona: `fc.record` sobre las listas fijas de FX-23; fechas de nacimiento de 1930-01-01 a 2007-12-31 y de vencimiento de 2030-01-01 a 2045-12-31 construidas como año, mes y día válidos; pares DIVIPOL `(01,001)`, `(16,001)`, `(31,001)`, `(88,001)`, `(00,000)` (solo códigos, sin nombres; ver D04); `lugarExpedicion` de los mismos pares concatenados; NUIP `9999` + 6 dígitos o, con `nuipCorto`, `9999` + 1 a 6 dígitos con longitud uniforme; serial `9999` + 5 dígitos; semilla `fc.integer({ min: 0, max: 0xffffffff })`.
   - MRZ: `fc.chain` con presupuesto de 30 caracteres: primer nombre, primer apellido, luego segundo apellido entre los que caben (siempre cabe al menos `PEÑA`) y segundo nombre entre los que caben (siempre cabe `""`).
   - Las proporciones de FX-24 tienen al menos 4 desviaciones típicas de margen con 1000 casos (por ejemplo, cada variante PDF417 sale en torno al 25 % frente al 15 % exigido; Ñ en algún nombre, en torno al 51 % frente al 25 %). Contadores locales y `expect` tras `fc.assert`; semilla de `fast-check` aleatoria (convención del cambio `pruebas-nuip-y-evals-robustas`, decisión 2).

10. **Configuración compartida** (cambios paralelos). Este cambio añade, sin tocar lo existente:
    - `vitest.config.ts`: `resolve.alias` `"@lector-cedula/fixtures"` -> `packages/fixtures/src/index.ts` (las pruebas importan la fuente sin compilar; `vitest.stryker.config.ts` lo hereda).
    - `tsconfig.json`: `{ "path": "packages/fixtures" }` en `references`.
    - `stryker.config.mjs`: `"packages/fixtures/src/**/*.ts"` y `"!packages/fixtures/src/index.ts"` en `mutate`.
    - `npm install` (sin paquetes nuevos) para registrar el workspace en `package-lock.json`.
    - Los parsers paralelos tocarán las mismas líneas; el orquestador integra este cambio primero (los otros dos lo consumen) y resuelve el resto por rebase. Cada línea añadida es independiente.

11. **Oráculos independientes en las pruebas del generador** (FX-05, FX-15, FX-17, FX-19). Nunca se importa el cálculo de dígitos ni el codificador del generador en una aserción:
    - Literales de la spec (calculados fuera del repositorio al redactar) y el espécimen público de ICAO 9303 parte 5.
    - Diferencial con `mrz` 5.0.2 (`parse(lineas).details`, campos `documentNumberCheckDigit`, `birthDateCheckDigit`, `expirationDateCheckDigit`, `compositeCheckDigit`); se instala como `devDependency` de la raíz en una tarea propia. Si no se aprueba la dependencia, el oráculo de reserva es una función de prueba escrita desde el texto de ICAO 9303 con una tabla de valores literal, validada primero contra el espécimen (pregunta abierta 3).
    - Regla H03 como expresión regular sobre el texto ISO-8859-1 (`/([0-9]{10})[A-ZÑ]/`) para FX-05.
    - Decodificación ISO-8859-1 en la prueba con `TextDecoder("latin1")` (no comparte código con el codificador propio).

12. **Privacidad** (FX-01). El marcador se escribe una sola vez: `const MARCADOR = "PubDSK_1"; // privacidad-ok: marcador estructural del generador sintético, no es un payload`. Las pruebas que contienen `PubDSK_1` llevan `// fixture-sintetico` en la primera línea. Ningún `writeFile` en `src/`. No se relaja `privacidad-check`.

13. **Imágenes PDF417: tarea posterior en otro cambio** (`imagenes-pdf417-sinteticas`). `zxing-wasm` 3.1.5 (MIT, `licencia-check` OK, sin instalar) tiene `writeBarcode`; queda por comprobar que acepta `Uint8Array` para codificar los 531 bytes en modo binario con nivel de corrección 5, y elegir dónde corren las distorsiones (rotación, blur, glare, perspectiva) sin dependencias AGPL (la skill `estrategia-pruebas` descarta AlbumentationsX). Ese cambio consumirá `FixturePdf417.bytes` sin modificar esta interfaz y guardará las imágenes solo en carpetas `sinteticos/`.

## Risks / Trade-offs

- [Los parsers y el generador comparten las mismas hipótesis: una hipótesis falsa pasa todas las pruebas sintéticas] → Cada fixture declara sus IDs; los parsers los emiten en `warnings[]`; la verificación de salida de la Fase 1 corre los parsers contra los payloads públicos y el set de campo.
- [Literales del PRNG en la spec atan la implementación a mulberry32 y a un orden de consumo] → Es intencional: es el contrato de determinismo. Cambiarlo exige subir el MAJOR de `VERSION_CONTRATO` en un cambio OpenSpec.
- [Conflictos en `vitest.config.ts`, `tsconfig.json`, `stryker.config.mjs` y `hipotesis-formato.md` con los cambios paralelos] → Líneas independientes, integración de este cambio primero, sección `G` propia en el registro.
- [Umbrales estadísticos con semilla aleatoria pueden fallar de forma intermitente] → Margen de al menos 4 desviaciones típicas (probabilidad de fallo por umbral menor que 1 entre 30 000).
- [`mrz` 5.0.2 podría rechazar algo propio de la MRZ colombiana (por ejemplo, el código `IC`)] → El diferencial mira solo los cuatro campos de dígito de control; si la biblioteca no los reporta, se usa el oráculo de reserva de la decisión 11.
- [La excepción `privacidad-ok:` podría copiarse a otras líneas] → FX-01 exige exactamente una línea con `PubDSK_1` en `src/`.
- [Mutación más lenta al añadir otro paquete a `mutate`] → Para este cambio se mide con `--mutate` limitado al paquete.

## Migration Plan

Sin migración: paquete nuevo. Retirada: borrar `packages/fixtures/`, sus líneas en `vitest.config.ts`, `tsconfig.json` y `stryker.config.mjs`, y la `devDependency` `mrz` si nadie más la usa.

## Open Questions

1. ¿Los parsers adoptan los nombres de campo de `CamposPdf417`/`CamposMrz` en su salida, o traducen en sus pruebas? No cambia este contrato; lo decide `salida-json`.
2. ¿Qué hace un parser MRZ con `DE<LA<OSSA<EJEMPLO`, que no distingue apellido compuesto de dos apellidos (G05)? El generador da la verdad en `esperado`; la política es de `parser-mrz-cedula-digital`.
3. Aprobación de `mrz` 5.0.2 como `devDependency` de prueba (MIT). Sin ella, se usa el oráculo de reserva de la decisión 11.

## Pruebas

Según el principio II y la matriz de `.claude/skills/estrategia-pruebas/SKILL.md`. El generador no es un parser, pero alimenta sus oráculos: se le aplica la fila "Parsers" (unitaria con literales, propiedad, entradas arbitrarias, mutación, errores pasados); la fila "Evals de campo" no aplica (no registra evaluadores) y `npm run eval:quick` debe seguir sin regresión.

Comandos: `V` = `npx vitest run packages/fixtures`; `C` = `npx vitest run packages/fixtures --coverage --coverage.include="packages/fixtures/src/**"`; `M` = `npm run test:mutacion -- --mutate "packages/fixtures/src/**/*.ts,!packages/fixtures/src/index.ts"`; `T` = `npm run typecheck`; `L` = `npx eslint packages/fixtures`; `K` = `npm run check`. Toda propiedad usa `numRuns >= 1000`; toda propiedad con ramas mide su proporción de casos útiles con contadores.

| Requisito | Tipo de prueba | Herramienta | Comando | Umbral |
|---|---|---|---|---|
| FX-01 | Unitaria (lectura de `package.json`, `revisarArchivo` sobre cada archivo, búsqueda de E/S en `src/`) | Vitest | `V`; `npm run check:privacidad` | 4 escenarios en verde; 0 hallazgos |
| FX-02 | Contrato (claves exportadas, versión, inmutabilidad) | Vitest | `V`; `T` | Lista exacta; `TypeError` en ambas asignaciones |
| FX-03 | Unitaria con literales; propiedad de entradas arbitrarias (`fc.anything()`) | Vitest, fast-check | `V` | Escenarios literales; 0 excepciones que no sean `ErrorFixture` en >= 2000 casos |
| FX-04 | Unitaria con tabla literal (13 campos) y valores límite | Vitest | `V` | 13 + 2 + 4 casos en verde |
| FX-05 | Unitaria; propiedad con oráculo H03 (regex) | Vitest, fast-check | `V` | 0 números fuera de rango; >= 20 % salidas y >= 20 % rechazos |
| FX-06 | Unitaria con literales del PRNG; propiedad de determinismo; reproducibilidad de arbitrarios | Vitest, fast-check | `V` | Bytes literales exactos; igualdad profunda en >= 1000 casos |
| FX-07 | Unitaria con bytes y rangos literales | Vitest | `V` | `toStrictEqual` sobre `rangos` |
| FX-08 | Unitaria con bytes literales (Ñ 0xD1, compuesto, ausente) | Vitest | `V` | Bytes exactos |
| FX-09 | Unitaria (casos de errores pasados: `AB-`, `O-`, sexo F con M) | Vitest | `V` | Bytes exactos |
| FX-10 | Unitaria de relación con la completa; propiedad de la relación sobre `arbPersonaFicticia` | Vitest, fast-check | `V` | Igualdad byte a byte en >= 1000 casos |
| FX-11 | Unitaria de relación; propiedad de la relación | Vitest, fast-check | `V` | Igualdad byte a byte en >= 1000 casos |
| FX-12 | Unitaria con bloque literal; propiedad `esperado` igual a la completa | Vitest, fast-check | `V` | >= 1000 casos |
| FX-13 | Unitaria (longitud, independencia de la persona, semillas distintas) | Vitest | `V` | Escenarios en verde |
| FX-14 | Unitaria con listas literales; contrato con `docs/decisiones/hipotesis-formato.md` | Vitest | `V` | Todos los IDs presentes |
| FX-15 | Propiedad de estructura sobre todas las variantes | Vitest, fast-check | `V` | 0 violaciones en >= 1000 casos |
| FX-16 | Unitaria con líneas y `esperado` literales | Vitest | `V` | `toStrictEqual` |
| FX-17 | Unitaria con espécimen ICAO y literales; diferencial con `mrz` 5.0.2 | Vitest, fast-check, `mrz` | `V` | 4 dígitos válidos en >= 1000 casos |
| FX-18 | Unitaria con líneas literales | Vitest | `V` | Líneas exactas |
| FX-19 | Unitaria con líneas literales; propiedad "exactamente uno inválido" con el diferencial | Vitest, fast-check, `mrz` | `V` | >= 1000 casos |
| FX-20 | Unitaria con inyecciones literales; propiedad de reversibilidad | Vitest, fast-check | `V` | >= 1000 casos |
| FX-21 | Unitaria de opciones inválidas | Vitest | `V` | 10 casos en verde |
| FX-22 | Unitaria del catálogo; contrato catálogo = generador | Vitest | `V` | IDs y equivalencia exactos |
| FX-23 | Propiedad (siempre aceptadas, nombres de las listas, MRZ generable) | Vitest, fast-check | `V` | 0 fallos en >= 1000 casos |
| FX-24 | Propiedad con contadores (antivacuidad) | Vitest, fast-check | `V` | Umbrales del requisito |
| Todos | Mutación | Stryker | `M` | Mutation score >= 85 % global y por archivo |
| Todos | Cobertura | Vitest + v8 | `C` | Ramas >= 95 % en `packages/fixtures/src` |
| Todos | Tipos, lint, puerta completa | tsc, ESLint, `npm run check` | `T`; `L`; `K` | 0 errores; `eval:quick` sin regresión |
| Todos | Calidad de las pruebas | agente `pr-test-analyzer` | (revisión) | 0 hallazgos críticos abiertos |

## Decisiones del orquestador (2026-10-06, pendientes de ratificación humana)

- Pregunta 1: se aprueba `mrz@5.0.2` (MIT) como devDependency de prueba; lo instala la primera tarea que lo necesite (este cambio o el parser MRZ), no ambas.
- Preguntas 2 a 5: se aceptan las suposiciones como hipótesis G01-G05 explícitas; cada variante las declara y el investigador de hipótesis las contrastará.
- Pregunta 6: el alcance excluido queda para cambios posteriores.
- Pregunta 7: los parsers traducen `esperado` en sus pruebas hasta que exista la spec `salida-json`.

## Ajuste por evidencia (2026-10-06, pedido por el orquestador antes de publicar la interfaz)

Fuente: `docs/decisiones/2026-10-06-evidencia-hipotesis-formato.md`. Como la interfaz aún no se había publicado ni consumido, se ajusta sin subir el MAJOR (`VERSION_CONTRATO` sigue en `"1.0.0"`); los tipos exportados no cambian.

- **G01 corregida.** Trama completa: `[0,2)` 2 dígitos, `[2,10)` AFIS (`9999` + 4), `[10,24)` 14 NUL, `[24,32)` `PubDSK_1`, `[32,40)` 8 NUL, `[40,48)` campo numérico de 8 dígitos del PRNG, `[48,58)` NUIP, nombres de 23 bytes desde 58, bloque desde 150. El payload público trae en `[40,48)` 6 dígitos + 2 NUL y los volcados, 8 dígitos en 2 de 3: el generador usa 8 dígitos (un único caso; la variante de 6 + 2 NUL queda para un cambio posterior si un parser la necesita).
- **Orden de consumo del PRNG.** Desaparecen los 6 dígitos: 2 + 4 + 8 + 1 dígitos y después la cola. Los literales de FX-06 (semillas 1 y 2) se recalcularon fuera del repositorio con la implementación de referencia de la decisión 5 (script en el scratchpad de la sesión, no con el código del paquete); son coherentes con los antiguos: los 15 primeros dígitos de cada secuencia coinciden y cada byte nuevo cae en el intervalo `[d·25.6, (d+1)·25.6)` del dígito antiguo en esa posición.
- **G03 con dirección en duda: se adopta +1.** La única fuente con dirección (la app comercial decompilada S5) apunta a +1 bajo la lectura coherente con el payload público ([E]). `sin-pubdsk` = completa con el marcador a NUL y un NUL insertado en 32: todo campo desde el byte 32 se desplaza +1 y la trama conserva 531 bytes (H01) recortando el último byte de la cola. G03 sigue pendiente; si se confirma −1, se cambia esta transformación y sus literales en un cambio OpenSpec.
- Sin cambios: el dígito desconocido del bloque sigue saliendo del PRNG (la evidencia lo ve `0` en 4 de 4, pero su significado es desconocido) y la cola sigue siendo ruido uniforme (principio III; no imita las plantillas de H13).
