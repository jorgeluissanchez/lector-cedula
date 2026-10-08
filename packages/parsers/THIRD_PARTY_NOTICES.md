# Avisos de terceros de @lector-cedula/parsers

El código de este paquete es MIT. Tres conjuntos de datos generados derivan de fuentes de terceros (cambio OpenSpec `divipol-registraduria`, design.md decisión 6). Por eso el campo `license` del paquete es `MIT AND CC-BY-SA-4.0`.

| Datos | Archivo generado | Punto de entrada | Fuente | Licencia |
|---|---|---|---|---|
| Tabla DIVIPOL (códigos de lugar de la Registraduría) | `src/divipol/tabla.generated.ts` | `@lector-cedula/parsers` | Eitol/colombian-cedula-reader | MIT |
| Equivalencia DIVIPOL -> DIVIPOLA | `src/divipola/equivalencias.generated.ts` | `@lector-cedula/parsers/divipola` | DANE, DIVIPOLA | CC BY-SA 4.0 |
| Consulados DIVIPOL 2018 | `src/divipol-2018/consulados.generated.ts` | `@lector-cedula/parsers/divipol-2018` | Registraduría, Divipole Exterior 2018 | CC BY-SA 4.0 |

El punto de entrada principal no importa la equivalencia ni los consulados 2018: quien solo usa `buscarDivipol` no recibe datos CC BY-SA 4.0.

## Tabla DIVIPOL: Eitol/colombian-cedula-reader (MIT)

- Archivo de origen: `src/barcode/localities.py`, commit `d72a342deb7255ca49cafe16bb3f8c0b6e54869a`.
- URL: https://raw.githubusercontent.com/Eitol/colombian-cedula-reader/d72a342deb7255ca49cafe16bb3f8c0b6e54869a/src/barcode/localities.py
- SHA-256 de los bytes usados: `56f8f44122bca69d492d6353369d64febb836b0d31d91d5e1cd84de8a0f832a1`
- Transformaciones: `/` por `Ñ` (corrupción de la fuente), guion tipográfico U+2010 por `-` y recorte de espacios en los extremos. Nada más.
- Aviso de copyright y de permiso, reproducido literalmente:

```
MIT License

Copyright (c) Hector Oliveros (hector.oliveros.leon@gmail.com)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Equivalencia DIVIPOL -> DIVIPOLA: DANE (CC BY-SA 4.0)

Los datos de `@lector-cedula/parsers/divipola` son material adaptado de:

- Título: DIVIPOLA Códigos municipios (datos.gov.co, conjunto `gdxc-w37w`).
- Autor: Departamento Administrativo Nacional de Estadística (DANE).
- URL: https://www.datos.gov.co/api/views/gdxc-w37w/rows.csv?accessType=DOWNLOAD
- SHA-256 de los bytes usados: `159b4b84595a11be5bf623fdf25c6fd5c9ac8c3ed898cf7928b2b3f321b9b492` (descargado el 2026-10-06).
- Licencia: Creative Commons Atribución-CompartirIgual 4.0 Internacional (CC BY-SA 4.0), https://creativecommons.org/licenses/by-sa/4.0/ (código legal en español: https://creativecommons.org/licenses/by-sa/4.0/legalcode.es).
- Cambios: Solo se conservan los códigos emparejados (pares DIVIPOL-DIVIPOLA) y el método de emparejamiento; no se copian nombres, coordenadas ni tipos del DANE.
- Método: emparejamiento por nombre normalizado dentro del departamento DANE asignado por una tabla literal, por nombre sin el texto entre paréntesis y por una tabla manual revisada (`tools/divipol/equivalencias-manuales.json`).
- Sin garantías: el DANE ofrece el material tal cual, según la sección 5 de la licencia.
- Sin aval: la mención del DANE como autor no implica aval del DANE a este proyecto ni a este uso del material.

Compartir igual: quien redistribuya estos datos de equivalencia, modificados o no, debe hacerlo bajo CC BY-SA 4.0 (o una licencia compatible), conservar esta atribución y no añadir términos ni medidas tecnológicas que restrinjan esos datos. El código MIT que los consulta y la tabla DIVIPOL no quedan sujetos a esa licencia.

## Consulados DIVIPOL 2018: Registraduría Nacional del Estado Civil (CC BY-SA 4.0)

- Obra: Divipole Exterior Presidente 2018 (datos.gov.co, conjunto `vh8b-jfhg`), Registraduría Nacional del Estado Civil.
- URL del extracto: https://www.datos.gov.co/resource/vh8b-jfhg.csv?$select=dd,mm,municipio&$group=dd,mm,municipio&$order=mm&$limit=500
- SHA-256 de los bytes usados: `135dee55ab72b439500ebad609c825404f1d4fa6aefbf127da684fa652704724` (descargado el 2026-10-07; filas actualizadas por la fuente el 2021-03-15).
- Licencia: Creative Commons Atribución-CompartirIgual 4.0 Internacional (CC BY-SA 4.0), https://creativecommons.org/licenses/by-sa/4.0/ (código legal en español: https://creativecommons.org/licenses/by-sa/4.0/legalcode.es). Quien redistribuya estos datos debe hacerlo bajo CC BY-SA 4.0.
- Cambios: el material fue modificado. Solo se conservan códigos y nombres de consulado. Erratas corregidas, declaradas como modificaciones del material: `88135` ARZERBAIYAN -> AZERBAIYAN, `88688` REPUBLICA DE SINGAPUR -> SINGAPUR, `88690` REPUBLICA SOCIALISTA DEVIETNAM -> VIETNAM; códigos alternos añadidos `88195` (Belice) y `88480` (Irlanda).
- Sin garantías: la Registraduría ofrece el material tal cual, según la sección 5 de la licencia.
- Sin aval: la mención de la Registraduría Nacional del Estado Civil como autora no implica aval de la Registraduría a este proyecto ni a este uso del material.
