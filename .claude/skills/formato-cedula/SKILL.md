---
name: formato-cedula
description: Formato de la cédula colombiana (PDF417 de la amarilla, MRZ TD1 de la digital, DIVIPOL, variantes y errores conocidos). Cárgala antes de especificar, implementar o verificar cualquier parser o extracción de campos.
---

# Formato de la cédula colombiana

Fuente completa: `docs/investigacion/01-formato-cedula-y-repos.md`. Léela entera antes de tocar un parser.
Estado de cada hipótesis: `docs/decisiones/hipotesis-formato.md`.

## Reglas que no se negocian

1. **Hecho vs. hipótesis.** Nada del formato es oficial. Antes de depender de un offset o marcador, revisa su estado en `hipotesis-formato.md`. Si está pendiente, el parser debe emitir un `warning` con el ID de la hipótesis (por ejemplo `H03`).
2. **PDF417 en binario.** Se procesa como bytes ISO-8859-1 (`rawBytes`), nunca como texto del lector. La Ñ es 0xD1.
3. **NUIP.** Son los 10 dígitos inmediatamente anteriores a la primera letra del primer apellido, sin ceros a la izquierda.
4. **Bloque demográfico.** `0` + sexo + `YYYYMMDD` + departamento DIVIPOL (2) + municipio DIVIPOL (3) + 1 dígito desconocido + RH. Departamento 2 dígitos, municipio 3 dígitos (las etiquetas de Eitol están invertidas).
5. **DIVIPOL no es DIVIPOLA.** Antioquia 01 (no 05), Valle 31 (no 76), Bogotá 16 (no 11), consulados 88.
6. **Biometría.** Todo byte posterior al RH es biométrico: se descarta sin decodificar. AFIS y tarjeta decadactilar también se descartan.
7. **MRZ TD1.** NUIP en el opcional de la línea 2 [18-28]; 4 dígitos de control; correcciones OCR-B (O->0, Q->0, I->1, Z->2, S->5, G->6, B->8) solo en zonas numéricas. La MRZ no trae RH.
8. **QR de la digital.** Cifrado. No se intenta decodificar.
9. **Expedición y estatura** no están en el PDF417: solo por OCR del reverso.

## Errores conocidos de repos antiguos (cada uno merece una prueba)

| Error | Prueba que lo evita |
|---|---|
| RH `AB+` cortado a `B+` por `substring(-2)` | Fixture con RH `AB+` y `AB-` |
| Sexo por `contains("M")` | Apellido con M y sexo F |
| `-` del RH eliminado por el normalizador | Fixture con `O-` |
| Ñ y acentos que rompen el parser | Apellido `PEÑA`, `NUÑEZ` |
| Apellidos en orden invertido | Primer y segundo apellido distintos y verificados por posición |
| Fecha de nacimiento etiquetada como expedición | Campo `fechaNacimiento` explícito |
| Segundo nombre ausente desplaza campos | Fixture sin segundo nombre |
| Apellido compuesto ("DE LA OSSA") partido | Fixture con espacio simple dentro del apellido |
| Trama de Windows con NUL truncados | Misma persona, trama completa y trama truncada, mismo resultado |

## Especímenes públicos

- Ejemplo MRZ sintético de Eitol (en `docs/investigacion/01-formato-cedula-y-repos.md`).
- `back-ccd.png` de la Registraduría tiene el dígito compuesto inválido (calcula 9, impreso 8): sirve como caso negativo, no positivo.
