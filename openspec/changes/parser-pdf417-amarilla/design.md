# Design

## Context

- Motivación: ver `proposal.md`. Requisitos: `specs/pdf417-cedula-amarilla/spec.md` (PA-01 a PA-21).
- `packages/parsers` (`@lector-cedula/parsers`, publicable, MIT) hoy solo tiene `validarFormatoNuip` (capacidad `formato-nuip`). TypeScript strict con `module: NodeNext`, `noUncheckedIndexedAccess` y `exactOptionalPropertyTypes`; Vitest 3.2, fast-check 4.10 y Stryker 10 (`break` 85) ya instalados.
- Fuente del formato: `docs/investigacion/01-formato-cedula-y-repos.md` y la skill `formato-cedula`. Nada es oficial: todo offset es hipótesis (`docs/decisiones/hipotesis-formato.md`, H01 a H11, más G01 a G05 del cambio `generador-fixtures-sinteticos` y D01 a D05 del cambio `divipol-registraduria`).
- Cambios paralelos de los que depende este: `generador-fixtures-sinteticos` (paquete privado `@lector-cedula/fixtures`, `VERSION_CONTRATO` `"1.0.0"`, solo en pruebas y evals) y `divipol-registraduria` (`buscarDivipol(codigo5)` en el mismo paquete). Ninguno está implementado todavía.
- `tools/privacidad-check.mjs` marca cualquier línea con el literal del marcador en `packages/*/src/` y en pruebas sin el comentario `// fixture-sintetico`.
- El corredor de evals pasa `entrada` del fixture JSON tal cual a la función registrada; no hay hoy un adaptador de entrada.

## Goals / Non-Goals

**Goals:**
- Una función pública, pura y total: `parsearPdf417Amarilla(bytes: unknown, opciones?: unknown)`.
- Dos lectores independientes (offsets y patrones) cuya coincidencia es la base de la confianza en la trama completa.
- Que ningún byte de biometría, AFIS ni tarjeta decadactilar llegue al resultado, ni pueda cambiarlo.
- Que cada error histórico de los repositorios de referencia tenga una prueba con nombre.

**Non-Goals:**
- Decodificar la imagen del código, la tarjeta de identidad (H10), nombres de lugares, edad mínima o vigencia, el JSON Schema publicado (tarea `salida-json` del PLAN) y la composición con el OCR del anverso (Fase 3).
- Offsets relativos al marcador en la trama truncada (ver Open Questions).
- Leer la cola: no se decodifica, no se copia y no se mide.

## Decisions

1. **API pública y tipos** (PA-01 a PA-03, PA-15). Exportados desde `packages/parsers/src/index.ts`:

   ```ts
   export type VarianteTramaPdf417 = "completa" | "truncada" | "sin-pubdsk";
   export type ModoLecturaPdf417 = "offsets" | "patrones";
   export type BloqueDemograficoPdf417 = "sexo-primero" | "fecha-primero";
   export type Rh = "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-";
   export interface CamposCedulaAmarilla {
     numeroDocumento: string;               // formato-nuip, sin ceros a la izquierda
     primerApellido: string;
     segundoApellido: string | null;
     primerNombre: string;
     segundoNombre: string | null;
     sexo: "M" | "F";
     fechaNacimiento: string;               // YYYY-MM-DD
     rh: Rh;
     codigoDepartamentoNacimiento: string | null; // 2 dígitos DIVIPOL
     codigoMunicipioNacimiento: string | null;    // 3 dígitos DIVIPOL
   }
   export type CampoCedulaAmarilla = keyof CamposCedulaAmarilla;
   export type ConfianzaCampo = 0 | 0.5 | 0.6 | 0.9 | 1;
   export type IdValidacionPdf417 = "formato-nuip" | "consistencia-modos" | "divipol-codigos" | "divipol-existe";
   export interface ValidacionPdf417 {
     id: IdValidacionPdf417;
     estado: "ok" | "fallida" | "no-aplica";
     campos: CampoCedulaAmarilla[];
     detalle: string | null; // tabla de la decisión 9
   }
   export type MotivoErrorPdf417 =
     | "entrada-no-bytes" | "opciones-invalidas" | "entrada-vacia" | "entrada-demasiado-larga"
     | "nuip-no-encontrado" | "nuip-invalido" | "caracteres-invalidos-en-nombre"
     | "nombres-no-reconocidos" | "bloque-demografico-no-encontrado" | "fecha-nacimiento-invalida";
   export type ResultadoPdf417Amarilla =
     | {
         ok: true;
         version: "cc-amarilla";
         fuente: ["pdf417"];
         trama: { variante: VarianteTramaPdf417; modo: ModoLecturaPdf417; bloqueDemografico: BloqueDemograficoPdf417 };
         campos: CamposCedulaAmarilla;
         confianza: Record<CampoCedulaAmarilla, ConfianzaCampo>;
         validaciones: [ValidacionPdf417, ValidacionPdf417, ValidacionPdf417, ValidacionPdf417];
         warnings: string[];
       }
     | { ok: false; error: MotivoErrorPdf417 };
   /** Compatible con `buscarDivipol` del cambio divipol-registraduria; la respuesta se lee sin confiar en su forma. */
   export type ResolutorDivipol = (codigo: string) => unknown;
   export interface OpcionesPdf417Amarilla { divipol?: ResolutorDivipol }
   export function parsearPdf417Amarilla(bytes: unknown, opciones?: unknown): ResultadoPdf417Amarilla;
   ```

   - `version` identifica el tipo de documento (el PLAN lo pide para distinguir amarilla, digital, blanca y café) y `fuente` es un arreglo para que la Fase 3 pueda componer `["pdf417", "ocr"]`. `trama` no está en la lista del PLAN; se añade porque no es dato personal, alimenta la telemetría por versión de la Fase 7 y hace observable el modo híbrido en las pruebas y las evals.
   - Error mínimo `{ ok, error }`, como `formato-nuip` (`valido`, `motivo`): un error no lleva campos parciales (principio V: un error visible es mejor que un dato a medias).
   - Alternativa descartada: lanzar excepciones. El llamador de la Fase 2 reintenta con el siguiente fotograma y necesita un resultado total.

2. **Módulos** (cada uno entra en un PR pequeño, ver `tasks.md`): `packages/parsers/src/pdf417-amarilla/`
   - `bytes.ts`: clases de byte (letra Latin-1, dígito, separador), decodificación Latin-1, búsqueda del marcador.
   - `trama.ts`: clasificación de la variante (PA-06).
   - `bloque-demografico.ts`: reconocedores sexo primero y fecha primero, RH y fecha (PA-11 a PA-14).
   - `patrones.ts`: normalizador, segmentador, localizador del NUIP y mapeador de nombres (PA-08 a PA-10).
   - `offsets.ts`: lector por offsets (PA-07).
   - `ensamblar.ts`: elección de modo, confianza, validaciones y warnings (PA-17 a PA-19), resolutor (PA-15).
   - `index.ts`: `parsearPdf417Amarilla`, validación de entrada y opciones (PA-01, PA-03, PA-04).
   Cada lector devuelve `{ ok: true, valores, nombresPorH12 }` o `{ ok: false, error }` sin conocer al otro; `ensamblar.ts` compone.

3. **Decodificación Latin-1 sin `TextDecoder`** (PA-05). `new TextDecoder("latin1")` e `"iso-8859-1"` son etiquetas de windows-1252 en el estándar WHATWG: 0x80 se decodificaría como `€`. Se usa `String.fromCharCode(byte)` byte a byte, solo sobre los rangos de nombres ya delimitados. Letras: 0x41-0x5A, 0x61-0x7A, 0xC0-0xD6, 0xD8-0xF6, 0xF8-0xFF. Las minúsculas se aceptan y se devuelven tal cual (no se cambia la caja: `toUpperCase` depende de reglas Unicode que no aportan nada aquí). Un NFC explícito no hace falta: todo carácter Latin-1 ya es NFC.

4. **Clasificación de la trama** (PA-06, H02, H07). Búsqueda lineal del marcador (8 bytes `0x50 0x75 0x62 0x44 0x53 0x4B 0x5F 0x31`) en `[0, 64)`. `completa` exige marcador en 24 y un run de al menos 5 bytes 0x00 en `[10,24)` (regla "más de 4 NUL" de la investigación). El límite de 64 evita que un marcador aleatorio en la cola cambie la variante (PA-16).
   - El marcador se declara como arreglo de bytes, no como texto: `privacidad-check` prohíbe el literal en `src/` y no hace falta una excepción `privacidad-ok:`.

5. **Modo offsets** (PA-07, H04, H05, G01). Rangos semiabiertos de G01: NUIP `[48,58)`, nombres `[58,81)`, `[81,104)`, `[104,127)`, `[127,150)` (23 bytes cada uno; G01 resuelve la ambigüedad "58-80 / 81-104" de H04), bloque desde 150. Un nombre es el texto anterior al primer 0x00, que debe cumplir `L+( L+)*` (L = letra de la decisión 3) y no tener nada distinto de 0x00 después. Primer apellido y primer nombre no vacíos. El bloque se lee por posiciones: dígito, sexo, 8 dígitos de fecha, 6 dígitos, RH (`AB` antes que `A`/`B`/`O`) y signo. Cualquier fallo devuelve `offsets-sin-resultado` y el ensamblador usa patrones.

6. **Modo patrones** (PA-08 a PA-10, enfoque de fgardila/colombian-id-reader reimplementado con pruebas propias; el repo no declara licencia, así que no se copia código).
   - Normalizador 1:1: letras L, dígitos, `+`, `-`, `_` y 0x20 se conservan; el resto pasa a 0x20. Se conservan las posiciones, de modo que cada segmento sabe qué bytes crudos cubre. Diferencia deliberada con fgardila: su clase `[A-Za-z0-9+_-]` convierte la Ñ en espacio (error histórico "Ñ que rompe el parser").
   - Localizador del NUIP (H03): primer run de 10 o más dígitos ASCII cuyo byte siguiente es una letra L y cuyo último dígito está antes de la posición 96; el NUIP son sus 10 últimos dígitos. Recorrido lineal, sin expresiones regulares con retroceso (la `^\d*?(\d{10})` de fgardila es correcta, pero no se necesita).
   - Primer apellido: desde esa letra hasta la siguiente frontera (2 o más 0x20 normalizados).
   - Segmentos siguientes, como mucho 4, examinados en orden: si el segmento normalizado cumple `L+( L+)*` es un nombre y sus bytes crudos deben estar en L ∪ {0x20, 0x00} (si no, `caracteres-invalidos-en-nombre`: atrapa UTF-8 y bytes C1); si empieza en la posición 192 o después, o no es nombre ni bloque, `bloque-demografico-no-encontrado`; si es bloque, se detiene. Más de 3 nombres o 0 nombres: `nombres-no-reconocidos`. El fin de la entrada sin bloque: `bloque-demografico-no-encontrado`.
   - Bloques (al inicio del segmento, sin anclar el final porque la cola sigue sin separador): sexo primero `[0-9][MF][0-9]{8}[0-9]*(AB|A|B|O)[+-]` y fecha primero `[0-9]{2}[0-9]{8}[MF][0-9]*(AB|A|B|O)[+-]`; se implementan como autómatas de un solo paso (sin retroceso: el run de dígitos termina en la primera letra). Disjuntos por el segundo carácter. El signo es el último byte interpretado.
   - Asignación H12 (decisión 11): 3 nombres en orden; 2 = segundo apellido + primer nombre; 1 = primer nombre.
   - Límites 96 y 192: margen amplio sobre las posiciones conocidas (58 y 150 en la trama completa) para que una trama corrupta no haga leer como NUIP o como bloque bytes de la cola. No son hipótesis del formato sino una salvaguarda del principio III; si una variante real los supera, se revisan en otro cambio.

7. **Bloque y DIVIPOL** (PA-11, PA-12, PA-15, H05, H06, H08). Sexo primero con exactamente 6 dígitos: departamento `[0,2)`, municipio `[2,5)`, sexto descartado (DIVIPOL, no la lectura 3+3 de Yeison07). Con otra cantidad: códigos `null`, `divipol-codigos` `fallida` con detalle `longitud-inesperada`. Fecha primero: códigos `null` y `divipol-codigos` `no-aplica` con `bloque-sin-divipol`, aunque el generador (G04) coloque ahí departamento y municipio: ninguna fuente pública dice que esos dígitos sean DIVIPOL (fgardila los ignora con `\d*`). Ver Open Questions.

8. **Confianza** (PA-17). Sin dígito de control en el PDF417, la única corroboración disponible es la coincidencia de dos lectores independientes:

   | Situación | Confianza |
   |---|---|
   | Trama completa, offsets y patrones con el mismo valor | 1 |
   | Un solo modo con resultado (variante no completa, o un modo falló) | 0.9 |
   | Campo de nombre asignado por H12 en patrones | 0.6 |
   | Offsets y patrones discrepan (se entrega offsets) | 0.5 |
   | Código DIVIPOL `null` | 0 |

   Prevalece offsets en la discrepancia porque solo discrepan cuando un nombre llena su rango o falta el segundo apellido, y ahí patrones es el que se equivoca (escenarios de `C(P7)` y `C(P8)`). Los valores son literales cerrados para que las pruebas usen `toStrictEqual`.

9. **Validaciones** (PA-18), siempre cuatro y en este orden:

   | id | `estado` / `detalle` |
   |---|---|
   | `formato-nuip` | `ok` / `tipoProbable` de `validarFormatoNuip` (`nuip` o `cedula-antigua`) |
   | `consistencia-modos` | `ok` / `null`; `fallida` / `null` con los campos discrepantes; `no-aplica` / `trama-no-completa`, `offsets-sin-resultado` o `patrones-sin-resultado` |
   | `divipol-codigos` | `ok` / `null`; `fallida` / `longitud-inesperada`; `no-aplica` / `bloque-sin-divipol` |
   | `divipol-existe` | `ok` / `null`; `fallida` / `desconocido`; `no-aplica` / `sin-codigos`, `sin-resolutor`, `sin-dato` o `error-resolutor` |

   El orden de precedencia de `divipol-existe` es: códigos `null` -> `sin-codigos`; sin resolutor -> `sin-resolutor`; si no, se llama.

10. **Reutilización de `validarFormatoNuip`** (PA-09). Se importa de `../nuip-formato.js` y se llama con los 10 dígitos y sin opciones (cédula). No se duplica ninguna regla: ceros a la izquierda, 5 a 10 dígitos y ausencia de dígito de control quedan en `formato-nuip`. Si `formato-nuip` cambia, este parser hereda el cambio y las pruebas de PA-09 lo detectan.

11. **Warnings** (PA-19, principio VI). Se calculan al final con un conjunto y se ordenan con comparación de código (`<`), no con `localeCompare`. Se emite `G01` junto con `H04` en modo offsets porque el lector usa exactamente la concreción de G01 (decisión 8 del cambio del generador: los parsers que dependen de una concreción `G` la emiten). No se emiten `G02` ni `G03`: el modo patrones no depende de dónde ni cuánto se trunca. No se emite `H01`: el parser no depende de la longitud total. Los IDs del resolutor se copian solo si son texto con la forma `^[A-Z][0-9]{2}$`.

12. **Resolutor DIVIPOL inyectado, no importado** (PA-15). Alternativa considerada: importar `buscarDivipol` dentro del parser, como sugiere la decisión 3 del cambio `divipol-registraduria`. Se descarta por ahora porque (a) los dos cambios se implementan en paralelo y la importación bloquearía este; (b) quien solo quiere los campos no carga la tabla de 1.122 filas; (c) las pruebas usan espías sin tocar la tabla. La firma `(codigo: string) => unknown` acepta `buscarDivipol` tal cual (`{ divipol: buscarDivipol }`), y la respuesta se interpreta de forma defensiva (`encontrado === true`; `motivo` `desconocido` o `sin-dato`; cualquier otra cosa o excepción es `error-resolutor`). Tras aplicar ambos cambios, una tarea de integración prueba `buscarDivipol` real (PA-15, último escenario). Si el orquestador prefiere el resolutor por defecto, es un cambio pequeño posterior (Open Questions).

13. **Generador sintético como dependencia de pruebas** (PA-16, PA-21). Se consume la interfaz `VERSION_CONTRATO` `"1.0.0"` de `@lector-cedula/fixtures`: `generarPdf417(persona, { variante, semilla })` -> `{ bytes, rangos, esperado, hipotesis }`, `PERSONA_BASE`, `arbPersonaFicticia`, `arbFixturePdf417({ variantes, nuipCorto })` y `casosPdf417()`. Mapeo de variantes: `completa` -> `completa`/`sexo-primero`; `windows-truncada` -> `truncada`; `sin-pubdsk` -> `sin-pubdsk`; `fecha-primero` -> `completa`/`fecha-primero`. Las pruebas comprueban `VERSION_CONTRATO === "1.0.0"` para fallar con un mensaje claro si el contrato cambia. El oráculo de la ida y vuelta es `esperado` del generador (código independiente del parser), traducido con una tabla literal en la prueba.
   - Las pruebas unitarias no usan el generador: construyen `C(p)`, `W(p)`, `S(p)` y `F` con un ayudante propio, `packages/parsers/test/ayudas/tramas-referencia.ts`, que implementa la disposición escrita en la spec (no la del parser). El ayudante tiene sus propias pruebas con literales de bytes de la spec y, cuando el generador exista, una prueba que compara sus rangos con los de `generarPdf417` para la misma persona (fuera de cabecera, AFIS, tarjeta, dígito desconocido y cola, que el generador saca de su PRNG).
   - Aunque los nombres del generador no llevan tildes (fuera de alcance en ese cambio), las vocales acentuadas quedan cubiertas por las unitarias de PA-05 con el ayudante.

14. **Privacidad** (principio III, PA-16). Sin E/S, sin `console`, sin estado de módulo mutable. El parser no guarda referencias a `bytes` ni a vistas de su `buffer` en el resultado; la cola nunca se lee (los límites 96 y 192 y el signo del RH acotan todo acceso). Las pruebas que contengan el literal del marcador llevan `// fixture-sintetico` en la primera línea. AFIS `99998888` y tarjeta `99997777` de la trama de referencia están en el rango sintético `9999`.

15. **Evals** (skill `eval-campo`). El JSON no transporta `Uint8Array`, así que:
   - Adaptador `evals/runners/adaptadores/pdf417-amarilla.mjs`, exporta `evaluarPdf417AmarillaHex(hex, opciones)`: valida `^([0-9a-f]{2})*$` (si no, lanza `Error` con el texto `hex`), convierte a `Uint8Array`, importa `parsearPdf417Amarilla` de `packages/parsers/dist/index.js` y aplana: éxito -> `{ ok, ...campos, variante, modo, bloqueDemografico, warnings }`; error -> `{ ok: false, error }`.
   - Registro: `"pdf417-amarilla": { modulo: "evals/runners/adaptadores/pdf417-amarilla.mjs", exportar: "evaluarPdf417AmarillaHex" }`. No cambia `eval-campo.mjs` ni la capacidad `evals-por-campo`.
   - Fixtures: `evals/fixtures/sinteticos/pdf417-amarilla/<id>.json`, uno por caso de `casosPdf417()` (12) más uno por cada motivo de interpretación de PA-03 (6), construidos modificando bytes de `completa-base` según sus `rangos`, con `"sintetico": true`, `"clavesExactas": true` y `entrada` en hexadecimal en minúsculas. Los genera `tools/fixtures/pdf417-amarilla.mjs` (determinista, semilla 1) y una prueba en `tools/test/` comprueba que regenerarlos da los mismos archivos (sin deriva).
   - El adaptador y el script son código de harness: pruebas propias y mutación (antipatrón "código de harness sin mutar").

16. **Configuración compartida** (conflictos con los cambios paralelos). Este cambio añade, sin reescribir líneas ajenas: en `stryker.config.mjs`, `"evals/runners/adaptadores/**/*.mjs"` en `mutate` (los fuentes del parser ya están cubiertos por `packages/parsers/src/**/*.ts`); el alias de `@lector-cedula/fixtures` lo añade el cambio del generador (su decisión 10). Si este cambio se integra antes que el generador, los grupos 8 y 9 de tareas esperan.

## Propuestas para `docs/decisiones/hipotesis-formato.md` (no editado por este cambio)

El orquestador decide y registra; ningún archivo de decisiones se toca aquí.

| ID | Hipótesis propuesta | Fuente | Estado | Evidencia |
|---|---|---|---|---|
| H12 | En modo patrones, si entre el primer apellido y el bloque demográfico hay dos campos de texto, son el segundo apellido y el primer nombre (falta el segundo nombre); si hay uno, es el primer nombre. Una persona sin segundo apellido y con segundo nombre se lee mal sin offsets | Supuesto de este parser; los campos vacíos de la trama no dejan rastro cuando el lector altera los rellenos | pendiente | Sin payload real con segundo apellido vacío |

Enmiendas de texto propuestas (sin ID nuevo):
- H04: añadir "en rangos semiabiertos [58,81), [81,104), [104,127), [127,150) de 23 bytes; ver G01".
- H06: añadir "y corresponden al lugar de nacimiento" (el parser nombra los campos `codigo...Nacimiento`; ninguna fuente lo prueba con cédulas reales).
- H08: anotar que el parser no extrae DIVIPOL de este bloque mientras G04 no se confirme.

Si `H12` choca con otro ID añadido en paralelo, se renumera aquí, en la spec (PA-10, PA-17, PA-19) y en las pruebas antes del primer commit del grupo 3.

## Risks / Trade-offs

- [H12 lee mal a una persona sin segundo apellido y con segundo nombre en tramas no completas] → Confianza 0.6 y warning `H12`; en la trama completa offsets lo corrige y la discrepancia baja la confianza a 0.5. Escenario explícito en PA-10.
- [Un nombre real de 22 o 23 bytes hace discrepar a los modos y baja la confianza a 0.5 con el valor correcto] → Aceptable: la confianza informa, no rechaza. Propiedad de nombres largos en PA-21.
- [Relleno con un solo 0x00 en tramas no completas une dos nombres como apellido compuesto] → No detectable sin offsets. Queda en `consistencia-modos` cuando la trama es completa; para las truncadas, Open Questions (offsets relativos).
- [Los límites 96 y 192 rechazan una variante real desconocida más larga] → Error visible, no dato inventado; se ajustan en un cambio con evidencia.
- [El contrato del generador cambia de versión] → Las pruebas comprueban `VERSION_CONTRATO` y fallan con mensaje claro.
- [Conflictos de edición en `stryker.config.mjs`, `registro.mjs` e `index.ts` con otros cambios] → Líneas independientes y exports agrupados por módulo.
- [Rendimiento con entradas adversarias] → Todo es lineal sobre como mucho 2048 bytes; sin expresiones regulares con retroceso sobre la entrada completa.

## Migration Plan

Capacidad nueva, sin migración. Retirada: quitar el export de `index.ts`, `src/pdf417-amarilla/`, sus pruebas, el evaluador de `registro.mjs`, el adaptador, sus fixtures y la línea de `mutate`; el baseline de evals pierde el tipo `pdf417-amarilla` (lo fija el orquestador).

## Open Questions

Ninguna cambia la spec ni las tareas de este cambio; todas pueden resolverse después.

1. ¿Leer la trama truncada por offsets relativos al marcador (posición absoluta - 24 + posición del marcador)? Eliminaría H12 en las tramas de Windows si G02 se confirma. Sería un cambio posterior sobre PA-07 y PA-08.
2. ¿Usar `buscarDivipol` como resolutor por defecto cuando no se inyecta ninguno, una vez integrado `divipol-registraduria`?
3. ¿Extraer DIVIPOL del bloque fecha primero si G04 se confirma con un payload real?
4. ¿El esquema normalizado definitivo (tarea `salida-json` y cambio `api-validaciones-contrato`) envuelve este resultado o lo reemplaza? Este cambio fija solo la salida del parser.

## Pruebas

Comandos: `V` = `npx vitest run packages/parsers`; `C` = `npx vitest run packages/parsers --coverage --coverage.include="packages/parsers/src/pdf417-amarilla/**"`; `M` = `npm run test:mutacion -- --mutate "packages/parsers/src/pdf417-amarilla/**/*.ts,evals/runners/adaptadores/**/*.mjs"`; `T` = `npx vitest run tools/test/adaptador-pdf417-amarilla.test.mjs tools/test/fixtures-pdf417-amarilla.test.mjs`; `E` = `npm run eval:quick`; `P` = `npm run check:privacidad`; `L` = `npx eslint packages/parsers evals/runners tools`; `K` = `npm run typecheck`.

Reglas comunes: un `it` por escenario, nombrado `"<PA-xx> <escenario> (atrapa: <fallo>)"`, con los literales de la spec y `toStrictEqual`. Toda propiedad usa `numRuns >= 1000` y semilla aleatoria de `fast-check`; toda propiedad con ramas o con generadores mezclados mide su proporción de casos útiles con contadores y `expect` tras `fc.assert` (salvaguarda de vacuidad). Oráculos independientes: literales de la spec, `esperado` del generador o `validarFormatoNuip` (contrato de PA-09); nunca la misma expresión que el código.

| Requisito | Tipo de prueba | Herramienta | Comando | Umbral |
|---|---|---|---|---|
| PA-01 | Unitaria: 4 escenarios (no bytes, vacía, 2048/2049, vista y `Buffer`) | Vitest | V | 100 % `toStrictEqual` |
| PA-01, PA-04 | Fuzz: `fc.anything()` como `bytes` | fast-check | V | numRuns >= 1000; 0 excepciones; no `Uint8Array` -> resultado literal 100 % |
| PA-02 | Unitaria: objeto completo de `C(P1)`; datos planos de `C(P2)` | Vitest | V | `toStrictEqual` exacto; `JSON` ida y vuelta igual |
| PA-03 | Unitaria: prioridad de 4 motivos de entrada y 6 de interpretación | Vitest | V | 10 de 10 literales; claves exactas `ok` y `error` |
| PA-04 | Fuzz de bytes: `fc.uint8Array({ maxLength: 2048 })` | fast-check | V | numRuns >= 1000; 0 excepciones; 100 % con forma PA-02 o PA-03 |
| PA-04 | Propiedad: `fc.uint8Array({ minLength: 2049, maxLength: 4096 })` | fast-check | V | numRuns >= 1000; 100 % `entrada-demasiado-larga` |
| PA-04, PA-15 | Fuzz de opciones: `C(P1)` con `fc.anything()` | fast-check | V | numRuns >= 1000; 0 excepciones; 100 % `campos` de PA-02 u `opciones-invalidas` |
| PA-04 | Propiedad de tramas mutadas: 1 a 3 bytes sustituidos en `arbFixturePdf417()`; invariantes por campo (`numeroDocumento` `^[1-9][0-9]{4,9}$`, nombres `L+( L+)*`, fecha ISO real, RH de la lista, códigos `^[0-9]{2}$`/`^[0-9]{3}$` o `null`, confianza en {0, 0.5, 0.6, 0.9, 1}) | fast-check | V | numRuns >= 1000; 100 % de los `ok` cumplen; vacuidad: `ok` > 50 % y errores >= 5 % |
| PA-04 | Propiedad: determinismo y entrada intacta sobre `arbFixturePdf417()` | fast-check | V | numRuns >= 1000; resultados iguales y bytes sin cambios en el 100 % |
| PA-05 | Unitaria: 4 escenarios (Ñ y tildes, Ñ inicial, UTF-8, byte C1) | Vitest | V | 100 % literales; bytes de los escapes `Ñ`, `É`, `Á` comprobados con `node -e` sobre el archivo de prueba |
| PA-06 | Unitaria: 3 escenarios | Vitest | V | 100 % literales |
| PA-07 | Unitaria: 4 escenarios | Vitest | V | 100 % literales |
| PA-08 | Unitaria: 3 escenarios | Vitest | V | 100 % literales |
| PA-08, PA-20 | Metamórfica: misma persona en `completa`, `windows-truncada` y `sin-pubdsk` da los mismos `campos` (`arbPersonaFicticia({ nuipCorto: true })`, misma semilla) | fast-check + generador | V | numRuns >= 1000; 100 % iguales; vacuidad: sin segundo nombre >= 8 %, Ñ >= 20 % |
| PA-09 | Unitaria: 4 escenarios | Vitest | V | 100 % literales |
| PA-09 | Propiedad de oráculo: campo NUIP de `C(P1)` = `"0".repeat(k)` + dígitos, `k` de 0 a 10 | fast-check | V | numRuns >= 1000; `ok` si y solo si `validarFormatoNuip(d).valido`, con `numeroDocumento` igual a su `numero`; vacuidad: válidos >= 25 %, inválidos >= 10 % |
| PA-10 | Unitaria: 5 escenarios | Vitest | V | 100 % literales |
| PA-11 | Unitaria: 3 escenarios | Vitest | V | 100 % literales |
| PA-12 | Unitaria: 2 escenarios | Vitest | V | 100 % literales |
| PA-13 | Unitaria: 12 tramas | Vitest | V | 12 de 12 literales |
| PA-14 | Unitaria: 3 válidas y 6 inválidas | Vitest | V | 9 de 9 literales |
| PA-14 | Propiedad: fechas válidas por construcción (tabla literal de días por mes y regla bisiesta escrita en la prueba) y fechas imposibles (día 0, día 32, mes 0, mes 13, 29 de febrero no bisiesto) | fast-check | V | numRuns >= 1000; ISO exacto o `fecha-nacimiento-invalida`; vacuidad: inválidas >= 30 %, 29 de febrero bisiesto >= 1 % |
| PA-15 | Unitaria con espías (`vi.fn`): 8 escenarios | Vitest | V | llamadas y argumentos exactos; 100 % literales |
| PA-15 | Integración con `buscarDivipol` real (tras `divipol-registraduria`) | Vitest | V | `divipol-existe` `ok` para `C(P3)` |
| PA-16 | Unitaria: cola fija, datos de control, límites 95/96 y 191/192 | Vitest | V | 100 % literales |
| PA-16 | Propiedad: independencia de la cola en las 4 variantes del generador | fast-check + generador | V | numRuns >= 1000 por variante; 100 % iguales y `ok` |
| PA-17 | Unitaria: 3 escenarios | Vitest | V | 100 % literales |
| PA-18 | Unitaria: 3 escenarios | Vitest | V | 100 % literales |
| PA-19 | Unitaria: 6 caminos | Vitest | V | 6 de 6 listas exactas |
| PA-19 | Propiedad: `warnings` ordenada, sin duplicados, cada ID `^[A-Z][0-9]{2}$` y subconjunto de {G01, H02 a H09, H11, H12} sobre `arbFixturePdf417()` | fast-check + generador | V | numRuns >= 1000; 100 % |
| PA-20 | Unitaria de errores conocidos: 10 escenarios, un `it` por error, nombre con "(atrapa: ...)" | Vitest | V | 10 de 10; cada uno visto fallar contra un mutante manual del error histórico (por ejemplo, RH con `slice(-2)`) |
| PA-21 | Propiedad de ida y vuelta: 4 variantes y nombres largos | fast-check + generador | V | numRuns >= 1000 por variante; 100 % `ok` y `campos` iguales; vacuidad del escenario de PA-21 |
| PA-01 a PA-21 | Cobertura de ramas de `src/pdf417-amarilla/` | Vitest v8 | C | ramas >= 95 %; líneas >= 95 % |
| PA-01 a PA-21 | Mutación de `src/pdf417-amarilla/` y del adaptador | Stryker | M | >= 85 % por archivo; `break` 85 global; cada superviviente justificado como equivalente en el PR o muerto con una prueba nueva |
| PA-02, PA-03, PA-21 | Eval de campo `pdf417-amarilla` (12 casos del catálogo + 6 de error) | `eval-campo` | E | 0 excepciones; `exact_match` 100 % y CER 0 en cada campo sintético; sin regresión frente a `baseline.json`; `__claves` exacto 100 % |
| Harness (decisión 15) | Unitaria del adaptador (hex inválido, éxito aplanado, error) y del script de fixtures (sin deriva) | Vitest | T | 100 % en verde; mutación del adaptador >= 85 % (M) |
| PA-16 (principio III) | Privacidad: sin literal del marcador en `src/`, fixtures con `"sintetico": true` | `privacidad-check` | P | 0 hallazgos |
| Todos | Tipos y lint | tsc, ESLint | K, L | 0 errores |

## Decisiones del orquestador (2026-10-06, pendientes de ratificación humana)

- Pregunta 1: se acepta la lectura con warning H12 y confianza 0.6 en tramas no completas; H12 se registra en `hipotesis-formato.md` en el commit del orquestador. La lectura por offsets relativos al marcador queda como mejora posterior si la evidencia la respalda.
- Pregunta 2: el resolutor DIVIPOL se mantiene inyectable (sin importar la tabla por defecto), para no acoplar el parser al tamaño de la tabla.
- Pregunta 3: en el bloque fecha-primero, departamento y municipio son `null` (principio V: sin evidencia no se afirma). El generador debe alinearse: su variante fecha-primero no debe declarar esos campos en `esperado` para el parser.
- Pregunta 4: se acepta provisionalmente; la spec `salida-json` unificará.
- Pregunta 5: NO. La salida de producción solo lleva IDs de hipótesis del formato (H, M, N, D). En modo offsets se emite `H04` en lugar de `G01`; ajusta la spec antes de codificar el grupo correspondiente.
- Pregunta 6: se aceptan como convenciones documentadas, a revisar con el set de campo.
