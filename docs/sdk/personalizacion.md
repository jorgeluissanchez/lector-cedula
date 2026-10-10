# Personalización de la UI

El SDK es headless: no trae estilos ni marcado. Tú pintas todo a partir de `estado`.

## Recuadro embebido, no pantalla completa

El `<video>` puede vivir en cualquier contenedor de tu página (una tarjeta, un paso de un formulario). No hace falta pantalla completa:

```css
.camara { position: relative; width: 100%; max-width: 480px; aspect-ratio: 3 / 4; overflow: hidden; border-radius: 12px; }
.camara video { width: 100%; height: 100%; object-fit: cover; }
.camara .guia { position: absolute; border: 2px solid #fff; border-radius: 8px; box-shadow: 0 0 0 100vmax rgb(0 0 0 / .45); }
```

`playsinline` y `muted` en el `<video>` evitan que iOS lo abra a pantalla completa.

## Guía de encuadre

La guía tiene proporción ID-1 (85,60 x 53,98 mm) y se calcula centrada dentro de la **zona visible** del vídeo en su elemento: con `object-fit: cover`, la parte del frame que no se recorta; con otro ajuste, el frame completo. La calidad y la presencia del documento se evalúan dentro de esa guía.

- `estado.guia` (en `activo` y `listo`): rectángulo en píxeles del vídeo (`video`) y en fracciones [0, 1] (`normalizada`).
- `estado.guiaEnPantalla`: el mismo rectángulo en píxeles CSS relativos al `<video>`, calculado con su tamaño (`clientWidth`/`clientHeight`) y su `object-fit` computado. Se recalcula sin esperar un frame al cambiar el tamaño del elemento o del vídeo (por ejemplo al girar el teléfono). `null` sin guía o sin medidas.

Coloca tu recuadro encima del vídeo con esas coordenadas:

```ts
import type { EstadoLector } from "@lector-cedula/web";

function estiloGuia(e: EstadoLector) {
  const g = e.guiaEnPantalla;
  if (g === null || (e.fase !== "activo" && e.fase !== "listo")) return { display: "none" };
  return { display: "block", left: `${g.x}px`, top: `${g.y}px`, width: `${g.ancho}px`, height: `${g.alto}px` };
}
```

Funciones puras exportadas por `@lector-cedula/web`, para calcular tú la geometría (por ejemplo en un canvas): `regionVisible(medidas)`, `guiaEnVideo(medidas, opciones)` y `guiaEnElemento(guia, medidas)`, con `medidas = { anchoVideo, altoVideo, anchoElemento, altoElemento, ajuste: "cover" | "contain" }`.

## Guía vertical u horizontal

`guia: { orientacion: "horizontal" | "vertical", margen }` en las opciones del lector (por omisión `horizontal` y margen 0,05 por lado, `margen` en [0, 0,25]). Con `vertical` el lado largo de la guía queda vertical aunque el frame sea apaisado: útil en un recuadro de pie dentro de un login móvil, con la cédula sostenida de pie. El motor lee el documento en las cuatro orientaciones.

```ts
import { useLectorCedula } from "@lector-cedula/react";

const { videoRef, estado } = useLectorCedula({ recursos: "/lector-cedula/", backend: "/api/cedula", guia: { orientacion: "vertical" } });
```

## Mensajes y estados

| Estado | Sugerencia de UI |
|---|---|
| `fase: "permiso"` | "Permite el acceso a la cámara" |
| `calidad.motivo` | `oscuro`, `sobreexpuesto`, `reflejo`, `desenfocado`, `acerca`: muestra una pista |
| `contenido` | `pdf417`, `mrz-td1`, `mrz-td3`: qué cara se detectó |
| `fase: "leyendo"` / `progreso` | Barra de progreso local |
| `fase: "verificando"` / `verificacion.etapa` | "Validando..." (`en-espera` = sin red) |
| `rechazo.motivo` | Pide otra toma; ver [protocolo.md](protocolo.md#motivos-de-rechazo) |
| `error.codigo` / `error.mensaje` | `idioma: "es" \| "en"` cambia solo `mensaje` |

Usa `aria-live="polite"` para anunciar los cambios de fase.

## Componente opcional

Un componente `<lector-cedula>` con UI accesible por defecto está (planeado) en `@lector-cedula/elementos`.
