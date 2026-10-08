# Licencias de las instantáneas de fuentes DIVIPOL

Este directorio guarda los bytes exactos de las fuentes declaradas en `tools/divipol/fuentes.json`, verificados por SHA-256 (cambio OpenSpec `divipol-registraduria`, design.md decisiones 6 y 7). No se editan a mano: se actualizan con `node tools/divipol/generar-divipol.mjs --descargar` y un cambio deliberado del manifiesto.

## localities.py (MIT)

- Fuente: Eitol/colombian-cedula-reader, `src/barcode/localities.py`, commit `d72a342deb7255ca49cafe16bb3f8c0b6e54869a`.
- URL: https://raw.githubusercontent.com/Eitol/colombian-cedula-reader/d72a342deb7255ca49cafe16bb3f8c0b6e54869a/src/barcode/localities.py
- SHA-256: `56f8f44122bca69d492d6353369d64febb836b0d31d91d5e1cd84de8a0f832a1`
- Licencia del repositorio (`LICENSE.md`, sin cambios desde 2020-05-30), reproducida literalmente:

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

## divipola-dane.csv (CC BY-SA 4.0)

- Título: DIVIPOLA- Códigos municipios (datos.gov.co, conjunto `gdxc-w37w`).
- Autor: Departamento Administrativo Nacional de Estadística (DANE).
- URL: https://www.datos.gov.co/api/views/gdxc-w37w/rows.csv?accessType=DOWNLOAD
- SHA-256: `159b4b84595a11be5bf623fdf25c6fd5c9ac8c3ed898cf7928b2b3f321b9b492` (descargado el 2026-10-06; filas actualizadas por el DANE el 2025-01-24).
- Licencia: Creative Commons Atribución-CompartirIgual 4.0 Internacional (CC BY-SA 4.0), https://creativecommons.org/licenses/by-sa/4.0/
- Cambios: ninguno en esta instantánea (copia exacta de los bytes publicados). El material adaptado que se deriva de ella (la equivalencia DIVIPOL a DIVIPOLA) solo conserva pares de códigos y se distribuye bajo CC BY-SA 4.0 en un punto de entrada separado (design.md, decisión 6).
- Sin garantías: el DANE ofrece el material tal cual, según la sección 5 de la licencia.

## consulados-2018.csv (CC BY-SA 4.0)

- Título: Divipole Exterior Presidente 2018 (datos.gov.co, conjunto `vh8b-jfhg`).
- Autor: Registraduría Nacional del Estado Civil.
- URL exacta del extracto: https://www.datos.gov.co/resource/vh8b-jfhg.csv?$select=dd,mm,municipio&$group=dd,mm,municipio&$order=mm&$limit=500
- SHA-256: `135dee55ab72b439500ebad609c825404f1d4fa6aefbf127da684fa652704724` (descargado el 2026-10-07; filas actualizadas por la fuente el 2021-03-15).
- Licencia: Creative Commons Atribución-CompartirIgual 4.0 Internacional (CC BY-SA 4.0), https://creativecommons.org/licenses/by-sa/4.0/
- Cambios en la instantánea: extracto agrupado de las columnas `dd`, `mm` y `municipio` (sin puestos ni conteos). En el material adaptado (`packages/parsers/src/divipol-2018/consulados.generated.ts`, cambio OpenSpec `divipol-consulados-2018`): erratas corregidas `88135` ARZERBAIYAN -> AZERBAIYAN, `88688` REPUBLICA DE SINGAPUR -> SINGAPUR, `88690` REPUBLICA SOCIALISTA DEVIETNAM -> VIETNAM; códigos alternos añadidos `88195` (Belice, alterno de `88415`) y `88480` (Irlanda, alterno de `88470`).
- Sin garantías: la Registraduría ofrece el material tal cual, según la sección 5 de la licencia.
