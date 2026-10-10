# Protocolo front-back

Definido en `@lector-cedula/protocolo` (tipos, constantes y `validarEvento`, sin dependencias) y en `protocolo-ndjson.schema.json`. Lo implementan `@lector-cedula/web` (opción `backend`) y `@lector-cedula/servidor` (`crearLectorServidor`).

## Petición

`POST <backend>` con una de estas formas:

- `multipart/form-data` con el campo `imagen` (`CAMPO_IMAGEN`, PNG, JPEG o WebP) y, opcional, `cliente` (`CAMPO_CLIENTE`, JSON con la lectura local del front).
- El binario crudo con `Content-Type: image/*` y, opcional, la cabecera `X-Lector-Cliente` (`CABECERA_CLIENTE`) con el JSON de la lectura local en base64url.

Sin `cliente` (modo `back` o `front-back` con dispositivo débil) el back valida igual y no compara.

## Respuesta NDJSON (por omisión)

`Accept: application/x-ndjson` → `200` con `Content-Type: application/x-ndjson; charset=utf-8` (`TIPO_NDJSON`), un evento JSON por línea:

```
{"etapa":"recibido"}
{"etapa":"leyendo","progreso":0.4}
{"etapa":"fraude"}
{"etapa":"comparando"}
{"etapa":"resultado","ok":true,"documento":{"tipoDocumento":"cedula-ciudadania","campos":{},"warnings":[],"confiable":true},"riesgo":{"nivel":"bajo"}}
```

- Etapas intermedias (`ETAPAS_INTERMEDIAS`): `recibido`, `leyendo`, `fraude`, `comparando`. Solo admiten `etapa` y `progreso` (en [0, 1], no decreciente). **Nunca** llevan datos del documento.
- Exactamente un evento final `resultado`, siempre el último.
- El front tolera líneas partidas entre fragmentos y líneas vacías; no usa WebSocket, EventSource ni sondeo.

## Respuesta JSON única

Con `Accept: application/json` (sin `application/x-ndjson`) o `?streaming=0` (`PARAMETRO_STREAMING`), un único JSON igual al evento final, con `Content-Type: application/json; charset=utf-8` (`TIPO_JSON`). En el front: `streaming: false`. Si el back responde NDJSON cuando se pidió JSON, el front falla con `protocolo-invalido`.

## Evento final

- `ok: true`: `documento` (al menos `tipoDocumento`, `campos` y `warnings`, en camelCase) y `riesgo` opcional.
- `ok: false`: `rechazo: { motivo, diferencias? }` y `riesgo` opcional. `diferencias` solo con `no-coincide` y solo rutas de campo (por ejemplo `"campos.nuip"`), sin valores.

## Motivos de rechazo

Lista cerrada `MOTIVOS_RECHAZO`:

| Motivo | Cuándo | Front |
|---|---|---|
| `no-coincide` | La lectura del back difiere de la del front | Reintenta |
| `fraude` | Riesgo por encima de `fraude.bloquearSi` | Reintenta |
| `ilegible` | El motor no leyó o formato no soportado | Reintenta |
| `menor-de-edad` | Menor sin `limites.admitirMenores` | Terminal |
| `documento-no-admitido` | Tipo fuera de `limites.documentos` | Terminal |
| `demasiado-grande` | Cuerpo mayor que `limites.bytes` | Reintenta |
| `tiempo-agotado` | Lectura mayor que `limites.tiempoMs` | Reintenta |
| `ocupado` | Cola del motor llena | Reintenta |
| `error-interno` | Fallo del motor o de `alConfirmar` | Reintenta |

El front reintenta hasta `intentosVerificacion` (por omisión 3) volviendo a `activo`; agotados, o con motivo terminal, pasa a `error` con `codigo: "verificacion-rechazada"` y `estado.rechazo` con el motivo. Un motivo fuera de la lista es `protocolo-invalido`.

## Errores de transporte en el front

`backend-no-disponible` (red o 5xx), `backend-rechazo-http` (4xx), `backend-tiempo-agotado` (`tiempoLimiteMs`, 30 s, o `inactividadMs`, 15 s, sin datos), `protocolo-invalido` (tipo de contenido, JSON o secuencia incorrectos), `cola-vencida` (sin red más de `tiempoColaMs`).

## Validar eventos

```ts
import { validarEvento, MOTIVOS_RECHAZO } from "@lector-cedula/protocolo";

const evento: unknown = JSON.parse(linea);
if (!validarEvento(evento)) throw new Error("evento inválido");
```

Para implementarlo en otros lenguajes, valida contra `@lector-cedula/protocolo/protocolo-ndjson.schema.json`. Ver [backend-java.md](backend-java.md) y [backend-go.md](backend-go.md).
