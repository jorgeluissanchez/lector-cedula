# Plan de trabajo: lector autoalojado de cédula colombiana a nivel comercial

Fecha: 2026-10-06. Modo de ejecución: agéntico y subagéntico con Claude Code, Spec-Driven Development (SDD) y harness engineering. Las investigaciones de soporte están en [docs/investigacion/](docs/investigacion/).

## 0. Qué significa "a la altura del mercado"

El benchmark de 22 proveedores ([02-benchmark-comercial.md](docs/investigacion/02-benchmark-comercial.md)) fija el listón. Lo que un competidor serio ofrece y es factible autoalojado, sin convenio con la Registraduría:

| # | Capacidad | Referencia comercial | Meta propia |
|---|---|---|---|
| 1 | PDF417 de la amarilla parseado completo | Truora, Incode, Microblink | 95 % éxito al primer intento, 3 intentos máx. |
| 2 | MRZ TD1 de la digital con 4 dígitos de control y detección automática de versión | Veridas, Didit | 98 % de campos con checksum válido |
| 3 | OCR del anverso con confianza por campo y bounding boxes, fechas ISO | Verifik Scan Studio v3, Incode | CER por campo menor o igual a 2 % |
| 4 | Cruce VIZ contra PDF417 o MRZ con warnings explícitos | Truora data-consistency, Entrust | 100 % de los campos comparables |
| 5 | Calidad de captura on-device: bordes, perspectiva, recorte, auto-captura, score 0-100, glare por zona | Didit, Scanbot, Microblink | Rechazo de frames malos antes de decodificar |
| 6 | Document liveness: pantalla, fotocopia, impresión | Microblink Verify, Regula AAC, Jumio | Clasificador propio, AUC mayor a 0,95 en DLC-2021 |
| 7 | Template matching por versión y detección de manipulación | Didit, Entrust | Señales ponderadas, nunca veredicto único |
| 8 | Multi-documento: TI, CE, PPT, PEP, pasaporte, contraseña | Truora | Cobertura de los 12 tipos de Truora |
| 9 | Face match 1:1 y liveness pasivo | Truora, Olimpia, Facephi | Modelos con licencia limpia, preparar iBeta |
| 10 | API JSON con estados, checks agrupados, declined_reason, webhooks HMAC, sandbox, idempotencia | Truora, Veriff, Didit | p95 menor a 3 s por documento |
| 11 | SDK web WASM + Android/iOS, híbrido on-device/servidor | Microblink, Regula | PWA + Capacitor, una sola base |
| 12 | Cumplimiento: autorización explícita, minimización, retención, cifrado, auditoría | Todos | Ley 1581 desde el día 1, ISO 27001 como hoja de ruta |

Lo que no se puede igualar sin convenio: consulta ANI en línea, cotejo AFIS, facial contra base biométrica (Resolución 27145/2023 RNEC). El producto lo declara y ofrece el certificado de vigencia público y un conector opcional a agregadores (Didit, Verifik) como complemento.

## 1. Principios (constitución del proyecto)

Estos principios van en `.specify/memory/constitution.md` y en `CLAUDE.md`. Todo agente los lee antes de actuar y todo verificador los aplica.

1. **Spec antes que código.** Nada se implementa sin una spec aprobada en `openspec/` o `specs/`. Las tareas de los subagentes se derivan de la spec, no de la conversación.
2. **Verificación automática o no cuenta.** Cada requisito tiene una prueba, un eval o un hook que lo comprueba. "Funciona en mi celular" no es evidencia.
3. **Privacidad por diseño.** Procesar en el dispositivo por defecto. Nunca persistir imágenes ni el bloque biométrico del PDF417. AFIS y tarjeta decadactilar se descartan en el parser. Los fixtures con datos reales nunca entran al repositorio.
4. **Licencias limpias.** Solo MIT, Apache-2.0, BSD, MPL-2.0 y CC BY. Prohibidos en producción: AGPL (Ultralytics, fastmrz, alsenet mrz-scanner), packs de InsightFace (buffalo_l, antelopev2) sin licencia comercial, pesos de Surya (RAIL-M), Qwen2.5-VL (no comercial), pyiqa (PolyForm Noncommercial), DocScanner y DocTr (no comercial), TruFor, y DocXPand-25k como dataset de entrenamiento (CC BY-NC-SA; su generador MIT sí se puede usar). CAT-Net sí está permitido (código Apache-2.0, pesos CC BY 4.0). Pendientes de confirmar antes de usar en producción: pesos de DocAligner (issue #13 abierto el 2026-10-05) y licencia de SIDTD (publicada con tres variantes CC distintas).
5. **Determinismo sobre fluidez.** Nunca un modelo generativo decide un número de identidad. Los VLM solo como respaldo asíncrono y con validación cruzada.
6. **El formato es ingeniería inversa.** Cada offset, marcador y variante del PDF417 y la MRZ se trata como hipótesis hasta que una prueba con payload real la confirme.
7. **Una sola base de código.** TypeScript para cliente y parsers, Python solo en el servidor de respaldo. La misma UI corre como PWA y como app Capacitor.

## 2. Harness: el andamiaje que sostiene a los agentes

El harness es lo que convierte a Claude Code en un equipo confiable para este proyecto. Se construye en la Fase 0 y evoluciona en cada fase.

### 2.1 Estructura del repositorio

```
lector-cedula/
  CLAUDE.md                      # reglas cortas, errores pasados, comandos
  .specify/memory/constitution.md
  openspec/
    specs/                       # verdad actual: una carpeta por capacidad
    changes/                     # propuestas en curso (proposal, specs delta, design, tasks)
  docs/investigacion/            # los tres informes de hoy
  docs/decisiones/               # ADR cortos
  .claude/
    agents/                      # definiciones de subagentes
    skills/                      # skills propias del proyecto
    hooks/                       # scripts de hooks
    settings.json                # hooks y permisos
  packages/
    parsers/                     # TS puro: pdf417-co, mrz-co, divipol, validadores
    capture/                     # cámara, calidad, recorte, workers
    ocr/                         # OCR cliente (ppu-paddle-ocr) y extracción por plantilla
    fraud/                       # señales antifraude cliente
    sdk/                         # API pública del SDK web
  apps/
    pwa/                         # Vite + React
    mobile/                      # Capacitor
  server/                        # FastAPI: OCR de respaldo, re-decode, API, webhooks
  evals/
    fixtures/                    # payloads sintéticos y públicos (nunca reales)
    datasets/                    # scripts de descarga de MIDV, DLC-2021, SIDTD (no los datos)
    runners/                     # scripts que calculan métricas por campo
    reports/                     # salidas de evals por commit
```

### 2.2 Herramientas de SDD

Se usan tres piezas que se complementan:

| Pieza | Para qué | Comandos |
|---|---|---|
| GitHub Spec Kit 1.0 (`uv tool install specify-cli`) | Constitución y specs de capacidad nuevas (greenfield) | `/speckit-constitution`, `/speckit-specify`, `/speckit-plan`, `/speckit-tasks`, `/speckit-implement`, `/speckit-converge`, `/speckit-bug-assess`, `/speckit-bug-fix`, `/speckit-bug-test` |
| OpenSpec (`npm i -g @fission-ai/openspec`) | Cambios sobre specs existentes con deltas ADDED/MODIFIED/REMOVED (brownfield, desde la Fase 2) | `/opsx:explore`, `/opsx:propose`, `/opsx:apply`, `/opsx:verify`, `/opsx:archive` |
| Superpowers (`/plugin install superpowers@claude-plugins-official`) | Disciplina de ejecución | `brainstorming`, `writing-plans`, `subagent-driven-development`, `test-driven-development`, `verification-before-completion`, `requesting-code-review`, `using-git-worktrees` |

Regla de uso: Spec Kit para abrir una capacidad nueva (una por fase), OpenSpec para cada cambio incremental dentro de una capacidad ya especificada, Superpowers para que cada subagente trabaje con TDD y verifique antes de reportar.

### 2.3 Skills propias del proyecto (`.claude/skills/`)

| Skill | Qué hace | Quién la invoca |
|---|---|---|
| `formato-cedula` | Carga [01-formato-cedula-y-repos.md](docs/investigacion/01-formato-cedula-y-repos.md) y las reglas de hipótesis vs. hecho | Cualquier agente que toque parsers |
| `fixture-sintetico` | Genera payloads PDF417 y MRZ sintéticos válidos (con zxing-wasm writer y generador de checksums ICAO) a partir de un JSON de persona ficticia | Implementadores y eval-runner |
| `eval-campo` | Ejecuta `evals/runners` sobre un dataset y produce la tabla de exact match y CER por campo y por versión | Verificador, CI, hook de Stop |
| `licencia-check` | Revisa `package.json`, `requirements.txt` y modelos descargados contra la lista permitida | Hook PreToolUse en instalaciones, revisor |
| `privacidad-check` | Busca persistencia de imágenes, bytes biométricos, logs con PII y fixtures reales | Hook PreToolUse en commits, revisor |
| `captura-movil` | Guía de restricciones de cámara (iOS sin ImageCapture, 1920x1080 mínimo, Worker, tamaño de WASM) | Implementadores de `packages/capture` |
| `benchmark-comercial` | Carga la tabla del punto 0 para que el revisor compare cada entrega contra el listón | Revisor de producto |

### 2.4 Hooks (`.claude/settings.json`)

| Evento | Acción | Propósito |
|---|---|---|
| PostToolUse (Edit/Write en `packages/**`) | `npx vitest related --run` sobre el archivo tocado + `eslint --fix` | Retroalimentación inmediata al agente |
| PostToolUse (Edit/Write en `server/**`) | `ruff check --fix` + `pytest -x` del módulo | Igual en Python |
| PreToolUse (Bash con `git commit`) | `privacidad-check` + `licencia-check` + `npm run typecheck` | Bloquea commits con PII, fixtures reales o licencias prohibidas |
| PreToolUse (Bash con `npm install` o `pip install`) | `licencia-check` del paquete | Evita que entre AGPL por descuido |
| Stop | `eval-campo --quick` sobre fixtures sintéticos y comparación con `evals/reports/baseline.json` | El agente no termina si bajó una métrica |
| SubagentStop | Verifica que el subagente dejó `tasks.md` actualizado y pruebas en verde | Cierre honesto de cada tarea |
| UserPromptSubmit | Inyecta el estado de `openspec/changes/` activo | Contexto de qué spec está en curso |

### 2.5 CLAUDE.md (contenido mínimo)

- Comandos: `npm run check`, `npm run eval`, `docker compose -f server/compose.yaml run --rm pruebas`, `openspec list`.
- Mapa del repo en diez líneas.
- Reglas no negociables (los 7 principios en una línea cada uno).
- Sección "Errores pasados" que los revisores van alimentando: la primera entrada es la lista de bugs de repos antiguos del punto 1 del documento de formato (RH `AB`, sexo por `contains`, Ñ, `-` del RH, apellidos invertidos).
- Qué está prohibido: leer el QR de la digital, persistir imágenes, instalar AGPL, usar VLM para números.

### 2.6 Evals y datos

- **Sintéticos**: generador propio de PDF417 (persona ficticia -> bytes con cabecera, NUL, `PubDSK_1`, bloque demográfico, cola binaria aleatoria -> imagen con zxing-wasm writer -> distorsiones: rotación, blur, glare, perspectiva). Igual para MRZ con checksums correctos y con errores OCR-B inyectados. Plantillas de cédula con el generador de DocXPand (MIT) para OCR del anverso.
- **Públicos para entrenar** (licencia comercial OK): IDNet-2025 (CC BY 4.0, 125 GB, fraude por inpaint y crop), IDSpace (CC BY 4.0, 359.000 documentos, plantilla, escaneo y móvil con fraude), FantasyID (CC BY 4.0, impresos y recapturados con forgeries), DLC-2021 y MIDV-Holo (CC BY-SA 2.5; ojo con el share-alike sobre los pesos derivados), CAT-Net para splicing, dataset tesseractMRZ (BSD-3, 7.000 MRZ con ground truth).
- **Públicos solo para evaluar**: MIDV-2020 (sin CC explícita), SIDTD (licencia inconsistente), DocXPand-25k (no comercial), HF `cedula_anverso_v2` (804 anversos colombianos, sin licencia declarada).
- No existe ningún dataset público de cédulas colombianas fuera de ese último. Por eso el generador sintético propio es crítico.
- **Reales**: set de campo con autorización escrita de los titulares, etiquetado a mano, almacenado fuera del repo y cifrado. Es el único que mide el éxito real. Se recolecta desde la Fase 1 con mínimo 30 cédulas amarillas, 30 digitales, 10 TI, 10 CE, y 5 blancas o cafés, en 5 modelos de celular.
- **Métricas fijas**: éxito al primer intento por versión y modelo; exact match y CER por campo; tiempo hasta resultado válido; porcentaje de caídas al servidor; AUC de document liveness; FAR/FRR de face match. Cada PR adjunta `evals/reports/<commit>.json` y el hook de Stop compara contra el baseline.

### 2.7 Orquestación de agentes

- Un **orquestador** por fase (la sesión principal de Claude Code). Lee la spec, descompone en tareas con `subagent-driven-development`, lanza subagentes en worktrees aislados y consolida.
- Subagentes definidos en `.claude/agents/` con herramientas acotadas:

| Agente | Rol | Herramientas | Salida esperada |
|---|---|---|---|
| `spec-writer` | Convierte una capacidad en spec Spec Kit u OpenSpec con escenarios Given/When/Then | Read, Grep, Write en `openspec/` y `specs/` | `proposal.md`, `specs/*.md`, `design.md`, `tasks.md` |
| `investigador` | Verifica hipótesis del formato o compara librerías; nunca escribe código de producto | WebSearch, WebFetch, Read | Nota en `docs/decisiones/` |
| `implementador` | Una tarea de `tasks.md` por vez, TDD, en worktree | Todas menos WebSearch | PR pequeño con pruebas |
| `verificador` | Ejecuta pruebas y evals, revisa la spec contra el código, no corrige | Bash, Read, Grep | Veredicto CONFIRMADO/RECHAZADO con evidencia |
| `revisor-privacidad` | Audita PII, biometría, retención, autorización | Read, Grep, Bash | Hallazgos con archivo y línea |
| `revisor-licencias` | Audita dependencias y modelos | Read, Bash | Lista de infracciones |
| `revisor-producto` | Compara la entrega contra la tabla del punto 0 | Read, Bash | Brechas vs. mercado, priorizadas |
| `eval-runner` | Corre datasets completos y publica reporte | Bash, Read, Write en `evals/reports/` | JSON de métricas y tabla |

- Flujo por tarea: `implementador` -> `verificador` -> si aplica `revisor-privacidad` o `revisor-licencias` -> orquestador integra. Ninguna tarea cierra sin veredicto del verificador.
- Para fases con muchas tareas independientes (Fase 1, Fase 6) el orquestador usa la herramienta Workflow con un pipeline implementar -> verificar por tarea, en paralelo, bajo el límite de 10 agentes por corrida.

## 3. Fases

Cada fase sigue el mismo ciclo: spec (Spec Kit) -> plan técnico -> tareas -> implementación subagéntica con TDD -> verificación -> eval -> `/speckit-converge` -> archivo. Duración estimada total: 14 a 16 semanas con uno o dos desarrolladores supervisando a los agentes.

### Fase 0. Bootstrap del harness y constitución (semana 1)

Objetivo: que el repositorio sea operable por agentes desde el primer commit.

Spec: `openspec/specs/harness/`.

Tareas para subagentes:
1. Inicializar monorepo con npm workspaces (pnpm bloqueado, ver docs/decisiones/2026-10-06-entorno-desarrollo.md) + Vite + TypeScript estricto + Vitest, y `server/` con uv + FastAPI + pytest dentro de Docker.
2. `specify init` y `/speckit-constitution` con los 7 principios. `openspec init`. Instalar Superpowers.
3. Escribir `CLAUDE.md`, los 8 agentes de `.claude/agents/`, las 7 skills y los hooks de la tabla 2.4. Probar cada hook con un caso que deba bloquear.
4. Crear `evals/` con el runner de métricas y un baseline vacío.
5. Pipeline CI (GitHub Actions): typecheck, pruebas, evals rápidos, `licencia-check`, `privacidad-check`.
6. Documento de autorización de tratamiento de datos y aviso de privacidad (borrador para revisión legal). Plantilla de consentimiento para el set de campo.

Verificación de salida: un subagente `implementador` recibe una tarea trivial (añadir un validador de formato de NUIP) y la completa con el ciclo completo sin intervención humana; los hooks bloquean un commit con un fixture que contenga un número real de prueba marcado como tal.

### Fase 1. Núcleo de parsers (semanas 2 a 3)

Objetivo: parsers deterministas, sin UI, publicables como paquete npm (`@lector-cedula/parsers`), con cobertura total de las hipótesis del formato.

Spec: `specs/001-parsers/` con escenarios para cada variante: trama completa con NUL, trama Windows truncada, sin `PubDSK`, bloque fecha-primero, RH `AB` y negativos, Ñ y acentos, segundo nombre ausente, apellidos compuestos, NUIP de 10 y de 11 dígitos, MRZ con cada dígito de control inválido, MRZ con errores OCR-B corregibles, opcional de L1 como DIVIPOL de expedición (hipótesis).

Tareas para subagentes (paralelizables):
1. `pdf417-co`: parser híbrido. Modo offsets cuando la trama es completa; modo patrones (normalizador + localizador + mapeador, enfoque fgardila 2026) como respaldo. Descarta bytes tras el RH. Expone `warnings[]` con cada hipótesis aplicada.
2. `mrz-co`: envuelve `mrz` 5.0.2, añade mapeo colombiano (NUIP del opcional de L2, serial, DIVIPOL hipotético de L1), autocorrección OCR-B solo en zonas numéricas, y los 4 checksums.
3. `divipol`: tabla DIVIPOL construida desde `DIVIPOL.TXT` oficial con script reproducible; join por nombre con DIVIPOLA DANE; pruebas de que Antioquia es 01, Valle 31, Bogotá 16 y consulados 88.
4. `validadores`: coherencia versión-longitud del NUIP, edad mínima, fecha válida, DIVIPOL existente, vencimiento futuro en digital.
5. `fixture-sintetico`: generador de payloads y de imágenes PDF417/MRZ con distorsiones.
6. `salida-json`: esquema normalizado con `version`, `fuente[]`, campos, `confianza_por_campo`, `validaciones[]`, `warnings[]`, y JSON Schema publicado.

Harness específico: pruebas de propiedad (fast-check) que generan personas ficticias, las codifican y verifican ida y vuelta; mutation testing (Stryker) sobre `pdf417-co` con umbral de 85 %.

Verificación de salida: 100 % de los escenarios de la spec en verde; `investigador` cierra cada hipótesis con una nota en `docs/decisiones/` (confirmada, refutada o pendiente de cédula real); `verificador` corre el paquete contra los dos payloads reales públicos y contra 500 sintéticos.

### Fase 2. Captura y calidad on-device, PWA (semanas 4 a 6)

Objetivo: igualar la experiencia de captura de Didit y Scanbot en el navegador.

Spec: `specs/002-captura/` (Spec Kit) y a partir de aquí cambios con OpenSpec.

Tareas:
1. Cámara: getUserMedia a 1920x1080 mínimo, `canvas.drawImage` en iOS (sin ImageCapture), enfoque continuo, linterna opcional, guía de encuadre.
2. Detección de documento: jscanify para el primer frame; DocAligner LC050 (1,7 MB, Jaccard 0,98) o LC100 (4,9 MB, 0,99) en ONNX vía onnxruntime-web, WebGPU con fallback WASM; `warpPerspective` con build recortado de OpenCV.js (unos 2 MB solo core e imgproc). Si la licencia de los pesos de DocAligner no se aclara, un subagente reentrena la misma arquitectura (Apache-2.0) con IDSpace y sintéticos propios.
3. Score de calidad 0-100 en Web Worker a 5-10 fps sobre frames de 640 px: varianza del Laplaciano, porcentaje de píxeles con luminancia mayor o igual a 250 y componentes saturados dentro del cuadrilátero (receta de glare-score, MIT, y del paper arXiv 1911.05189), histograma de exposición, ratio de tamaño del documento. No hay BRISQUE en JS, así que el módulo es propio. Umbrales calibrados con DLC-2021. Auto-captura cuando el score supera el umbral durante N frames. Se captura vídeo, nunca se acepta una imagen subida, porque el vídeo habilita las señales de holograma de la Fase 5.
4. Lectura de códigos en Worker: `barcode-detector` (nativo en Android Chrome, zxing-wasm en el resto). Corregir perspectiva y rotación antes de decodificar (zxing-cpp tolera unos 3 grados). Reintentos con `tryHarder`, `tryRotate` y downscale 0,5 y 0,75. Primer resultado que pase el validador gana.
5. Clasificador de versión: por presencia de PDF417 con `PubDSK`, MRZ `IC`+`COL`, QR sin MRZ, o color dominante para blanca y café.
6. UI de feedback en tiempo real: "acerca", "hay reflejo, inclina", "desenfocado", "listo".

Harness específico: banco de pruebas de captura con vídeos sintéticos (MIDV-2020 y DLC-2021 reproducidos en un `<video>`) que alimentan el pipeline en Playwright; métrica de tiempo hasta resultado válido por vídeo; skill `captura-movil` cargada por cada implementador.

Verificación de salida: 95 % de éxito al primer intento sobre 30 cédulas amarillas reales en 5 modelos de celular (set de campo), mediana menor a 2 s; en iOS Safari al menos 85 % (se sabe que es el punto débil y la Fase 4 lo cubre).

### Fase 3. OCR del anverso, cruce de consistencia y salida comercial (semanas 7 a 8)

Objetivo: campos con confianza y bounding boxes como Verifik e Incode, y consistencia VIZ contra código como Truora.

Spec: cambio OpenSpec `ocr-anverso` sobre `specs/002` y nueva `specs/003-consistencia/`.

Tareas:
1. OCR cliente con `ppu-paddle-ocr` 6.6 (PP-OCRv6 tiny, 6 MB, WebGPU) sobre el recorte corregido. Extracción por plantilla por versión: regiones esperadas de número, apellidos, nombres, fechas, RH, sexo, estatura, expedición. Regex por campo. Fechas a ISO 8601.
2. MRZ por OCR: recorte de la franja inferior, Tesseract.js 7 con `mrz.traineddata` (BSD-3) y, como alternativa a evaluar, PP-OCRv6 sobre la franja. Lo que dé mejor en el dataset tesseractMRZ gana.
3. Cruce de consistencia: número, apellidos, nombres, sexo, fecha de nacimiento entre VIZ y PDF417 o MRZ. Similitud de nombres con distancia normalizada. Salida: `checks[]` con `data_consistency`, `data_validation`, `image_quality`, cada uno con `status` y `reason`, siguiendo el modelo de Entrust y Truora.
4. Estados de resultado: `pending`, `success`, `failure`, `review` con `declined_reason` enumerado.
5. Cédulas blanca y café: OCR de mejor esfuerzo, confianza baja forzada, estado `review`, aviso de documento sin vigencia desde 2010.

Verificación de salida: CER por campo menor o igual a 2 % en amarilla y digital sobre el set de campo; el `revisor-producto` confirma que el JSON cubre los campos de Truora `document_details` y la estructura de confianza de Verifik.

### Fase 4. App Capacitor con ML Kit y servidor de respaldo (semanas 9 a 10)

Objetivo: fiabilidad máxima de PDF417 en iPhone y una API pública al nivel de Didit y Veriff.

Spec: `specs/004-app-nativa/` y `specs/005-api/`.

Tareas:
1. Capacitor 8 con `@capgo/camera-preview` (foco, torch, zoom, captura a fichero) y `@capacitor-mlkit/barcode-scanning` como segundo decodificador para PDF417 degradado. Misma UI que la PWA. Declarar la telemetría de ML Kit en el aviso de privacidad.
2. Servidor FastAPI en Hostinger KVM 2: endpoint de re-decodificación con `zxing-cpp` 3.1.1 a resolución completa, OCR de respaldo con RapidOCR 3.9 (PP-OCRv6 small), procesamiento en memoria, sin disco, sin logs con PII.
3. API: `POST /v1/validations` (crea), `PUT` de imágenes por URL firmada, `GET` de resultado, webhooks firmados con HMAC-SHA256 y reintentos, idempotencia por `Idempotency-Key`, sandbox con fixtures sintéticos, OpenAPI publicado, SDK TypeScript generado.
4. Autorización del titular obligatoria (`user_authorized=true`) en cada validación, como exige Truora.
5. Pruebas de carga con k6: p95 menor a 3 s con 2 peticiones simultáneas en KVM 2; documentar cuándo escalar a KVM 4.

Verificación de salida: tasa de lectura de PDF417 en iPhone igual o mejor que en Android; contrato OpenAPI validado con pruebas de contrato (Schemathesis); el `revisor-privacidad` confirma cero persistencia de imágenes.

### Fase 5. Antifraude (semanas 11 a 13)

Objetivo: document liveness y face match con licencias limpias, al nivel funcional de Microblink Verify y Regula AAC, sabiendo que la autenticidad definitiva solo la da la Registraduría.

Spec: `specs/006-antifraude/`.

Tareas:
1. Document liveness: clasificador MobileNetV3 a ONNX (5 a 10 MB) entrenado con DLC-2021 y MIDV-Holo más capturas propias; clases: original, recaptura de pantalla, fotocopia color, fotocopia gris, impresión. Señales auxiliares: energía de alta frecuencia (moiré), variación del holograma entre frames en la amarilla, uniformidad de color. Se entrena en el servidor y se despliega en cliente.
2. Template matching por versión: posiciones y fuentes esperadas, presencia de holograma en la amarilla y relieve en policarbonato, comparación de layout contra plantilla. En el servidor, CAT-Net (Apache-2.0, pesos CC BY 4.0) para splicing JPEG. ELA y detectores de imagen generada solo como señales débiles, porque FantasyID muestra unos 50 % de falsos negativos en documentos.
3. Face match 1:1 retrato del documento contra selfie: detección con YuNet (OpenCV Zoo, Apache-2.0) o MediaPipe; decisión final en el servidor con facenet-pytorch (MIT, LFW 99,65 %) exportado a ONNX; pre-check en el navegador con FaceX (Apache-2.0, MobileFaceNet 8,4 MB, LFW 99,07 %, proyecto joven de un autor). Umbral calibrado con FAR objetivo.
4. Liveness pasivo de selfie con MiniFASNet (Apache-2.0, ONNX de 1,7 MB) o facenox/face-antispoof-onnx (Apache-2.0, 600 KB cuantizado), más reto activo ligero (giro o parpadeo con landmarks de MediaPipe). Ningún modelo abierto publica APCER y BPCER cross-domain fiables, así que se combinan pasivo, activo y vídeo.
5. Motor de decisión: cada señal aporta un score y una razón; el veredicto es `success`, `review` o `failure` según política configurable; nunca una señal sola rechaza.
6. Conector opcional a agregadores (Didit `col_cedula`, Verifik) y al certificado de vigencia público de la RNEC, desactivados por defecto.

Harness específico: evals con DLC-2021, MIDV-Holo y SIDTD; `eval-runner` publica AUC, FAR y FRR por commit; un `investigador` revisa trimestralmente si aparece un modelo abierto de document liveness mantenido.

Verificación de salida: AUC mayor a 0,95 en DLC-2021 held-out; FRR menor a 2 % con FAR 0,1 % en face match sobre SIDTD; el `revisor-licencias` audita cada peso descargado.

### Fase 6. Multi-documento y cédulas antiguas (semanas 13 a 14)

Objetivo: cobertura de documentos igual a Truora.

Spec: cambios OpenSpec por documento sobre `specs/001` y `specs/003`.

Tareas (una por subagente, en paralelo): tarjeta de identidad 2008 y antigua (PDF417 asumido igual; NUIP de 11 dígitos; menores: aviso reforzado de datos de menores), cédula de extranjería 2017 y 2025 (MRZ y OCR; investigar el 2D del reverso), PPT y PEP (OCR), pasaporte papel y policarbonato (MRZ TD3), contraseña (QR de validación y vigencia de 30 días), cédulas blanca y café (plantillas OCR de mejor esfuerzo).

Verificación de salida: cada documento tiene su spec, sus fixtures sintéticos, sus escenarios en verde y al menos 10 muestras reales en el set de campo.

### Fase 7. Endurecimiento, cumplimiento y lanzamiento (semanas 15 a 16)

Tareas:
1. Telemetría sin datos personales: tasa de éxito, tiempos, caídas al servidor, por versión y modelo de celular.
2. Política de tratamiento publicada, registro de bases en el RNBD si aplica, retención mínima, cifrado en reposo del JSON, registro de accesos. Checklist ISO 27001 como hoja de ruta.
3. Seguridad: revisión del servidor (rate limiting, tamaño de imagen, CSP, dependencias), pruebas de inyección de imágenes y de replay en la API.
4. Benchmark final contra el mercado: el `revisor-producto` llena la tabla del punto 0 con las métricas reales y publica el informe.
5. Publicación del paquete `@lector-cedula/parsers` en npm (hoy no existe ninguno) y documentación de la API.

Verificación de salida: p95 menor a 3 s en la vía principal; 95 % de éxito al primer intento en amarilla y digital en el set de campo; cero hallazgos abiertos de privacidad o licencias.

## 4. Cadencia y gobierno

- **Diario**: el orquestador abre la sesión con el estado de `openspec/changes/`, lanza subagentes por tarea y cierra con `/speckit-converge` o `/opsx:verify`.
- **Por PR**: pruebas, evals rápidos, `licencia-check`, `privacidad-check` y veredicto del `verificador`. Revisión humana solo de la spec y del reporte de evals, no del diff completo.
- **Por fase**: eval completo, `revisor-producto` contra el benchmark, actualización de "Errores pasados" en `CLAUDE.md`, archivo de los cambios OpenSpec.
- **Humano en el bucle** solo en: aprobación de specs, consentimientos del set de campo, decisiones de licencias, política de decisión antifraude y asesoría legal.

## 5. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Los offsets del PDF417 no cubren alguna tirada | Parser híbrido con warnings; set de campo amplio desde la Fase 1; cada hipótesis con prueba |
| PDF417 en iOS Safari por WASM falla con códigos degradados | Capacitor con ML Kit en Fase 4; re-decode en servidor a resolución completa |
| No existe modelo abierto de document liveness | Entrenamiento propio con DLC-2021 y MIDV-Holo; veredicto por combinación de señales |
| Licencias AGPL o no comerciales se cuelan | Hook `licencia-check` en instalaciones y commits |
| Datos reales terminan en el repositorio | Hook `privacidad-check`, set de campo fuera del repo y cifrado |
| La SIC endurece el tratamiento biométrico (PL 282/2026) | Face match y liveness opcionales y con autorización reforzada; seguimiento legal trimestral por el `investigador` |
| Autenticidad del documento no es verificable sin RNEC | Se comunica explícitamente; conector opcional a agregadores |
| Proyectos abiertos de referencia sin mantenimiento | Se copia la lógica bajo su licencia con pruebas propias; nunca dependencia directa |

## 6. Primer paso concreto

Ejecutar la Fase 0 en este mismo directorio. El orquestador corre `specify init`, `openspec init`, instala Superpowers, crea los agentes, skills y hooks descritos en 2.3 y 2.4, y como prueba de humo delega al `implementador` el validador de formato de NUIP con su spec, sus pruebas y su verificación.
