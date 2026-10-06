# Design

## Context

Motivación: ver `proposal.md` (Why). Requisitos: `specs/divipol/spec.md` (DV-01 a DV-18).

Estado observado el 2026-10-06 (análisis hecho fuera del repositorio, en el directorio temporal de la sesión; nada se descargó al repo):

- `packages/parsers` solo contiene `nuip-formato.ts`. `stryker.config.mjs` muta `packages/parsers/src/**/*.ts`: sin cambios, mutaría también la tabla generada (miles de mutantes de literales sin valor). `tools/privacidad-check.mjs` prohíbe `writeFile` en `packages/*/src/`: el generador vive en `tools/`.
- `.gitattributes` normaliza todo a LF (`* text=auto eol=lf`): una instantánea de fuente con CRLF cambiaría de checksum al hacer checkout.
- Python local está bloqueado: el generador es Node 24 sin dependencias.

Fuentes evaluadas (licencia leída con `gh api repos/<repo>` y `gh api repos/<repo>/license`, metadatos de datos.gov.co con `/api/views/<id>.json`):

| Fuente | Licencia verificada | Contenido observado | Uso en este cambio |
|---|---|---|---|
| Eitol/colombian-cedula-reader `src/barcode/localities.py` @ `d72a342deb7255ca49cafe16bb3f8c0b6e54869a` (único commit que toca el archivo, 2022-08-23) | MIT, `Copyright (c) Hector Oliveros` | 1.190 filas, 1.190 códigos únicos, 34 departamentos, 67 consulados, incluye `15001` y `16001`. UTF-8, LF, SHA-256 `56f8f441...f58f803d` (igual al descargar por commit y por `master`). `Ñ` corrupta como `/` en 24 municipios; U+2010 en 4 nombres | **Primaria** |
| Yeison07/cedula-colombiana-pdf417-decoder `model/locations.go` @ `24c94066...` | MIT, `Copyright (c) [2024] [Yeison]` | Mismos 1.190 códigos y nombres que Eitol (derivada) | Ninguno: no aporta información independiente |
| miltonrojasb/visualizador-electoral-2026 `data/raw/DIVIPOL.TXT` (subido el 2026-09-10) | **Sin licencia** (`license: null`, `/license` da 404). El contenido es un catálogo de la Registraduría sin términos de uso publicados en el repo | 14.438 líneas de 146 caracteres, Latin-1, por puesto de votación; 1.189 municipios únicos; nombres de departamento truncados a 12 caracteres (`NORTE DE SAN`). Frente a Eitol: 12 códigos solo en Eitol (`15001`, `50050` y 10 consulados), 11 solo en el TXT (`17082` NUEVO BELEN DE BAJIRA y 10 consulados), 31 nombres distintos en bruto, 6 tras las transformaciones de DV-14 (`16001` `BOGOTA. D.C.`, `50070` `BARRANCOMINAS` y 4 consulados renombrados) | Solo contraste local (DV-18), sin redistribuir |
| datos.gov.co `mv2e-prx5` (Divipole 2023, Registraduría) | CC BY-SA 4.0 | Solo nombres (departamento, municipio, puesto); **sin códigos** | Ninguno |
| datos.gov.co `gdxc-w37w` (DIVIPOLA, DANE) | CC BY-SA 4.0 | 1.122 filas, 33 departamentos (1.103 municipios, 1 isla, 18 áreas no municipalizadas), actualizado 2025-01-24; CSV UTF-8 sin BOM, LF, SHA-256 `159b4b84...21b9b492`, idéntico en dos descargas | Equivalencia (DV-15, DV-16) |

Correcciones a `docs/investigacion/01-formato-cedula-y-repos.md`, sección 5: la tabla de Eitol tiene 1.190 filas, no 1.122 (1.122 es el número de filas de DIVIPOLA del DANE). Además, en DIVIPOLA el código de departamento 88 es San Andrés, lo que choca con los consulados 88 de DIVIPOL.

Prototipo del join (mismas fuentes, normalización de DV-16): 1.042 por nombre exacto, 48 sin paréntesis, 33 manuales (32 con código y 1 sin equivalente), 0 ambigüedades, 0 códigos DANE repetidos salvo `11001`; único código DANE sin pareja: `27493` (NUEVO BELÉN DE BAJIRÁ, ausente de Eitol).

## Goals / Non-Goals

**Goals:**

- Tabla DIVIPOL trazable a una fuente con licencia limpia, generada sin red desde instantáneas versionadas y verificable por checksum en CI.
- Contrato estable para `parser-pdf417-amarilla`, `parser-mrz-cedula-digital` y el validador "DIVIPOL existente".
- Equivalencia DIVIPOLA aislada del resto del paquete para que el share-alike no alcance al código MIT.

**Non-Goals:**

- Búsqueda inversa por nombre (texto OCR del lugar de expedición): Fase 3, con su propio cambio.
- Equivalencia DIVIPOLA -> DIVIPOL.
- Decidir qué lugar representa el código del PDF417 (nacimiento o expedición) o si el opcional de la MRZ usa DIVIPOL: lo deciden los cambios de cada parser con las hipótesis H05, H06, M03 y D05.
- Incorporar los 11 códigos que solo están en `DIVIPOL.TXT` (pregunta abierta 1).
- Publicar el paquete en npm (Fase 7).

## Decisions

### 1. Fuente primaria: `localities.py` de Eitol, fijado por commit

Se elige Eitol porque es la única fuente con códigos DIVIPOL y licencia declarada compatible (MIT), y porque contiene códigos históricos que aparecen en cédulas emitidas desde 2000 (`15001`, `50050` MAPIRIPANA, consulados renumerados o cerrados) y que la DIVIPOL electoral de 2026 ya no tiene.

Alternativas descartadas:
- `DIVIPOL.TXT` vía miltonrojasb: es la más actual y oficial en contenido, pero la copia accesible está en un repositorio sin licencia y la Registraduría no publica términos para ese archivo. Por el principio IV se registra como fuente de licencia dudosa en `docs/decisiones/2026-10-06-fuente-divipol.md` y no se redistribuye.
- Yeison07: idéntica a Eitol; no añade evidencia.
- `mv2e-prx5`: no trae códigos.
- PDF de 2011 del repo de Eitol: requeriría extracción de PDF y revisión manual; Eitol ya la hizo.

Consecuencia: la tabla no tiene `17082` ni los consulados nuevos. `buscarDivipol` los devuelve como `desconocido` con `D01`, que es visible y no inventa nada (principio V).

### 2. Transformaciones mínimas y sin datos del DANE

El generador solo corrige la corrupción conocida de Eitol (`/` -> `Ñ`, U+2010 -> `-`, recorte) (DV-14). Los nombres de la tabla DIVIPOL nunca se toman ni se corrigen con DIVIPOLA: así la tabla principal sigue siendo solo MIT y el share-alike no la alcanza. Nombres como `BOGOTA D.C` (sin punto final) se conservan tal cual; normalizarlos sería una decisión editorial sin fuente.

### 3. Contrato para consumidores

Exportado desde `@lector-cedula/parsers` (`packages/parsers/src/index.ts`):

```ts
export type TipoLugarDivipol = "municipio" | "consulado";
export type MotivoDivipolNoEncontrado = "formato-invalido" | "sin-dato" | "desconocido";
export type ResultadoDivipol =
  | {
      encontrado: true;
      codigo: string;              // 5 dígitos ASCII
      codigoDepartamento: string;  // 2 dígitos
      codigoMunicipio: string;     // 3 dígitos
      departamento: string;
      municipio: string;
      tipo: TipoLugarDivipol;
      warnings: string[];          // IDs de hipótesis: D02 (15001), D03 (consulados)
    }
  | {
      encontrado: false;
      codigo: string | null;       // null solo con "formato-invalido"
      motivo: MotivoDivipolNoEncontrado;
      warnings: string[];          // D01 (departamento conocido) o D04 (00000)
    };
export function buscarDivipol(codigo: unknown): ResultadoDivipol;
export const DIVIPOL_METADATOS: {
  readonly fuente: string; readonly commit: string; readonly ruta: string;
  readonly licencia: "MIT"; readonly sha256: string; readonly filas: number;
};
```

Exportado desde `@lector-cedula/parsers/divipola`:

```ts
export type MetodoEquivalencia = "nombre-exacto" | "nombre-sin-parentesis" | "manual";
export type ResultadoEquivalencia =
  | { equivalente: true; divipol: string; divipola: string; metodo: MetodoEquivalencia; warnings: string[] }
  | { equivalente: false; divipol: string | null;
      motivo: "formato-invalido" | "sin-dato" | "desconocido" | "consulado" | "sin-equivalente";
      warnings: string[] };
export function divipolADivipola(codigo: unknown): ResultadoEquivalencia;
export const DIVIPOLA_METADATOS: {
  readonly fuente: string; readonly url: string; readonly licencia: "CC-BY-SA-4.0";
  readonly sha256: string; readonly cambios: string;
};
```

Uso esperado por los consumidores:
- PDF417: `buscarDivipol(depto2 + municipio3)` con las subcadenas exactas del bloque demográfico; concatena sus propios `warnings` (H05, H06) con los de la búsqueda. No llama a la búsqueda si las subcadenas no son dígitos: recibiría `formato-invalido`, que también es aceptable.
- MRZ: `buscarDivipol(linea1.slice(15, 20))` solo si su cambio decide aplicar M03, y añade `D05`.
- Validador "DIVIPOL existente": válido si `encontrado === true`; `sin-dato` es una advertencia, no un error (decisión de ese cambio).
- `warnings` es siempre un arreglo nuevo por llamada; el consumidor puede concatenarlo o mutarlo.

### 4. Hipótesis nuevas (principio VI)

Registradas en `docs/decisiones/hipotesis-formato.md`, sección "DIVIPOL": D01 (la tabla de 2011 no tiene municipios ni consulados posteriores), D02 (`15001` es un código histórico de Bogotá que puede aparecer en cédulas), D03 (la numeración de consulados cambió entre versiones: IRLANDA `88480` en Eitol y `88470` en DIVIPOL 2026; HUNGRIA `88450` y `88445`), D04 (`00000` significa lugar no registrado; aparece en el bloque público `<valor real omitido por privacidad>`), D05 (el opcional de la línea 1 de la MRZ usaría DIVIPOL y no DIVIPOLA: el ejemplo sintético `05001` es CARTAGENA en DIVIPOL y MEDELLÍN en DIVIPOLA). La búsqueda emite D01 a D04; D05 la emite el parser MRZ.

### 5. Equivalencia por nombres normalizados en tres etapas

Algoritmo del generador (DV-16):
1. Departamento DANE por la tabla literal de 33 pares de DV-16 (escrita a mano y revisada; no se deduce por nombre, porque "VALLE" contiene "CAUCA" en DANE y 88 significa cosas distintas).
2. Etapa 1: `N(nombre)` igual a `N(nom_mpio)` dentro del departamento asignado, con un único candidato.
3. Etapa 2: `N2(nombre)` igual a `N2(nom_mpio)`, con `N2` = `N` del texto anterior al primer `(` y sin espacios.
4. Etapa 3: `tools/divipol/equivalencias-manuales.json`, una entrada por código con `divipol`, `divipola` (o `null`) y `justificacion`. Contenido esperado (33 entradas, a revisar por un humano en el PR):

| DIVIPOL | Nombre en Eitol | DIVIPOLA | Nombre DANE |
|---|---|---|---|
| 01031 | ANTIOQUIA | 05042 | SANTA FÉ DE ANTIOQUIA |
| 01058 | BOLIVAR | 05101 | CIUDAD BOLÍVAR |
| 01082 | CARMEN DE VIBORAL | 05148 | EL CARMEN DE VIBORAL |
| 01168 | PUERTO NARE-LA MAGDALENA | 05585 | PUERTO NARE |
| 01223 | SAN ANDRES | 05647 | SAN ANDRÉS DE CUERQUÍA |
| 01235 | SAN PEDRO | 05664 | SAN PEDRO DE LOS MILAGROS |
| 01244 | SAN VICENTE | 05674 | SAN VICENTE FERRER |
| 01256 | SANTUARIO | 05697 | EL SANTUARIO |
| 01300 | YONDO-CASABE | 05893 | YONDÓ |
| 05001 | CARTAGENA | 13001 | CARTAGENA DE INDIAS |
| 05043 | MOMPOS | 13468 | SANTA CRUZ DE MOMPOX |
| 07112 | GUICAN | 15332 | GÜICÁN DE LA SIERRA |
| 07139 | VILLA DE LEIVA | 15407 | VILLA DE LEYVA |
| 11043 | LOPEZ (MICAY) | 19418 | LÓPEZ DE MICAY |
| 11061 | PIENDAMO | 19548 | PIENDAMÓ - TUNÍA |
| 13034 | PURISIMA | 23586 | PURÍSIMA DE LA CONCEPCIÓN |
| 15001 | BOGOTA, D.C. | 11001 | BOGOTÁ, D.C. |
| 15304 | UBATE | 25843 | VILLA DE SAN DIEGO DE UBATÉ |
| 17016 | EL CARMEN | 27245 | EL CARMEN DE ATRATO |
| 23043 | EL TABLON | 52258 | EL TABLÓN DE GÓMEZ |
| 23139 | TUMACO | 52835 | SAN ANDRÉS DE TUMACO |
| 25001 | CUCUTA | 54001 | SAN JOSÉ DE CÚCUTA |
| 27071 | EL CARMEN | 68235 | EL CARMEN DE CHUCURÍ |
| 28260 | SINCE | 70742 | SAN LUIS DE SINCÉ |
| 28300 | TOLU | 70820 | SANTIAGO DE TOLÚ |
| 28320 | TOLUVIEJO | 70823 | SAN JOSÉ DE TOLUVIEJO |
| 29076 | MARIQUITA | 73443 | SAN SEBASTIÁN DE MARIQUITA |
| 31001 | CALI | 76001 | SANTIAGO DE CALI |
| 31022 | BUGA | 76111 | GUADALAJARA DE BUGA |
| 50050 | MAPIRIPANA | null | (área no municipalizada sin código en la DIVIPOLA vigente) |
| 52060 | SAN MARTIN DE LOS LLANOS | 50689 | SAN MARTÍN |
| 68010 | MORICHAL (PAPUNAGUA) | 97777 | PAPUNAHUA |
| 68013 | BUENOS AIRES (PACOA) | 97511 | PACOA |

Las etapas son excluyentes: una entrada manual para un código que ya empareja aborta (DV-16), para que la tabla manual no oculte cambios de las fuentes. Se descartó la coincidencia por subcadena (`contains`): en el prototipo asignaba `28300 TOLU` a dos candidatos y es frágil ante nombres nuevos.

### 6. Licencias e implicaciones del CC BY-SA 4.0

- **MIT (Eitol)**: la tabla generada es una "parte sustancial" de `localities.py`, así que el aviso de copyright y de permiso MIT MUST acompañarla. Va en `packages/parsers/THIRD_PARTY_NOTICES.md` (incluido en `files` del paquete) y la cabecera del archivo generado lo referencia.
- **CC BY-SA 4.0 (DANE)**: se trata la equivalencia como Material Adaptado de DIVIPOLA. Es la lectura conservadora: los códigos son hechos y en Colombia la base de datos se protege por la originalidad de su selección o disposición (Decisión Andina 351), pero no hay certeza jurídica. Implicaciones:
  1. Atribución (sección 3(a)): nombrar al DANE, el título del dataset, el URI, la licencia e indicar los cambios. Se cumple con `DIVIPOLA_METADATOS` y con `THIRD_PARTY_NOTICES.md`.
  2. Compartir igual (sección 3(b)): quien redistribuya la equivalencia, modificada o no, MUST hacerlo bajo CC BY-SA 4.0 (o una licencia compatible), sin términos adicionales ni medidas tecnológicas que restrinjan esos datos. El minificado de un bundle no es una medida tecnológica efectiva, pero un cliente que redistribuya la app debe conservar el aviso.
  3. Alcance: el share-alike aplica a los datos de la equivalencia, no al código MIT que los consulta ni a la tabla DIVIPOL (que no toma nada del DANE, decisión 2). Por eso la equivalencia va en un punto de entrada separado (`./divipola`) y el principal nunca la importa (DV-17): quien solo usa `buscarDivipol` no recibe material CC BY-SA en su bundle.
  4. Minimización: solo se distribuyen los pares de códigos y el método; no se copian nombres, coordenadas ni tipos del DANE.
  5. El campo `license` del paquete pasa a `MIT AND CC-BY-SA-4.0` porque el tarball incluye ambos. `tools/licencia-check.mjs` ya admite esa expresión. Antes de publicar en npm, un humano decide si la equivalencia se separa en otro paquete (pregunta abierta 2).
  6. Un código DANE individual en la salida de una validación no es una parte sustancial de la base: no arrastra obligaciones al resultado del cliente.
- `DIVIPOL.TXT`: se registra como fuente de licencia dudosa. El modo contraste lo lee desde una ruta local fuera del repositorio y no copia su contenido a ningún archivo.

### 7. Instantáneas versionadas y manifiesto de fuentes

- `tools/divipol/fuentes.json`: por fuente, `id`, `url` (fijada a commit o recurso), `sha256`, `licencia`, `atribucion`, `archivo`.
  - `eitol-localities`: `https://raw.githubusercontent.com/Eitol/colombian-cedula-reader/d72a342deb7255ca49cafe16bb3f8c0b6e54869a/src/barcode/localities.py`, SHA-256 `56f8f44122bca69d492d6353369d64febb836b0d31d91d5e1cd84de8a0f832a1`, MIT.
  - `dane-divipola`: `https://www.datos.gov.co/api/views/gdxc-w37w/rows.csv?accessType=DOWNLOAD`, SHA-256 `159b4b84595a11be5bf623fdf25c6fd5c9ac8c3ed898cf7928b2b3f321b9b492` (observado el 2026-10-06), CC BY-SA 4.0.
- `tools/divipol/fuentes/` guarda los bytes exactos, con `tools/divipol/fuentes/** -text` en `.gitattributes` y su propio `LICENSES.md` (aviso MIT y atribución CC BY-SA). Se versionan: la generación y la verificación corren sin red en CI. Solo `--descargar` usa red.
- La URL del DANE no está fijada por versión: si el DANE actualiza el dataset, `--descargar` falla por checksum (DV-12). Actualizar es un cambio deliberado: nuevo SHA-256 en el manifiesto, regeneración, revisión del diff de la equivalencia y de los conteos de DV-16 (que cambiarían por un cambio OpenSpec).

### 8. Estructura del generador

- `tools/divipol/divipol-lib.mjs`: funciones puras y exportadas (`parsearLocalities`, `transformarNombre`, `normalizar`, `normalizarSinParentesis`, `parsearDivipola`, `emparejar`, `serializarTabla`, `serializarEquivalencias`, `contrastar`, `sha256`). Sin E/S: reciben `Buffer` o texto y devuelven datos o lanzan `ErrorDivipol` con mensaje y código DIVIPOL.
- `tools/divipol/generar-divipol.mjs`: CLI delgada con E/S. Modos: por defecto genera; `--descargar`; `--verificar`; `--contraste <ruta>`. Opciones para pruebas: `--manifiesto <ruta>`, `--fuentes <dir>`, `--salida <dir>`. Acepta URLs `file:` en el manifiesto para las pruebas de integración (DV-12) sin red. Escribe primero a archivos temporales y renombra solo si toda la generación tuvo éxito (DV-12, DV-14, DV-16: "no escribe archivos").
- Scripts npm: `divipol:generar` y `divipol:verificar`.
- Salidas: `packages/parsers/src/divipol/tabla.generated.ts` y `packages/parsers/src/divipola/equivalencias.generated.ts`. Cabecera: "Generado por tools/divipol/generar-divipol.mjs; no editar", fuente, commit, SHA-256 y licencia. Representación compacta: departamentos como objeto `codigo -> nombre` y filas como `[codigo5, municipio]` en orden de código; serialización con `JSON.stringify` por fila, LF y `\n` final, para que la salida sea estable entre plataformas.
- La búsqueda (`packages/parsers/src/divipol/buscar.ts`) construye un `Map` al cargar el módulo y devuelve objetos y arreglos nuevos en cada llamada (DV-08). La equivalencia (`packages/parsers/src/divipola/index.ts`) importa la búsqueda para los motivos comunes; el principal nunca importa `divipola/`.

### 9. Pruebas fuera de la mutación

`stryker.config.mjs` añade `tools/divipol/divipol-lib.mjs` a `mutate` y excluye `packages/parsers/src/**/*.generated.ts`. `vitest.stryker.config.ts` excluye `tools/test/divipol-cli.test.mjs` (lanza procesos), siguiendo el patrón de `eval-campo.test.mjs`.

## Pruebas

Según el principio II y la matriz de `.claude/skills/estrategia-pruebas/SKILL.md`, fila "Parsers" (unitaria con literales de la spec, propiedad, fuzz, mutación) y fila "Repositorio" (licencias, privacidad). Comandos: `V` = `npx vitest run packages/parsers`; `VC` = `npx vitest run packages/parsers --coverage`; `G` = `npx vitest run tools/test/divipol-lib.test.mjs`; `I` = `npx vitest run tools/test/divipol-cli.test.mjs`; `M` = `npm run test:mutacion`; `R` = `npm run divipol:verificar`; `L` = `npm run check:licencias`; `P` = `npm run check:privacidad`; `E` = `npm run eval:quick`; `C` = `npm run check`. Las pruebas que lanzan procesos declaran `{ timeout: 60_000 }` en su `describe` (errores pasados de `CLAUDE.md`). Toda propiedad usa `numRuns >= 1000`; los recorridos exhaustivos no tienen filtro y por eso no pueden ser vacíos.

| Requisito | Tipo de prueba | Herramienta | Comando | Umbral |
|---|---|---|---|---|
| DV-01 | Unitaria: 11 entradas literales de sus escenarios | Vitest | V | 11 de 11 `toStrictEqual` |
| DV-01 | Propiedad: cadenas de 5 caracteres con al menos uno fuera de `0`-`9` (generador válido por construcción) | fast-check | V | numRuns >= 1000; 100 % `formato-invalido` |
| DV-02 | Unitaria: `01001`, `31001`, `31019`, `16001`, `23001` | Vitest | V | 5 de 5 `toStrictEqual`; bytes de `NARIÑO` comprobados (U+00D1) |
| DV-03 | Unitaria: `05001`, `11001`, `76001` | Vitest | V | 3 de 3 `toStrictEqual` |
| DV-04 | Unitaria: `15001` y `16001` | Vitest | V | 2 de 2 `toStrictEqual` |
| DV-05 | Unitaria: `88815`, `88355`, `88470` | Vitest | V | 3 de 3 |
| DV-05 | Propiedad exhaustiva: toda fila con departamento 88 | Vitest | V | 67 de 67 con `tipo: "consulado"` y `warnings: ["D03"]` |
| DV-06 | Unitaria: `17082`, `99001`, `02001`, `01000` | Vitest | V | 4 de 4 `toStrictEqual` |
| DV-07 | Unitaria: `00000`, `00001` | Vitest | V | 2 de 2 `toStrictEqual` |
| DV-08 | Fuzz: `fc.anything()`, `fc.string()`, `fc.string({ unit: "binary" })` | fast-check | V | numRuns >= 1000 cada una; 0 excepciones; resultado exacto de DV-01 para no cadenas de 5 dígitos |
| DV-08 | Propiedad: determinismo con `fc.oneof(códigos de la tabla, fc.stringMatching(/^[0-9]{5}$/), fc.anything())` | fast-check | V | numRuns >= 1000; 0 diferencias |
| DV-08 | Unitaria: resultado mutado y objetos con `toString` | Vitest | V | 3 de 3 |
| DV-09 | Propiedad exhaustiva: los 100.000 códigos | Vitest | V | exactamente 1190 encontrados, 1 `sin-dato`, 98809 `desconocido` |
| DV-09 | Propiedad exhaustiva: ida y vuelta por fila | Vitest | V | 1190 de 1190 |
| DV-10 | Integridad del archivo generado: filas, departamentos, conteos y nombres literales de la spec, único duplicado, caracteres | Vitest | V | igualdad exacta con las tablas literales de DV-10 (oráculo independiente del generador) |
| DV-11 | Integridad: SHA-256 de la instantánea con `node:crypto`, igual al literal de la spec, a `DIVIPOL_METADATOS` y a la cabecera | Vitest | V | 3 igualdades exactas |
| DV-12 | Integración: manifiesto con URL `file:` correcta y con `abc` | Vitest + `spawnSync` | I | código 0 y bytes idénticos; código 1, ambos SHA-256 en stderr, árbol temporal sin cambios |
| DV-13 | Integración: dos generaciones en directorios temporales; verificación con copia alterada | Vitest + `spawnSync` | I | bytes idénticos; código 1 con el nombre del archivo |
| DV-13 | Deriva del repositorio | CLI | R | código 0 |
| DV-14 | Unitaria de `divipol-lib.mjs`: `BRICE/O`, U+2010, fila malformada, código repetido | Vitest | G | 4 de 4; mensajes con línea o código |
| DV-14 | Propiedad: `transformarNombre` sobre cadenas de `A`-`Z`, espacio, `/` y U+2010 | fast-check | G | numRuns >= 1000; salida sin `/` ni U+2010; misma longitud tras recorte; idempotente |
| DV-15 | Unitaria: las 11 entradas de sus escenarios | Vitest | V | 11 de 11 `toStrictEqual` |
| DV-15 | Fuzz y determinismo de `divipolADivipola` | fast-check | V | numRuns >= 1000 cada una; 0 excepciones; 0 diferencias |
| DV-15 | Propiedad exhaustiva: toda fila municipal tiene equivalencia o `sin-equivalente`; todo consulado da `consulado` | Vitest | V | 1122 + 1 + 67 = 1190 |
| DV-16 | Unitaria de `normalizar` y `normalizarSinParentesis` con los literales de la spec | Vitest | G | 5 de 5 |
| DV-16 | Unitaria de `emparejar` con fuentes sintéticas: fila sin resolver, manual redundante, DANE repetido, DANE con 1121 filas | Vitest | G | 4 de 4 lanzan `ErrorDivipol` con el código esperado en el mensaje |
| DV-16 | Integridad de la equivalencia generada: conteos por método, tabla de departamentos, prefijos, `11001` doble, `27493` sin pareja | Vitest | V | igualdad exacta con los literales de DV-16 |
| DV-17 | Unitaria: grafo de importaciones desde `src/index.ts`; `DIVIPOLA_METADATOS`; `package.json` y avisos | Vitest | V | 0 módulos de `divipola/` alcanzados; 0 apariciones de `CC-BY-SA`; campos exactos |
| DV-17 | Licencias del repositorio | `licencia-check` | L | código 0 |
| DV-18 | Integración: contraste con TXT sintético de 3 líneas (Latin-1), ruta inexistente, `git status` antes y después | Vitest + `spawnSync` | I | informe JSON exacto; código 1 con la ruta; `git status --porcelain` idéntico |
| DV-01 a DV-17 | Mutación de `buscar.ts`, `divipola/index.ts` y `divipol-lib.mjs` | Stryker | M | >= 85 % en cada archivo (break 85); los `*.generated.ts` excluidos |
| DV-01 a DV-17 | Cobertura de ramas de `src/divipol/` y `src/divipola/` | Vitest v8 | VC | ramas >= 95 % |
| Todos | Privacidad: sin datos personales en tabla, fixtures ni avisos | `privacidad-check` | P | código 0 |
| Todos | Evals sin regresión (no se añaden fixtures de eval: DIVIPOL no es un tipo de documento) | `eval-campo` | E | sin regresión frente a `baseline.json` |

## Risks / Trade-offs

- [La tabla de 2011 no tiene municipios nuevos (`17082`) ni consulados nuevos] -> `desconocido` con `D01`, visible; el modo contraste cuantifica la brecha; la pregunta abierta 1 decide si se incorporan.
- [Un consulado 88 puede devolver el país equivocado si la numeración cambió (IRLANDA 88480 frente a 88470)] -> `D03` en todo resultado de consulado; el set de campo confirmará o refutará.
- [Error humano en la tabla manual de 33 entradas] -> justificación por entrada, revisión humana en el PR, y la integridad de DV-16 (prefijos, sin códigos DANE repetidos, conteos) atrapa errores estructurales.
- [El CSV del DANE cambia de bytes sin cambiar datos] -> la instantánea versionada evita depender de la red; solo `--descargar` falla y obliga a revisar.
- [La copia sin licencia de `DIVIPOL.TXT` desaparece] -> no se depende de ella para generar; el contraste acepta cualquier archivo local con el mismo formato.
- [Los nombres de Eitol (`BOGOTA D.C`, sin tildes) no son los oficiales actuales] -> se documenta; corregirlos sin una fuente con licencia sería inventar datos.
- [Tamaño del bundle] -> unos 40 KB sin comprimir para 1.190 filas en representación compacta; la equivalencia queda fuera del principal.
- [Interpretación conservadora del CC BY-SA puede ser más restrictiva de lo necesario] -> el aislamiento cuesta poco; la decisión legal definitiva queda en la pregunta abierta 2.

## Migration Plan

Capacidad nueva, sin consumidores todavía. Orden: fuentes e instantáneas -> generador de la tabla -> búsqueda -> equivalencia -> contraste -> integración. Los cambios `parser-pdf417-amarilla` y `parser-mrz-cedula-digital` pueden escribir sus pruebas contra el contrato de la decisión 3 antes de que este cambio termine. Reversión: quitar las exportaciones de `index.ts` y el `exports["./divipola"]`; ningún dato persiste fuera del repositorio.

## Open Questions

1. ¿Se incorporan los 11 códigos que solo están en `DIVIPOL.TXT` (`17082` NUEVO BELEN DE BAJIRA y 10 consulados)? Requiere obtener el archivo de una publicación oficial de la Registraduría con términos de uso, o su autorización. Si se aprueba, será un cambio OpenSpec que modifique DV-09, DV-10 y DV-16 (conteos). No cambia este cambio.
2. ¿La equivalencia DIVIPOLA se publica en npm dentro de `@lector-cedula/parsers` (subruta, licencia `MIT AND CC-BY-SA-4.0`) o como paquete aparte? Se decide antes de la Fase 7; mover el módulo no cambia los requisitos.
3. ¿Se acepta la lectura conservadora del CC BY-SA (equivalencia como Material Adaptado)? Si un abogado concluye que los pares de códigos son hechos no protegidos, se puede simplificar el aislamiento en un cambio posterior.

## Pendiente antes de archivar (orquestador, 2026-10-06)

- DV-16, escenario "Tabla literal de departamentos": contradice DV-15 y la decisión 5 para `15001 -> 11001` (Cundinamarca es DANE 25, Bogotá 11). La implementación lo trata como una única excepción documentada y probada. Corregir el escenario para declarar esa excepción.
- La tabla manual de 33 equivalencias (`tools/divipol/equivalencias-manuales.json`) requiere revisión humana.
