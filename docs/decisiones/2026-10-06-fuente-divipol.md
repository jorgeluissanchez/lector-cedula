# Fuente de la tabla DIVIPOL y de su equivalencia con DIVIPOLA

**Fecha:** 2026-10-06. **Estado:** propuesta (cambio OpenSpec `divipol-registraduria`), pendiente de ratificación humana.

## Contexto

El PDF417 de la cédula amarilla trae un código de lugar DIVIPOL (Registraduría), distinto de DIVIPOLA (DANE). Principio IV: solo licencias de la lista permitida; los componentes con licencia dudosa se registran aquí y no se despliegan hasta resolverse.

## Licencias verificadas

Verificación con `gh api repos/<repo>` (campo `license`), `gh api repos/<repo>/license` (texto del LICENSE) y los metadatos de datos.gov.co (`/api/views/<id>.json`, campo `license`).

| Fuente | Licencia | Veredicto |
|---|---|---|
| Eitol/colombian-cedula-reader, `src/barcode/localities.py` @ `d72a342deb7255ca49cafe16bb3f8c0b6e54869a` | MIT, `Copyright (c) Hector Oliveros` | Permitida. Fuente primaria. Exige conservar el aviso MIT junto a la tabla |
| Yeison07/cedula-colombiana-pdf417-decoder, `model/locations.go` | MIT, `Copyright (c) [2024] [Yeison]` | Permitida, pero idéntica a Eitol: no se usa |
| miltonrojasb/visualizador-electoral-2026, `data/raw/DIVIPOL.TXT` | Sin licencia (`license: null`; `/license` responde 404) | **Dudosa**. Solo contraste local; no se versiona ni se redistribuye |
| datos.gov.co `mv2e-prx5` (Divipole 2023, Registraduría) | CC BY-SA 4.0 | Permitida para datos, pero no trae códigos: no se usa |
| datos.gov.co `gdxc-w37w` (DIVIPOLA, DANE) | CC BY-SA 4.0 | Permitida para datos con share-alike. Solo para la equivalencia, aislada en `@lector-cedula/parsers/divipola` |

## Decisión

1. La tabla DIVIPOL se genera desde `localities.py` de Eitol, fijado por commit y SHA-256 (`56f8f44122bca69d492d6353369d64febb836b0d31d91d5e1cd84de8a0f832a1`). Ningún valor de la tabla se toma del DANE.
2. La equivalencia DIVIPOL -> DIVIPOLA se trata como Material Adaptado bajo CC BY-SA 4.0: atribución al DANE, indicación de cambios, redistribución bajo la misma licencia, solo pares de códigos, en un punto de entrada separado que el principal no importa. El paquete declara `MIT AND CC-BY-SA-4.0`.
3. `DIVIPOL.TXT` queda registrado como componente de licencia dudosa. El generador solo lo lee en modo contraste desde una ruta local y no copia su contenido.

Detalle técnico, alternativas e implicaciones del share-alike: `openspec/changes/divipol-registraduria/design.md`, decisiones 1, 6 y 7.

## Pendiente de decisión humana

- Obtener `DIVIPOL.TXT` de una publicación oficial de la Registraduría con términos de uso, o su autorización, para incorporar `17082` y los consulados nuevos.
- Separar o no la equivalencia en otro paquete npm antes de publicar.
- Revisión legal de la lectura conservadora del CC BY-SA sobre pares de códigos.
