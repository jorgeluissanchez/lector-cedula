# Design

## Context

Motivación: ver `proposal.md`. Requisitos: `specs/mrz-cedula-digital/spec.md` (MZ-01 a MZ-23; MZ-23, apellidos obligatorios, se añadió el 2026-10-07 por un hallazgo del verificador).

Estado actual, observado el 2026-10-06:

- `packages/parsers/src/` solo tiene `nuip-formato.ts` (`validarFormatoNuip`, capacidad `formato-nuip`, NF-01 a NF-14). Este cambio la reutiliza sin modificarla.
- `evals/runners/eval-campo.mjs` ya llama `fn(entrada, opciones)` cuando el fixture trae `opciones` y admite `adaptar` en `registro.mjs`. `metricas.mjs` compara `JSON.stringify` de cada clave de `esperado`, así que conviene un resultado plano para que el CER sea significativo.
- `stryker.config.mjs` ya muta `packages/parsers/src/**/*.ts` (salvo `index.ts`) con `break: 85`. `vitest.config.ts` exige cobertura global de ramas >= 85 %; la matriz de la skill `estrategia-pruebas` pide >= 95 % de ramas en parsers.
- Librería `mrz` 5.0.2 (cheminfo, MIT, sin dependencias de producción, 202 KB desempaquetada): se inspeccionó su fuente desde el tarball en un directorio temporal, sin instalarla. `node tools/licencia-check.mjs --package mrz` -> `licencia-check: OK`.
- Cambio paralelo `generador-fixtures-sinteticos` (en redacción): paquete privado `@lector-cedula/fixtures` con `generarMrzTd1`, `arbFixtureMrz`, `arbPersonaFicticia`, `PERSONA_BASE` y `VERSION_CONTRATO` `"1.0.0"` (FX-02, FX-15 a FX-20). Declara también `mrz@5.0.2` como `devDependency`.
- Hipótesis vigentes: M01 a M04 y N01 en `docs/decisiones/hipotesis-formato.md`, todas pendientes.

Los literales de los escenarios de la spec se comprobaron con una implementación de referencia desechable fuera del repositorio (scratchpad de la sesión), y los cuatro dígitos de control de las variantes base se contrastaron con `parse` de `mrz` 5.0.2.

## Goals / Non-Goals

**Goals:**

- Una función pura, total y sin dependencias de producción, publicable dentro de `@lector-cedula/parsers`.
- Cada escenario de la spec traducible 1:1 a una prueba de Vitest; las propiedades usan el generador del cambio paralelo y un oráculo independiente (`mrz`).
- Toda decisión no confirmada del formato colombiano visible en `warnings` (principio VI).

**Non-Goals:**

- Localizar la MRZ en una imagen, hacer OCR o realinear líneas con caracteres insertados o perdidos (una línea que no mide 30 se rechaza).
- Buscar combinaciones de correcciones hasta que un dígito de control cuadre (ver decisión 5).
- Traducir el código de lugar de expedición a nombre (cambio `divipol-registraduria`) o juzgar vigencia o edad (validadores de la Fase 1).
- TD1 de la cédula de extranjería, TD3 de pasaporte, tarjeta de identidad digital, chip NFC y QR.

## Decisions

### 1. Cálculo ICAO propio; `mrz` solo como oráculo de pruebas

Se implementa el dígito de control ICAO 9303 y el mapeo TD1 en el paquete, y `mrz@5.0.2` entra solo como `devDependency` para el oráculo diferencial de MZ-09. Hallazgos en la fuente de `mrz` 5.0.2 que impiden envolverla:

1. `parse` lanza con entradas no reconocidas (`checkLines` y el `switch` de longitudes de `parse.ts`): MZ-02 obligaría a validar todo antes, duplicando la mitad del trabajo.
2. `autocorrect` (`autoCorrection.ts`) no tiene `Q -> 0`, y además corrige número a letra en los campos `ALPHABETIC` (nombres, nacionalidad): `FICTICI0` se volvería `FICTICIO` en silencio, contra la regla 7 de la skill `formato-cedula`. Los opcionales son `ALPHANUMERIC`, así que no corrige el NUIP ni el código de expedición.
3. Con `<` en la columna 14 de la línea 1 aplica la semántica ICAO de número de documento largo (`parseDocumentNumber.ts`): toma el opcional como continuación del número y el dígito de control del último carácter antes del relleno. Con `16001<<<...` leería el serial `9999001231600` y el dígito `1`, incompatible con M01 y M03.
4. Las fechas salen como `AAMMDD` sin siglo; el sexo sale como `male`/`female`; la expresión de `checkLines` no está anclada (acepta líneas con caracteres inválidos si contienen uno válido).
5. La lógica crítica quedaría en `node_modules`, fuera de la mutación de Stryker (umbral 85 %), y el paquete publicable arrastraría 202 KB (tabla de estados) por unas 15 líneas de cálculo.

Alternativa descartada: envolver `mrz` como dice la tarea 2 de la Fase 1 de `PLAN.md` ("`mrz-co`: envuelve `mrz` 5.0.2"). Es una desviación del plan: queda como pregunta para ratificación humana. `mrz` sigue aportando valor como implementación independiente (otro autor, otro código) para el oráculo diferencial; en la exploración coincidió con la referencia en B y en las variantes alteradas.

### 2. API pública

Módulos sugeridos: `packages/parsers/src/icao-9303.ts` (dígito de control) y `packages/parsers/src/mrz-cedula-digital.ts` (parser). Exports nuevos en `packages/parsers/src/index.ts`:

```ts
export function digitoControlIcao(texto: unknown): number | null;          // MZ-08
export function parsearMrzCedulaDigital(lineas: unknown, opciones?: unknown): ResultadoMrzCedulaDigital;

export interface OpcionesMrzCedulaDigital { fechaReferencia: string }     // "AAAA-MM-DD", MZ-04
export type MotivoRechazoMrz =
  | "entrada-no-valida" | "numero-lineas-invalido" | "fecha-referencia-invalida"
  | "entrada-demasiado-larga" | "caracteres-invalidos" | "longitud-linea-invalida"
  | "no-es-cedula-digital";
export type EstadoDigitoControl = "valido" | "invalido" | "ilegible" | "ausente";
export interface DigitoControl { estado: EstadoDigitoControl; leido: string; calculado: number }
export interface CorreccionOcr { linea: 1 | 2 | 3; columna: number; original: string; corregido: string }
export type CodigoErrorCampoMrz =
  | "serial-invalido" | "fecha-nacimiento-invalida" | "sexo-invalido" | "fecha-vencimiento-invalida"
  | "nacionalidad-invalida" | "nuip-invalido" | "nombre-no-alfabetico" | "apellidos-vacios";   // apellidos-vacios: MZ-23, siempre al final
export interface CamposMrzCedulaDigital {
  serial: string | null;
  codigoLugarMrz: string | null;              // 5 cifras DIVIPOL crudas; expedición o nacimiento sin decidir (M03)
  fechaNacimiento: string | null;
  sexo: "M" | "F" | "X" | null;
  fechaVencimiento: string | null;
  nacionalidad: "COL" | null;
  nuip: string | null;
  nuipTipoProbable: TipoProbable | null;      // de nuip-formato.ts
  apellidos: string;
  nombres: string;
  nombresPosiblementeTruncados: boolean;
}
export type ResultadoMrzCedulaDigital =
  | { ok: false; motivo: Exclude<MotivoRechazoMrz, "entrada-demasiado-larga" | "caracteres-invalidos" | "longitud-linea-invalida"> }
  | { ok: false; motivo: "entrada-demasiado-larga" | "caracteres-invalidos" | "longitud-linea-invalida"; linea: 1 | 2 | 3 }
  | {
      ok: true; valido: boolean; campos: CamposMrzCedulaDigital;
      digitosControl: { serial: DigitoControl; nacimiento: DigitoControl; vencimiento: DigitoControl; compuesto: DigitoControl };
      correcciones: CorreccionOcr[]; errores: CodigoErrorCampoMrz[]; warnings: string[];
      lineasCorregidas: [string, string, string];
    };
```

Se separan `ok` (la entrada es una MRZ de cédula digital legible) y `valido` (sus dígitos de control y campos son correctos), porque la UI necesita mostrar los campos de una lectura con un dígito malo para pedir otra captura, y la Fase 3 los cruzará con el OCR. Quien consuma el resultado MUST mirar `valido` antes de usar un campo como verdad (principio V). Alternativa descartada: poner a `null` los campos cubiertos por un dígito inválido; pierde información sin ganar seguridad, porque `valido` ya es `false`.

`calculado` es siempre un número: tras la normalización solo quedan `[A-Z0-9<]`, para los que el cálculo ICAO siempre está definido.

### 3. Fecha de referencia obligatoria

El siglo del nacimiento no se puede decidir sin una fecha "hoy", y leer el reloj rompe la pureza (MZ-02, igual que NF-02). Quien llama (SDK, PWA) pasa la fecha local de Colombia (`America/Bogota`) como `AAAA-MM-DD`; las pruebas fijan `2026-10-06` (fgardila hace lo mismo con `CURRENT_YEAR = 2026` en sus fixtures). Regla (MZ-13): `20AA` si esa fecha es menor o igual a la referencia, si no `19AA`; como comparación de cadenas ISO, que equivale a la cronológica. El año de referencia se limita a 2000-2099 para que `19AA` siempre sea anterior a la referencia.

Alternativas descartadas: pivote fijo (`AA <= 30`), que caduca en silencio; deducir el siglo del vencimiento, porque la vigencia de la cédula digital no está documentada y no aplicaría a otros documentos TD1; `Date.now()`, impuro.

### 4. Vencimiento siempre `20AA`, sin juicio de vigencia

La cédula digital existe desde diciembre de 2020 y la MRZ solo tiene dos cifras de año, así que todo vencimiento posible está entre 2000 y 2099. Decidir si el documento está vencido es una validación con la fecha de referencia que pertenece a la tarea `validadores` de la Fase 1 (`PLAN.md`); mezclarla aquí haría que `valido` cambiara con el tiempo para la misma MRZ.

### 5. Correcciones OCR-B incondicionales dentro de zonas fijas

Tabla exacta de la skill `formato-cedula`: `O` y `Q` a `0`, `I` a `1`, `Z` a `2`, `S` a `5`, `G` a `6`, `B` a `8`. Se aplican siempre dentro de las zonas numéricas de MZ-07 y nunca fuera, y después se calculan los dígitos de control sobre las líneas corregidas. Así cada sustitución queda en `correcciones` y una corrección errónea la detecta el dígito de control correspondiente.

Alternativa descartada: probar combinaciones de correcciones (o de lecturas alternativas) hasta que el dígito cuadre. Con un dígito módulo 10, cada intento tiene un 10 % de probabilidad de dar un falso válido: la búsqueda fabrica coincidencias (principio V). Tampoco se corrige número a letra en los nombres: un `0` en la línea 3 es señal de un OCR malo y se reporta como `nombre-no-alfabetico`.

Las dos excepciones fuera de las zonas numéricas son los campos de país (`COL` en la línea 1 col. 2-4 y en la línea 2 col. 15-17), cuyo único valor admitido es `COL`: cambiar `0` por `O` no puede inventar otro país. La nacionalidad no la cubre ningún dígito de control, por eso no se admite ninguna otra corrección ahí.

### 6. Código de expedición condicionado (M03)

Las columnas 15 a 19 son "opcional" en ICAO y M03 es pendiente. Si se corrigieran siempre y el campo resultara ser alfanumérico, el compuesto de un documento auténtico fallaría. Por eso (MZ-11) solo se corrigen si el resultado son 5 cifras y el resto del opcional es relleno; en otro caso se dejan crudas, sin error. El compuesto cubre estas columnas, así que una corrección indebida se detecta.

El ejemplo de Eitol usa `05001`, que es el código DIVIPOLA (DANE) de Medellín; en DIVIPOL Antioquia es `01`. Por decisión del orquestador (pregunta 3), el campo se llama `codigoLugarMrz`, un nombre neutral que no afirma el sistema, y vale las 5 cifras crudas como string (`"16001"`), sin partirlas en departamento y municipio ni traducirlas. El parser no consulta la tabla DIVIPOL y por eso no emite `D05` (la emite solo quien resuelva el código con DIVIPOL, decisión de `divipol-registraduria`).

### 7. NUIP con el validador existente

**Revisada tras la evidencia del 2026-10-06 (ver al final): solo `cc`; 11 cifras dan `nuip-invalido` y el parser ya no emite N01.** Texto original: la serie inicial sin `<` del opcional de la línea 2 se valida con `validarFormatoNuip(serie, { tipoDocumento: "cc" })` y, si falla, con `"ti"` (que solo añade el caso de 11 cifras, `ti-antigua`, con `warnings: ["N01"]`). Una sola regla de formato para todas las fuentes (PDF417, MRZ, OCR, captura manual). Cubre: NUIP de 10 cifras (Eitol), 11 cifras (fgardila admite hasta 11 en su `MrzFixtureBuilder`, aunque sus fixtures usan 10), cédulas antiguas de 5 a 9 cifras que conservan su número en la digital, y cero a la izquierda de relleno. Los `warnings` del validador se unen a los del parser (MZ-18).

Alternativas descartadas: rechazar 11 cifras (contradice la lectura de fgardila en M02); aceptarlas como `nuip` (sin evidencia).

### 8. Dígito del serial `<`: estado `ausente`, compatible con `valido`

M01 dice que la columna 14 "puede venir `<`". No se aplica la semántica ICAO de número largo (decisión 1.3) porque M01 fija un serial de 9 cifras. El serial sigue protegido porque el compuesto cubre la línea 1 col. 5-29, así que `ausente` no impide `valido: true` (MZ-17). Coincide con la variante `cd-documento-relleno` del generador (FX-17), que calcula el compuesto con ese `<`. Riesgo y alternativa en Risks y en las preguntas abiertas.

### 9. Sexo `X` y `<` como no especificado

ICAO 9303 usa `<` para sexo no especificado, y varios emisores usan `X`. No hay evidencia pública de cómo lo codifica la cédula digital colombiana; el parser los normaliza a `"X"` sin error para no invalidar documentos auténticos, y rechaza cualquier otro carácter (incluido `0` u `O`: el sexo no es zona numérica). El sexo se lee solo de la columna 7, nunca buscando `M` en la línea (error de repos antiguos).

### 10. Nombres sin partir

En la línea 3, `DE<LA<OSSA<FICTICIO` no permite saber dónde termina el primer apellido: el mismo `<` separa palabras y apellidos (comentario de fgardila en sus fixtures; G05 en el generador). El parser devuelve `apellidos` y `nombres` completos y no emite G05, porque solo aplica la regla ICAO del `<<`. La separación en primer y segundo apellido la dará el cruce con el OCR del anverso (Fase 3). `nombresPosiblementeTruncados` es "posiblemente" porque un nombre que llena exactamente 30 caracteres es indistinguible de uno truncado. Una `Ñ` en la entrada no es MRZ (ICAO translitera) y se rechaza como `caracteres-invalidos` sin lanzar.

### 11. Interfaz con el generador sintético

Contrato: `@lector-cedula/fixtures` con `VERSION_CONTRATO` 1.x (FX-02), importado solo desde `packages/parsers/test/`. Funciones usadas: `generarMrzTd1(persona, opciones)`, `arbPersonaFicticia()`, `arbFixtureMrz({ variantes })` y `PERSONA_BASE`; campos del fixture usados: `lineas`, `lineasSinErrores`, `inyecciones`, `esperado`.

Traducción de `esperado` (FX-15) a `campos` (MZ-21):

| `esperado` del generador | `campos` del parser |
|---|---|
| `serialDocumento` | `serial` |
| `lugarExpedicion` (`"16001"`) | `codigoLugarMrz` = `"16001"` (mismo valor) |
| `fechaNacimiento`, `sexo`, `fechaVencimiento`, `nacionalidad`, `nuip` | mismo nombre y valor |
| (constante: la MRZ del generador solo admite 10 cifras) | `nuipTipoProbable` = `"nuip"` |
| `primerApellido` + `" "` + `segundoApellido` | `apellidos` |
| `primerNombre` + (`" "` + `segundoNombre` si no es `""`) | `nombres` |
| `lineas[2][29] !== "<"` (el generador no trunca) | `nombresPosiblementeTruncados` |
| `digitosControl.documento`, `.nacimiento`, `.vencimiento`, `.compuesto` | `digitosControl.serial.estado`, etc.; `"relleno"` equivale a `"ausente"` |

Restricciones de la interfaz y cómo se resuelven:

- El generador admite fechas de 1900 a 2099; la regla de siglo del parser no puede representar todas. La ida y vuelta sustituye las fechas de la persona por rangos representables con `REF` (nacimiento de `1926-10-07` a `2026-10-06`, vencimiento de 2000 a 2099), válidos por construcción.
- `arbPersonaFicticia()` puede producir personas cuya línea 3 no cabe (`nombre-excede-mrz`); se descartan y se mide que el descarte sea menor del 50 % (antipatrón de propiedades vacías).
- El generador no produce NUIP de menos de 10 cifras, opcional de línea 1 vacío ni nombres truncados: esos casos los cubren los escenarios literales.
- Para que la ida y vuelta no sea tautológica, `packages/parsers/src` MUST NOT importar `@lector-cedula/fixtures` y el generador no debe importar `digitoControlIcao`; ambos se contrastan con `mrz` (FX-15 y MZ-09).

Si el generador no está integrado cuando empiece la implementación, los grupos 1 a 4 de `tasks.md` avanzan con los escenarios literales y el grupo 5 espera.

### 12. Evals

Registro en `evals/runners/registro.mjs`:

```js
"mrz-cedula-digital": { modulo: "packages/parsers/dist/index.js", exportar: "parsearMrzCedulaDigital", adaptar: aplanarMrz },
```

`aplanarMrz` (exportada y probada en `tools/test/`): con `ok: false` devuelve `{ ok, motivo, linea }` (`linea` `null` si no aplica); con `ok: true` devuelve `ok`, `valido`, las 11 claves de `campos` (`codigoLugarMrz` tal cual, ya es un string), `cdSerial`, `cdNacimiento`, `cdVencimiento`, `cdCompuesto` (estados), `correcciones` (número de correcciones), `errores` y `warnings` (unidos con `,`). Fixtures en `evals/fixtures/sinteticos/mrz-cedula-digital/<caso>.json` con `"sintetico": true`, `entrada` = array de 3 líneas, `opciones` = `{ "fechaReferencia": "2026-10-06" }` y `esperado` con las claves aplanadas relevantes de cada escenario. El caso de Eitol se marca en `descripcion` como "ejemplo sintético público de Eitol, caso negativo".

### 13. Límite de longitud antes de cualquier expresión regular

64 unidades UTF-16 por línea, comprobado en O(1) antes de normalizar (igual que NF-12), para que una entrada enorme no recorra expresiones regulares. 64 deja margen para los espacios que inserta un OCR en una línea de 30.

### 14. Propuestas para `docs/decisiones/hipotesis-formato.md` (no editado por este cambio)

Para que un humano las aplique o las rechace:

| ID | Propuesta |
|---|---|
| M01 | Añadir a evidencia: "El ejemplo sintético de Eitol no cumple ICAO en el serial (calcula 5, impreso 3) ni en el compuesto (calcula 5, impreso 0): no es evidencia a favor ni en contra. Con `<` en [14] el parser no aplica la semántica ICAO de número largo (estado `ausente`)." |
| M02 | Añadir a evidencia: "fgardila admite hasta 11 caracteres (`require(nuip.length <= 11)` en `MrzFixtureBuilder`) pero sus tres fixtures usan 10. El parser acepta 5 a 11 cifras vía `validarFormatoNuip` (11 como `ti-antigua`, N01)." |
| M03 | Ampliar el texto: "código de lugar de expedición de 5 cifras; el ejemplo de Eitol (`05001`) coincide con DIVIPOLA (DANE, Medellín) y no con DIVIPOL (Antioquia = 01): sistema de codificación por confirmar". |
| M04 | Añadir a evidencia: "Caso negativo cubierto con una MRZ sintética de la misma forma (MZ-20). El espécimen no está en el repositorio." |
| M05 (nueva) | "El código de documento de la cédula digital es `IC` y el emisor `COL` (Eitol, fgardila; pendiente)". Hoy el parser la usa como precondición (`no-es-cedula-digital`) y no la emite en `warnings`; si se registra, MZ-18 debe cambiar en un cambio posterior. |

## Risks / Trade-offs

- [M03 falso o en DIVIPOLA] -> El parser no traduce el código y su nombre (`codigoLugarMrz`) no afirma el sistema; la condición de MZ-11 evita corregir un opcional alfanumérico.
- [Serial `ausente` acepta `valido: true` con un dígito menos de protección] -> El compuesto cubre el serial; si un humano prefiere exigir el dígito, basta cambiar MZ-10 y MZ-17 (pregunta abierta 2).
- [Personas nacidas hace 100 años o más se leen en el siglo equivocado (1925 se lee 2025 con `REF` 2026)] -> Es un límite de la MRZ (dos cifras). Los validadores de edad de la Fase 1 marcarán una cédula de ciudadanía de un menor; el cruce con el OCR del anverso (Fase 3) lo resuelve.
- [Un OCR que inserta o pierde caracteres produce una línea de 29 o 31] -> Rechazo `longitud-linea-invalida` y nueva captura. Realinear es un cambio futuro con su propia spec.
- [Sustituciones letra por letra en zonas numéricas que el dígito no detecta, como `X` (33) por `3`] -> Por eso se valida que cada campo numérico sea de cifras (`serial-invalido`, MZ-07) además del dígito.
- [El contrato del generador cambia] -> FX-02 obliga a subir el MAJOR de `VERSION_CONTRATO` y actualizar a los consumidores en un cambio OpenSpec; las pruebas comprueban `VERSION_CONTRATO` 1.x.
- [Quien llama pasa una fecha de referencia equivocada (UTC en lugar de Bogotá)] -> Solo afecta a nacimientos en el día frontera; el SDK documentará la zona horaria.
- [Mutantes equivalentes en la validación de calendario] -> Se marcan con `// Stryker disable next-line <mutador>: equivalente; <razón>` como en `metricas.mjs`, nunca bajando el umbral.

## Pruebas

Según el principio II y la matriz de `.claude/skills/estrategia-pruebas/SKILL.md` (filas "Parsers" y "Evals de campo"). Comandos: `V` = `npx vitest run packages/parsers`; `C` = `npx vitest run packages/parsers --coverage --coverage.include=packages/parsers/src/icao-9303.ts --coverage.include=packages/parsers/src/mrz-cedula-digital.ts`; `T` = `npx vitest run tools/test/registro-mrz.test.mjs`; `M` = `npm run test:mutacion`; `E` = `npm run eval:quick`. Toda propiedad usa `numRuns >= 1000` salvo que se indique otro mínimo. "Vacuidad" = proporción medida con contadores o `fc.statistics` y comprobada con `expect` tras `fc.assert`. Las unitarias usan los valores literales del escenario y `toStrictEqual` cuando el escenario da el objeto completo; el nombre de cada `it` empieza por el ID del requisito.

| Requisito | Tipo de prueba | Herramienta | Comando | Umbral |
|---|---|---|---|---|
| MZ-01 | Unitaria: R1 completo, rechazo con y sin `linea` | Vitest | V | 3 de 3 `toStrictEqual` |
| MZ-02 | Propiedad "nunca lanza": `fc.anything()` como líneas y como opciones; 3 cadenas `fc.string()` y binarias | fast-check | V | numRuns >= 1000 cada una; 0 excepciones; forma de MZ-01 en el 100 % |
| MZ-02 | Fuzz: 1 a 5 sustituciones sobre MRZ válidas del generador | fast-check | V | numRuns >= 5000; 0 excepciones; vacuidad: `ok: true` > 50 % |
| MZ-02 | Unitaria: determinismo con argumentos congelados | Vitest | V | ambos resultados `toStrictEqual` R1 |
| MZ-03 | Unitaria: 7 escenarios de rechazo y prioridad | Vitest | V | 100 % `toStrictEqual` |
| MZ-04 | Unitaria: opciones ausentes, 7 fechas inválidas, propiedad heredada, límites | Vitest | V | 100 % de los literales |
| MZ-05 | Unitaria: normalización igual a R1; Ñ, `«`, U+00A0, 31 caracteres | Vitest | V | 100 % `toStrictEqual` |
| MZ-06 | Unitaria: `ID`, `VEN`, `I<`, espécimen ICAO, `C0L` emisor | Vitest | V | 100 % `toStrictEqual` |
| MZ-07 | Unitaria: 11 correcciones literales, nombres con letras confundibles, `X` en el serial | Vitest | V | 100 % de los literales |
| MZ-07 | Propiedad de inyección OCR-B sobre MRZ del generador | fast-check | V | numRuns >= 1000; igualdad de `campos`, `digitosControl`, `valido`, `lineasCorregidas`; `correcciones` exactas; vacuidad: >= 2 sustituciones en >= 30 % |
| MZ-08 | Unitaria: ejemplos ICAO, relleno, vacía, fuera de alfabeto, no string | Vitest | V | 11 de 11 literales |
| MZ-08 | Propiedad: toda sustitución de una cifra cambia el dígito; relleno final no lo cambia | fast-check | V | numRuns >= 1000 cada una; 0 fallos |
| MZ-09 | Unitaria: 4 alteraciones literales y dígito ilegible | Vitest | V | 5 de 5 literales |
| MZ-09 | Propiedad de alteración de cada dígito (sin recalcular el compuesto) | fast-check | V | numRuns >= 1000 por posición; 0 fallos |
| MZ-09 | Propiedad de sustitución de una cifra de datos | fast-check | V | numRuns >= 1000; `valido` `false` en el 100 %; vacuidad: cada zona cubierta elegida en >= 10 % |
| MZ-09 | Diferencial contra `mrz` 5.0.2 | fast-check + `mrz` | V | numRuns >= 1000; 100 % de coincidencia en los 4 dígitos; vacuidad: algún dígito inválido en >= 30 % |
| MZ-10 | Unitaria: ceros a la izquierda y dígito `ausente` | Vitest | V | 2 de 2 literales |
| MZ-11 | Unitaria: presente, vacío, letra no corregible, corregible, resto no vacío | Vitest | V | 5 de 5 literales |
| MZ-12 | Unitaria: 10, 11, cero inicial, 8 cifras, corto, vacío, hueco | Vitest | V | 7 de 7 literales |
| MZ-13 | Unitaria: siglos, frontera, referencia, bisiesto, inexistente, vencimiento | Vitest | V | 100 % de los literales |
| MZ-14 | Unitaria: `M`, `<`, `X`, `H`, `O` y apellido con M | Vitest | V | 6 de 6 literales |
| MZ-15 | Unitaria: `C0L`, `VEN`, `CO1` | Vitest | V | 3 de 3 literales |
| MZ-16 | Unitaria: compuesto, truncado, solo apellido, cifra en el nombre | Vitest | V | 4 de 4 literales |
| MZ-17 | Unitaria: cinco errores en orden fijo | Vitest | V | `toStrictEqual` del array |
| MZ-18 | Unitaria: tres combinaciones de `warnings` | Vitest | V | 3 de 3 literales |
| MZ-19 | Unitaria: claves de `campos` sin RH ni QR; exports sin `qr` | Vitest | V | 0 coincidencias de `/^rh$/i`, `/grupoSanguineo/i` y `/qr/i` |
| MZ-20 | Unitaria: ejemplo de Eitol y forma de `back-ccd.png` | Vitest | V | 2 de 2 literales |
| MZ-23 | Unitaria: L3 solo de relleno, L3 que empieza por `<<`, junto con la cifra en el nombre; caso negativo de apellido de una letra | Vitest | `npx vitest run packages/parsers/test/mrz-cedula-digital.test.ts -t MZ-23` (incluido en V) | 4 de 4: `[apellidos, nombres, errores, valido]` exactos de la spec; `["nombre-no-alfabetico", "apellidos-vacios"]` en ese orden; `X<<ANA` da `valido: true` |
| MZ-21 | Unitaria: `PERSONA_BASE` del generador | Vitest | V | `toStrictEqual` de `campos` |
| MZ-21 | Propiedad de ida y vuelta | fast-check + `@lector-cedula/fixtures` | V | numRuns >= 1000; 0 fallos; descarte < 50 %; vacuidad: cada categoría de MZ-21 >= 5 % |
| MZ-21 | Propiedad: variantes `cd-*` y `ocr-b` del generador | fast-check + `@lector-cedula/fixtures` | V | numRuns >= 1000 cada una; 0 fallos; vacuidad: cada variante >= 15 % |
| MZ-01 a MZ-18 | Cobertura de ramas de los dos módulos nuevos | Vitest + v8 | C | ramas >= 95 % en cada archivo |
| MZ-01 a MZ-18 | Mutación de `icao-9303.ts` y `mrz-cedula-digital.ts` | Stryker | M | >= 85 % en cada archivo; `break` 85 global sin cambios |
| MZ-22 | Unitaria del adaptador `aplanarMrz` (ok, rechazo con y sin línea) | Vitest | T | 3 de 3 `toStrictEqual` |
| MZ-22 | Eval de campo con los fixtures sintéticos | `eval-campo` | E | `mrz-cedula-digital`: `exact_match` 1 y `cer` 0 en cada campo; `valido.n` >= 20; 0 excepciones; sin regresión en otros tipos |
| Todos | Puerta completa | npm | `npm run check` | verde (tipos, lint, pruebas, licencias, privacidad, evals) |

## Migration Plan

No aplica: funciones nuevas y aditivas. Revertir es quitar los exports, la entrada de `registro.mjs`, los fixtures y la `devDependency`.

## Open Questions

Decisiones tomadas en este diseño que requieren ratificación humana; ninguna bloquea los grupos 1 a 4 de `tasks.md`, porque cambiarlas solo altera literales de escenarios concretos:

1. Desviación de `PLAN.md`: implementación propia en lugar de envolver `mrz` (decisión 1).
2. Dígito del serial `<` como `ausente` compatible con `valido: true` (decisión 8), o exigirlo.
3. Nombre y sistema del código de expedición: DIVIPOL frente a DIVIPOLA, a la luz del `05001` de Eitol (decisión 6). Resuelta abajo: `codigoLugarMrz`, nombre neutral.
4. Sexo `X` y `<` como `"X"` sin error (decisión 9).
5. NUIP de 11 cifras aceptado como `ti-antigua` con N01 en una cédula de ciudadanía (decisión 7).
6. Aplicar las propuestas de la decisión 14 a `docs/decisiones/hipotesis-formato.md`, incluida la nueva M05.
7. Transcribir la MRZ real de `back-ccd.png` como fixture de `evals/fixtures/especimenes/` (es un espécimen público de la Registraduría, pero hay que confirmar su fuente, su licencia de uso y que la persona del espécimen es ficticia) o quedarse con el análogo sintético de MZ-20.

## Decisiones del orquestador (2026-10-06, pendientes de ratificación humana)

- Pregunta 1: se acepta el cálculo ICAO propio con `mrz@5.0.2` solo como oráculo diferencial de prueba (desviación justificada de PLAN.md: `mrz` no corrige los opcionales, corrige números a letras en nombres y quedaría fuera de la mutación).
- Pregunta 2: se mantiene: serial con dígito `<` marcado `ausente`, válido si el compuesto cuadra.
- Pregunta 3: el opcional de L1 se expone con un nombre neutral, `codigoLugarMrz`, sin afirmar el sistema; M03 queda como "sistema de codificación desconocido (DIVIPOL o DIVIPOLA)" y no se resuelve con la tabla DIVIPOL hasta confirmarlo con evidencia. Ajustar la spec por la tarea correspondiente antes de codificar.
- Preguntas 4 y 5: se aceptan como propuestas, con warning.
- Pregunta 6: las propuestas de la decisión 14 se integran en `hipotesis-formato.md` en el commit del orquestador cuando termine el investigador de hipótesis.
- Pregunta 7: se usa solo el análogo sintético hasta confirmar fuente y licencia del espécimen.

## Decisiones tras la evidencia del 2026-10-06 (`docs/decisiones/2026-10-06-evidencia-hipotesis-formato.md`)

Comunicadas por el orquestador durante la implementación; prevalecen sobre las decisiones 6, 7 y 14 y sobre las preguntas 3 y 5 donde las contradigan.

- **M01 confirmada (posiciones).** El parser deja de emitir `M01`. El serial `<` sigue como `ausente` (decisión 8).
- **M02 confirmada con corrección.** El opcional de la línea 2 mide 11 caracteres y trae un NUIP de 10 cifras seguido de `<`; el "11" de fgardila es el ancho del campo. El NUIP se valida solo con `validarFormatoNuip(serie, { tipoDocumento: "cc" })` (5 a 10 cifras; se conservan las cédulas antiguas que mantienen su número); 11 cifras dan `nuip-invalido`. El parser deja de emitir `M02` y `N01` (N01 está confirmada por norma, pero ninguna fuente muestra un número de 11 cifras en una MRZ, y la MRZ solo existe en cédulas de policarbonato).
- **M03 sigue pendiente, con codificación DIVIPOL confirmada (D05).** No se sabe si el código es de expedición o de nacimiento, y puede venir vacío (espécimen actual). El campo se llama `codigoLugarMrz`, neutral respecto a expedición o nacimiento, y vale las 5 cifras crudas como string; traducirlo con la tabla DIVIPOL queda fuera de este cambio (consumidores y cambio `divipol-registraduria`). `warnings` contiene `M03` solo si el código está presente; nunca `D05`.
- **M04 confirmada con corrección.** El espécimen actual `back-ccd.png` tiene impreso 9 y calculado 8, con L1 `ICCOL000000012<<<<<<<<<<<<<<<<` (dígito del serial `<` y opcional vacío). El análogo sintético de MZ-20 reproduce esa forma: `["ICCOL999900123<<<<<<<<<<<<<<<<", "9007150F3407150COL9999123453<9", B3]`, compuesto impreso 9 y calculado 8 (comprobado con un cálculo ICAO independiente, que también da 8 para las líneas transcritas del espécimen).
- **M05 (nueva, confirmada): los especímenes públicos no son autoconsistentes.** La MRZ que publica Eitol (`WALTEROS<<LAURA`) es la del espécimen anterior de la Registraduría, persona ficticia; sigue como caso negativo de MZ-20 con los mismos literales. Ninguno de los dos es fixture positivo.
- La tabla de propuestas de la decisión 14 queda sustituida por la tabla final de `docs/decisiones/2026-10-06-evidencia-hipotesis-formato.md`, que aplica el orquestador.
