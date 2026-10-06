# Backlog de la capacidad formato-nuip

Huecos de spec encontrados por el verificador al cerrar `nuip-endurecer-entradas` (2026-10-06, veredicto CONFIRMADO, 85/85 escenarios). Ninguno es un defecto del código frente a la spec vigente. Cada uno necesita una decisión antes de abrir un cambio OpenSpec.

| # | Hueco | Riesgo | Propuesta del orquestador |
|---|---|---|---|
| 1 | `tipoDocumento` se recorta con `trim()` (todo White_Space Unicode y BOM), mientras la entrada usa un conjunto cerrado de espacios | Bajo: inconsistencia | Usar el mismo conjunto W de la entrada para recortar `tipoDocumento` |
| 2 | No se precisa si `tipoDocumento` puede ser heredado por prototipo ni si `opciones` puede ser array o función | Bajo | Leer solo propiedades propias (`Object.hasOwn`) |
| 3 | Un dígito de verificación seguido de un dígito suelto (`"999912345-6 7"` con TI, `"99991234-5 6"`) se absorbe y da un número válido | **Medio: principio V** | Decidir si un grupo final de un solo dígito tras un guion debe rechazarse siempre |
| 4 | No hay escenario que fije qué pasa si los accesores o proxies de `opciones` lanzan | Bajo | Escenario explícito: la excepción se propaga sin envolver |
| 5 | Pares surrogate válidos (emoji, dígitos matemáticos) dan `caracteres-invalidos`, pero ningún escenario lo fija | Bajo | Añadir escenario |
| 6 | `toLowerCase` es Unicode completo: `"Tİ"` y `"ＴＩ"` son inválidos sin escenario | Bajo | Añadir escenario |
| 7 | `regresiones()` no compara `n`: si se borran fixtures, la eval no avisa | **Medio: harness** | Tratar una caída de `n` frente al baseline como regresión (cambio en `evals-por-campo`) |
| 8 | `tipoDocumento` no tiene tope de longitud | Bajo | Rechazar `tipoDocumento` de más de 8 caracteres |

Pendiente humano: ratificar las 15 decisiones del orquestador registradas en `openspec/changes/archive/*-nuip-endurecer-entradas/design.md`.
