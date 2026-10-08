# Fuentes oficiales de DIVIPOL (Registraduría) y vigencia de la DIVIPOLA (DANE)

**Fecha:** 2026-10-07. **Estado:** investigación; no cambia código ni datos. Complementa `2026-10-06-fuente-divipol.md`.

[V] verificado en fuente primaria en esta sesión. [E] estimado o inferido.

## Pregunta 1. ¿Hay una fuente oficial de la Registraduría con los códigos DIVIPOL (2+3 dígitos)?

### Respuesta corta

Sí, pero ninguna es completa, vigente y con licencia clara a la vez:

1. **PDF oficial de la Registraduría "DIVIPOL octubre/2011"** (pre-Divipol del 2 de agosto de 2011, listado de puestos de votación con código `DD MMM ZZ PP`). Contiene 1.189 códigos de municipio y es prácticamente idéntico a Eitol. Sin licencia ni términos de uso explícitos. [V]
2. **datos.gov.co, conjuntos de la Registraduría con CC BY-SA 4.0**: `vh8b-jfhg` (Divipole Exterior Presidente 2018) y `2r2t-ej3x` (Exterior Congreso 2018) traen columnas `dd` y `mm`, pero solo del exterior (departamento 88, consulados). `mv2e-prx5` (Divipole 2023) no trae códigos (ya documentado). [V]
3. No se encontró en datos.gov.co ni en registraduria.gov.co una Divipole nacional reciente con códigos `dd`/`mm` bajo licencia abierta. [V para el catálogo de datos.gov.co (API Socrata, búsquedas "divipole" y "registraduria puestos de votacion"); E para el sitio de la Registraduría, protegido por un desafío de Cloudflare que no se sorteó]

### Evidencia

| Fuente | URL | Licencia | Contenido |
|---|---|---|---|
| Registraduría, `pre_divipol_02_agosto_2011.pdf` (705 páginas, cabecera "DIVIPOL OCTUBRE/2011") | https://www.registraduria.gov.co/IMG/pdf/pre_divipol_02_agosto_2011.pdf (el sitio responde 403 con desafío Cloudflare); copia de Wayback del 2025-04-14: http://web.archive.org/web/20250414070950/https://registraduria.gov.co/IMG/pdf/pre_divipol_02_agosto_2011.pdf | Sin licencia ni términos publicados en el documento. Obra de entidad pública; uso para contraste, no redistribución [E] | Puestos de votación con código, departamento, municipio, puesto y conteos por sexo. No contiene datos personales. SHA-256 de la copia: `9bb72956b7970efa3ea31ada2137c0d803fd2c6070df9016f169899f60c57671` |
| datos.gov.co `vh8b-jfhg` Dipole Exterior Presidente 2018 (Registraduría) | https://www.datos.gov.co/d/vh8b-jfhg | CC BY-SA 4.0 (`/api/views/vh8b-jfhg.json`, `license`) | 69 pares `88`+`mm` de consulados |
| datos.gov.co `mv2e-prx5` Divipole 2023 | https://www.datos.gov.co/d/mv2e-prx5 | CC BY-SA 4.0 | Sin columnas de código |
| datos.gov.co `kicq-3gnz` (ESAP) con columnas `c_digo_divipol_*` | https://www.datos.gov.co/d/kicq-3gnz | No es la Registraduría; no se toma como fuente primaria | - |

### Contraste con la tabla actual (Eitol, `localities.py`, 1.190 códigos; `tabla.generated.ts` se genera de ella)

Método: `pdftotext -layout` sobre la copia del PDF y extracción de los códigos `DD MMM` al inicio de línea; comparación de conjuntos en Node. Script y PDF en el scratchpad, fuera del repositorio.

| Resultado | Valor |
|---|---|
| Códigos únicos en el PDF 2011 | 1.189 [V] |
| Códigos en común con Eitol | 1.189 [V] |
| Solo en Eitol | 1: `15001` (Bogotá en Cundinamarca, hipótesis D02) [V] |
| Solo en el PDF 2011 | 0 [V] |
| Nombres distintos (normalizados) | 0 reales. El extractor reportó `21060` con "SALAMINA", pero es un desplazamiento de columnas del PDF: las filas de `21060` muestran "SAN SEBASTIAN DE BUENAVISTA" y la fila `21060 00 00` "SALAMINA" en la misma página; queda **sin resolver** cuál es el nombre de `21060` y `21067` [E]. Eitol: `21060` SABANAS DE SAN ANGEL, `21067` SALAMINA |
| Guainía | `50050` MAPIRIPANA y `50070` BARRANCO MINAS presentes en 2011 [V] |
| `17082` (Nuevo Belén de Bajirá) | Ausente en 2011, coherente con su creación en 2023 [V] |

Conclusión [E]: la tabla de Eitol parece derivar de la Divipol de 2011 más `15001`. Esto da trazabilidad oficial a 1.189 de sus 1.190 códigos, pero confirma que está congelada en 2011 (sin `17082`, consulados viejos).

Consulados (exterior 2018, CC BY-SA, 69 códigos) frente a los 67 `88xxx` de Eitol [V]:

- Solo en 2018: `88115` GHANA, `88130` ARGELIA, `88135` AZERBAIYÁN, `88350` EMIRATOS ÁRABES UNIDOS, `88415` BELICE, `88470` IRLANDA, `88540` LUXEMBURGO, `88625` NUEVA ZELANDIA, `88688` SINGAPUR, `88690` VIETNAM, `88765` TAILANDIA.
- Solo en Eitol (no tenían puesto en 2018; no implica baja): `88185` BARBADOS, `88195` BELICE, `88300` CHECOSLOVAQUIA, `88425` GUYANA, `88430` HAITÍ, `88450` HUNGRÍA, `88475` IRÁN, `88480` IRLANDA, `88695` RUMANIA.
- **Conflicto de código:** Belice (`88195` Eitol frente a `88415` en 2018) e Irlanda (`88480` frente a `88470`). Una cédula expedida en el exterior puede traer cualquiera de los dos según la época [E].
- Renombres: `88140` ANTILLAS HOLANDESAS a CURAZAO, `88160` a ARUBA, `88370` a REPÚBLICA DE FILIPINAS, `88435` HOLANDA a PAÍSES BAJOS.

## Pregunta 2. ¿Hay una DIVIPOLA del DANE más actual que `divipola-dane.csv` (1.122 filas)?

### Respuesta corta

No. El conjunto oficial `gdxc-w37w` de datos.gov.co tiene hoy 1.122 filas, `rowsUpdatedAt` 2025-01-24, y coincide fila por fila (código, nombre y tipo) con el CSV del repositorio: 0 altas, 0 bajas, 0 cambios [V]. Fuentes secundarias de 2026 citan el geoportal del DANE con 1.103 municipios y 18 áreas no municipalizadas, igual que el CSV [E: no se pudo leer el geoportal directamente].

### Evidencia

- https://www.datos.gov.co/api/views/gdxc-w37w.json: licencia CC BY-SA 4.0, atribución DANE, `rowsUpdatedAt` 2025-01-24T20:44:32Z [V].
- https://www.datos.gov.co/resource/gdxc-w37w.json?$limit=5000: 1.122 registros; comparados con el CSV local sin diferencias [V].
- Estado vigente en Guainía, Vaupés y Amazonas [V]: `94343` BARRANCOMINAS es Municipio; `94883` a `94888` (San Felipe, Puerto Colombia, La Guadalupe, Cacahual, Pana Pana, Morichal) siguen como área no municipalizada; `97511` PACOA, `97777` PAPUNAHUA, `97889` YAVARATÉ siguen como ANM; las 9 ANM de Amazonas (`91263` a `91798`) siguen como ANM. No hay conversiones nuevas después de Barrancominas (2019).
- `27493` NUEVO BELÉN DE BAJIRÁ ya está en el CSV [V] (Decreto 0284 de 2023 según fuente secundaria [E]).

### Efecto en las equivalencias

Ninguno. Las 33 entradas de `tools/divipol/equivalencias-manuales.json` siguen apuntando a códigos vigentes. `50050` MAPIRIPANA a `94343` BARRANCOMINAS sigue siendo coherente con la DIVIPOLA vigente (Mapiripana no tiene código propio de municipio ni de ANM). `68010` a `97777` y `68013` a `97511` apuntan a ANM vigentes.

## Impacto en la spec

- Ningún cambio obligatorio. Posibles escenarios nuevos en `openspec/changes/divipol-registraduria/specs/divipol/spec.md` si se decide ampliar: consulados `88` de 2018 (CC BY-SA, compatible con la parte ya CC BY-SA) y el conflicto Belice/Irlanda.
- El PDF 2011 refuerza que `15001` no figura en la Divipol oficial de 2011 (hipótesis D02 sigue como hipótesis; no se cambia `hipotesis-formato.md`).

## Decisión recomendada

1. No actualizar `divipola-dane.csv`: ya es la versión vigente. Registrar en `LICENSES.md` la fecha de corte 2025-01-24 y añadir un control (manual o CI semanal) que compare `rowsUpdatedAt` de `gdxc-w37w`.
2. Citar el PDF Divipol 2011 de la Registraduría como respaldo oficial de la tabla de Eitol (1.189/1.190 códigos), usándolo solo en contraste local, como `DIVIPOL.TXT`, por no tener términos de uso.
3. Valorar incorporar los 11 consulados de `vh8b-jfhg` (CC BY-SA 4.0, atribución a la Registraduría) en la parte CC BY-SA. Pasa por `revisor-licencias` y una spec delta. Decidir cómo se tratan los códigos duplicados de Belice e Irlanda (aceptar ambos).
4. `17082` sigue sin fuente oficial con licencia: pedir a la Registraduría la Divipole vigente con códigos y términos de uso, o mantenerlo como `desconocido`.
5. Resolver `21060`/`21067` con un lector de PDF por coordenadas o con una cédula sintética de prueba, no con el texto extraído.
