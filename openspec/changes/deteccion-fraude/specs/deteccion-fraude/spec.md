# Spec Delta: deteccion-fraude

## Purpose

Señal de riesgo de presentación fraudulenta de la cédula colombiana (amarilla y digital), calculada en el dispositivo y offline. La señal informa; no decide sola. Todos los datos de los escenarios son sintéticos (`PERSONA_BASE` de `@lector-cedula/fixtures`, NUIP con prefijo `9999`). Los valores numéricos de umbral son valores por defecto iniciales; su calibración se documenta en `design.md` y todo cambio pasa por esta spec.

## ADDED Requirements

### Requirement: FRA-01 Contrato de la señal de riesgo
`evaluarFraude(entrada, config)` MUST devolver una `SenalRiesgo` con exactamente las claves `version` (1), `puntaje` (entero 0-100), `nivel`, `motivos`, `accion`, `senalesOmitidas`, `fase` y `warnings`; la forma exacta de cada clave está en design.md, decisión 10. Cada motivo MUST tener `codigo` en `pantalla`, `fotocopia`, `recorte`, `edicion` o `inconsistencia`, sin repetidos y en orden de puntaje descendente, y `detalle` MUST ser un código kebab-case de lista cerrada sin datos del documento.

#### Scenario: Documento auténtico sintético
- **WHEN** se evalúa la escena sintética `amarilla-autentica-semilla-1` con la configuración por defecto
- **THEN** el resultado tiene `version` 1, `nivel` `"bajo"`, `motivos` `[]`, `accion` `"continuar"` y `fase` `"heuristica"`

#### Scenario: Codigo fuera del vocabulario
- **WHEN** el contrato de tipos compila un motivo con `codigo: "deepfake"`
- **THEN** TypeScript produce un error esperado (`@ts-expect-error`)

#### Scenario: Entrada arbitraria no lanza
- **WHEN** se llama `evaluarFraude` con cualquier valor de `fc.anything()`
- **THEN** no lanza y devuelve una `SenalRiesgo` válida con `senalesOmitidas` no vacío o `puntaje` 0

### Requirement: FRA-02 Procesamiento local y offline
La detección MUST ejecutarse en el Worker del dispositivo sin ninguna petición de red. Los recursos que necesite (Fase B: modelo ONNX) MUST venir de la precaché del service worker con verificación `sha256`.

#### Scenario: Sin red durante la evaluación
- **WHEN** la PWA lee la escena `amarilla-1080p` con la red desconectada (`context.setOffline(true)`) y se registran todas las peticiones desde `listo` hasta `resultado`
- **THEN** no hay peticiones fuera del origen y ninguna nueva petición de red, y `data-riesgo-nivel` está presente en `resultado`

### Requirement: FRA-03 Sin persistencia de imágenes ni datos en la señal
El paquete MUST NOT escribir imágenes, frames, recortes ni la señal en almacenamiento (`localStorage`, `sessionStorage`, `indexedDB`, Cache API, disco). Los buffers de frames MUST ponerse a cero tras la evaluación. La señal y los logs MUST NOT contener NUIP, nombres, fechas ni píxeles.

#### Scenario: Buffers liberados
- **WHEN** el manejador del Worker termina `evaluarFraude` sobre un frame sintético de 1920x1080
- **THEN** todos los bytes del `Uint8ClampedArray` recibido valen 0

#### Scenario: Señal sin datos personales
- **WHEN** se serializa a JSON la señal de la escena `amarilla-recortada-semilla-1` (NUIP `9999123456`, apellido `PRUEBA`)
- **THEN** el JSON no contiene `9999123456`, `PRUEBA` ni ninguna fecha `AAAA-MM-DD` del documento

#### Scenario: Control de privacidad estático
- **WHEN** se ejecuta `npm run check:privacidad`
- **THEN** sale con código 0 sin excepciones `privacidad-ok` nuevas en `packages/fraud/src`

### Requirement: FRA-04 La señal no bloquea por defecto
Con la configuración por defecto, `accion` MUST ser `"continuar"` o `"revisar"`, nunca `"bloquear"`, y la lectura de datos MUST completarse igual. `"bloquear"` MUST aparecer solo si la instancia define `bloquearSi` y la señal lo cumple. `"bloquear"` MUST exigir al menos 2 motivos distintos que superen la política, salvo que la instancia configure explícitamente `bloquearSi.motivoUnico: true` (decisión P3).

#### Scenario: Pantalla con configuración por defecto
- **WHEN** se evalúa `amarilla-pantalla-semilla-1` con la configuración por defecto
- **THEN** `nivel` es `"alto"`, `motivos[0].codigo` es `"pantalla"` y `accion` es `"revisar"`

#### Scenario: Instancia que bloquea por puntaje
- **WHEN** se evalúa `amarilla-pantalla-semilla-1` con `bloquearSi: { puntajeMinimo: 70, motivosMinimos: 1, motivoUnico: true }`
- **THEN** `accion` es `"bloquear"`

#### Scenario: Un solo motivo sin motivoUnico no bloquea
- **WHEN** se evalúa una entrada con un solo motivo de puntaje 90 y `bloquearSi: { puntajeMinimo: 70, motivosMinimos: 2 }`
- **THEN** `accion` es `"revisar"`

#### Scenario: Dos motivos distintos bloquean
- **WHEN** se evalúa una entrada con motivos `pantalla` 0,9 y `recorte` 0,8 y `bloquearSi: { puntajeMinimo: 70, motivosMinimos: 2 }`
- **THEN** `accion` es `"bloquear"`

#### Scenario: Instancia que exige dos motivos
- **WHEN** se evalúa una entrada con un solo motivo de puntaje 90 y `bloquearSi: { puntajeMinimo: 70, motivosMinimos: 2 }`
- **THEN** `accion` es `"revisar"`

### Requirement: FRA-05 Configuración por instancia
Umbrales, pesos y `bloquearSi` MUST leerse de un objeto `ConfigFraude` validado. Los valores por defecto son: `umbralMedio` 40, `umbralAlto` 70, `bloquearSi` ausente, `modelo.habilitado` `false`. Una configuración inválida MUST rechazarse con un error tipado `config-fraude-invalida` y la lectura MUST seguir con la configuración por defecto y `senalesOmitidas` vacío.

#### Scenario: Umbrales invertidos
- **WHEN** se valida `{ umbralMedio: 80, umbralAlto: 50 }`
- **THEN** el resultado es `{ ok: false, error: "config-fraude-invalida", campo: "umbralAlto" }`

#### Scenario: motivosMinimos 1 sin motivoUnico
- **WHEN** se valida `{ bloquearSi: { puntajeMinimo: 70, motivosMinimos: 1 } }` sin `motivoUnico: true`
- **THEN** el resultado es `{ ok: false, error: "config-fraude-invalida", campo: "bloquearSi.motivosMinimos" }`

#### Scenario: Nivel por umbrales
- **WHEN** el puntaje agregado es 39, 40, 69 y 70 con los umbrales por defecto
- **THEN** `nivel` es `"bajo"`, `"medio"`, `"medio"` y `"alto"` respectivamente

### Requirement: FRA-06 Agregación determinista y explicable
El `puntaje` global MUST calcularse como `round(100 * (1 - prod(1 - p_i * w_i)))` sobre los puntajes por motivo `p_i` en [0,1] y pesos `w_i` de la configuración, de modo que es monótono no decreciente en cada `p_i`. Solo entran en `motivos` y en la agregación los motivos con puntaje >= 0,3. La misma entrada y configuración MUST producir el mismo resultado byte a byte.

#### Scenario: Agregación literal
- **WHEN** los motivos son `pantalla` 0,5 y `edicion` 0,5 con pesos 1
- **THEN** `puntaje` es 75

#### Scenario: Monotonía
- **WHEN** fast-check genera vectores de puntajes y aumenta uno de ellos
- **THEN** el `puntaje` global no disminuye (numRuns >= 1000)

### Requirement: FRA-07 Recaptura de pantalla
El detector `pantalla` MUST combinar: energía de picos periódicos fuera del eje en el espectro de magnitud del recorte de la tarjeta (moiré y subpíxeles), reflejo especular plano extenso, presencia de un borde rectangular oscuro externo a la tarjeta y bandas horizontales que se desplazan entre frames consecutivos (banding). Debe emitir `pantalla` con `detalle` en `moire`, `subpixeles`, `reflejo-plano`, `marco-pantalla`, `banding`.

#### Scenario: Moiré sintético
- **WHEN** se evalúa `amarilla-pantalla-semilla-1` (simulación de pantalla de 400 ppi capturada a 25 cm con rejilla RGB y moiré)
- **THEN** `motivos` contiene `{ codigo: "pantalla" }` con `puntaje` >= 0,7 y `detalle` `"moire"`

#### Scenario: Banding entre frames
- **WHEN** se evalúa una secuencia de 5 frames `digital-pantalla-banding-semilla-2` con bandas que avanzan 12 px por frame
- **THEN** `motivos` contiene `pantalla` con `detalle` `"banding"`

#### Scenario: Metamórfica sobre auténtico
- **WHEN** a `amarilla-autentica-semilla-1` se aplican rotación ±3°, blur sigma 1, brillo ±20 % y JPEG calidad 70
- **THEN** el puntaje de `pantalla` se mantiene < 0,4 en todas las variantes

### Requirement: FRA-08 Fotocopia o impresión
El detector `fotocopia` MUST combinar saturación baja, tramado de semitono, textura de papel y, en la amarilla con 3 o más frames, ausencia de variación del holograma, y emitir `detalle` en `gris`, `baja-saturacion`, `tramado`, `papel`, `sin-holograma`. La región del holograma es **hipótesis** H-FRA-1 (`docs/decisiones/hipotesis-formato.md`) y MUST reportarse en `warnings` mientras esté pendiente.

#### Scenario: Fotocopia en grises
- **WHEN** se evalúa `amarilla-fotocopia-gris-semilla-1`
- **THEN** `motivos` contiene `fotocopia` con `puntaje` >= 0,7 y `detalle` `"gris"`

#### Scenario: Impresión en color con tramado
- **WHEN** se evalúa `digital-impresion-color-semilla-3` (tramado CMYK a 150 lpi)
- **THEN** `motivos` contiene `fotocopia` con `detalle` `"tramado"`

#### Scenario: Holograma estático con un solo frame
- **WHEN** se evalúa la amarilla con un único frame
- **THEN** no se emite `sin-holograma` y `senalesOmitidas` contiene `"holograma"`

### Requirement: FRA-09 Geometría de tarjeta ID-1
El detector `recorte` MUST medir sobre el cuadrilátero rectificado la relación de aspecto (esperada 85,60/53,98 = 1,586 ± 0,03) y el radio de las cuatro esquinas (esperado 3,18 mm ± 1 mm según ISO/IEC 7810). Debe emitir `recorte` con `detalle` `aspecto` o `esquinas-rectas` cuando no se cumpla.

#### Scenario: Esquinas rectas
- **WHEN** se evalúa `amarilla-recortada-semilla-1` (tarjeta impresa recortada con esquinas a 90°)
- **THEN** `motivos` contiene `recorte` con `detalle` `"esquinas-rectas"`

#### Scenario: Relación de aspecto
- **WHEN** el cuadrilátero rectificado mide 1000 x 700 px (relación 1,429)
- **THEN** `motivos` contiene `recorte` con `detalle` `"aspecto"`

### Requirement: FRA-10 Edición digital
El detector `edicion` MUST buscar bloques 8x8 con firma de doble cuantización JPEG distinta del resto y superposiciones rectangulares con bordes de nitidez o ruido incoherentes con su entorno. Debe emitir `edicion` con `detalle` `doble-compresion` o `superposicion`. Su peso por defecto MUST ser 0,5 (señal débil) hasta que la eval real lo justifique.

#### Scenario: Parche pegado
- **WHEN** se evalúa `digital-editada-semilla-4` (región del NUIP reemplazada y recomprimida a JPEG 60 sobre fondo a JPEG 92)
- **THEN** `motivos` contiene `edicion` con `detalle` `"doble-compresion"` o `"superposicion"`

### Requirement: FRA-11 Consistencia de datos
El detector `inconsistencia` MUST reutilizar los validadores de `packages/parsers` (NUIP, dígito ICAO, DIVIPOL y parsers) sin duplicar su lógica, con reloj inyectado, y emitir `detalle` en `fecha-imposible`, `nuip-formato`, `municipio-inexistente`, `vencido`, `digito-control`, `mrz-vs-visible`, `pdf417-vs-visible`. Sin rangos de NUIP (P7): `nuip-formato` solo cuando `validarFormatoNuip` rechaza.

#### Scenario: Nacimiento posterior a expedición
- **WHEN** los datos tienen nacimiento `2005-03-01` y expedición `2004-01-10`
- **THEN** `motivos` contiene `inconsistencia` con `detalle` `"fecha-imposible"`

#### Scenario: Municipio inexistente
- **WHEN** el código DIVIPOL del lugar es `99-999`
- **THEN** `motivos` contiene `inconsistencia` con `detalle` `"municipio-inexistente"`

#### Scenario: Digital vencida
- **WHEN** la MRZ sintética tiene vencimiento `2026-01-31` y el reloj inyectado es `2026-10-08`
- **THEN** `motivos` contiene `inconsistencia` con `detalle` `"vencido"`

#### Scenario: Dígito de control erróneo
- **WHEN** la MRZ sintética tiene el dígito de control del número de documento alterado de `3` a `4`
- **THEN** `motivos` contiene `inconsistencia` con `detalle` `"digito-control"`

#### Scenario: Visible distinto del código
- **WHEN** el OCR del anverso entrega NUIP `9999123457` y el PDF417 `9999123456`
- **THEN** `motivos` contiene `inconsistencia` con `detalle` `"pdf417-vs-visible"`

#### Scenario: Sin OCR del anverso
- **WHEN** no hay texto visible disponible
- **THEN** no se emite `pdf417-vs-visible` ni `mrz-vs-visible` y `senalesOmitidas` contiene `"texto-visible"`

### Requirement: FRA-12 Rendimiento y presupuesto
La evaluación heurística completa MUST tardar p95 <= 300 ms por documento en Chromium escritorio y p95 <= 800 ms en el perfil Pixel 7 de Playwright, sobre recorte reducido a 1024 px de ancho y hasta 5 frames, y MUST NOT añadir más de 150 KiB gzip al bundle de la PWA en la Fase A. La lectura total p95 <= 3 s de la matriz MUST mantenerse.

#### Scenario: Latencia en Worker
- **WHEN** se evalúan 50 escenas sintéticas en Chromium vía Vitest browser mode
- **THEN** p95 <= 300 ms

#### Scenario: Presupuesto de bundle
- **WHEN** se construye `apps/pwa` y se mide el chunk de `packages/fraud`
- **THEN** pesa <= 153600 bytes gzip

### Requirement: FRA-13 Dataset sintético de ataques
`npm run fraude:sinteticos` MUST generar de forma determinista por semilla las clases `autentica`, `pantalla`, `fotocopia-gris`, `fotocopia-color`, `impresion`, `recortada` y `editada`, con >= 200 muestras por clase y tipo de documento, en `evals/sinteticos/fraude/` (no versionadas), con un manifiesto `"sintetico": true` y solo dependencias de la lista permitida.

#### Scenario: Determinismo
- **WHEN** se genera dos veces la clase `pantalla` con semilla 1
- **THEN** los `sha256` de los archivos coinciden

#### Scenario: Manifiesto sintético
- **WHEN** se valida el manifiesto generado
- **THEN** cada entrada tiene `"sintetico": true` y `npm run check:privacidad` sale con código 0

### Requirement: FRA-14 Métricas ISO/IEC 30107-3
`npm run eval:fraude` MUST reportar por documento y especie de ataque APCER, BPCER, APCER máximo, BPCER a APCER 5 % y AUC con IC de Wilson 95 %, y salir con código 1 si una métrica empeora más de 1 punto frente a `evals/reports/baseline-fraude.json`. Meta sintética de Fase A: APCER máximo <= 10 % con BPCER <= 5 % para `pantalla`, `fotocopia-gris` y `recortada`.

#### Scenario: Cálculo literal
- **WHEN** el corredor recibe 100 ataques con 7 aceptados como auténticos y 200 auténticos con 6 clasificados como ataque
- **THEN** reporta APCER 0,07 y BPCER 0,03

#### Scenario: Regresión
- **WHEN** el APCER de `pantalla` pasa de 0,06 en el baseline a 0,08
- **THEN** el corredor sale con código 1 y nombra la métrica

### Requirement: FRA-15 Plan de datos reales con consentimiento
La evaluación con capturas reales MUST seguir `docs/legal/consentimiento-set-campo.md`: ejecutarse fuera del repositorio, publicar solo métricas agregadas en `evals/reports/fraude-campo-*.json` sin imágenes, rutas ni identificadores, y requerir para cada ataque físico (pantalla, fotocopia) una cédula de un participante que firmó la autorización. Las metas reales para cerrar la Fase B son APCER <= 5 % con BPCER <= 3 % por especie.

#### Scenario: Reporte agregado sin datos
- **WHEN** se valida un `fraude-campo-*.json` con el esquema del reporte
- **THEN** solo admite claves de métricas, conteos y versión, y rechaza claves `ruta`, `imagen`, `nuip` o `participante`

### Requirement: FRA-16 Modelo ligero opcional (Fase B)
Un clasificador ONNX MAY sumarse como un `p_i` más de FRA-06 solo si `modelo.habilitado` es `true`, figura en `models/manifest.json` con licencia de pesos y `licenciaDatos` permitidas y aprobadas por `revisor-licencias`, pesa <= 10 MB y corre en onnxruntime-web. Si falla MUST omitirse (`senalesOmitidas` contiene `"modelo"`). Ningún modelo generativo MUST participar.

#### Scenario: Modelo deshabilitado
- **WHEN** se evalúa con la configuración por defecto
- **THEN** `fase` es `"heuristica"` y no se solicita ningún `.onnx`

#### Scenario: Modelo ausente
- **WHEN** `modelo.habilitado` es `true` pero la sesión ONNX falla al crearse
- **THEN** `fase` es `"heuristica"`, `senalesOmitidas` contiene `"modelo"` y el resultado heurístico es idéntico al de la configuración por defecto

#### Scenario: Manifiesto incompleto
- **WHEN** `models/manifest.json` declara un modelo de fraude sin `licenciaDatos`
- **THEN** `npm run check:licencias` sale con código distinto de 0

### Requirement: FRA-17 Presentación en la PWA
La pantalla `resultado` MUST mostrar el nivel de riesgo y los motivos en español (por ejemplo, `pantalla` -> "Parece una foto de una pantalla") con `data-riesgo-nivel` y `data-riesgo-motivos`, como información, sin ocultar los datos leídos, y con 0 violaciones axe serious o critical.

#### Scenario: Pantalla simulada en E2E
- **WHEN** la cámara simulada reproduce `amarilla-pantalla-1080p.y4m`
- **THEN** `resultado` muestra los datos, `data-riesgo-nivel` es `alto` y `data-riesgo-motivos` contiene `pantalla`

#### Scenario: Auténtico en E2E
- **WHEN** la cámara simulada reproduce `amarilla-1080p.y4m`
- **THEN** `data-riesgo-nivel` es `bajo`

### Requirement: FRA-20 Señal no disponible en la PWA
La PWA MUST calcular la señal en un Worker propio (`fraude.worker`) tras una lectura correcta de la cédula, con los frames de vídeo de la captura (copias que el Worker pone a cero) y el rectángulo de la guía como cuadrilátero, y esperarla como máximo 3000 ms. Si el Worker falla, excede el tiempo o el documento no es una cédula, `resultado` MUST mostrarse igual con `data-riesgo-nivel` `no-disponible` y sin motivos.

#### Scenario: Guía como cuadrilátero
- **WHEN** la entrada declara `cuadrilateroAproximado: true` (la PWA usa la guía de encuadre)
- **THEN** no se emiten `recorte`, `marco-pantalla` ni `sin-holograma`, y `senalesOmitidas` contiene `"geometria"` y `"holograma"`

#### Scenario: Worker de fraude que no responde
- **WHEN** el cliente de fraude no recibe respuesta en 3000 ms
- **THEN** resuelve `null`, termina el Worker y `resultado` tiene `data-riesgo-nivel` `no-disponible`

#### Scenario: Motivos en español
- **WHEN** la señal tiene motivos `pantalla` y `fotocopia`
- **THEN** la pantalla muestra "Parece una foto de una pantalla" y "Parece una fotocopia o una impresión", y `data-riesgo-motivos` es `pantalla fotocopia`

### Requirement: FRA-18 Vencimiento solo en la cédula digital
El `detalle` `vencido` MUST emitirse solo cuando `tipo` es `"digital"` (decisión P5); la cédula amarilla no tiene fecha de vencimiento.

#### Scenario: La amarilla nunca vence
- **WHEN** se evalúa la amarilla con datos que incluyen una fecha `vencimiento` `2026-01-31` y el reloj inyectado es `2026-10-08`
- **THEN** no se emite `vencido`

#### Scenario: Sin reloj válido no hay vencimiento
- **WHEN** se evalúa la digital con vencimiento `2001-01-01` y el reloj inyectado lanza o devuelve una fecha inválida
- **THEN** no se emite `vencido`; una fecha de vencimiento ilegible produce `fecha-imposible`

### Requirement: FRA-19 Set de campo bloqueado hasta revisión legal
La recolección de ataques físicos (fotocopias, pantallas) con cédulas reales MUST NOT empezar hasta que exista una aprobación legal escrita en `docs/legal/` (decisión P4).

#### Scenario: Sin aprobación legal
- **WHEN** no existe `docs/legal/aprobacion-set-campo.md`
- **THEN** la tarea 6.3 permanece abierta y no existe ningún `evals/reports/fraude-campo-*.json`
