# Design: deteccion-fraude

## Contexto

Fase 5 de `PLAN.md` (antifraude de documento). Este cambio cubre solo document liveness y consistencia; face match y liveness de selfie quedan fuera. Constitución: principios II (pruebas), III (privacidad), IV (licencias), V (ningún generativo decide), VI (hipótesis de formato).

## Listón comercial (skill `benchmark-comercial`)

| Proveedor | Qué entrega | Meta que fijamos |
|---|---|---|
| Microblink BlinkID Verify | `original_document_present`, pantalla, fotocopia, en el dispositivo | Mismos tres motivos en el dispositivo (FRA-07, FRA-08) |
| Regula Document Reader | Screen/photocopy detection, chequeos de plantilla y MRZ | Consistencia de datos y dígitos de control (FRA-11) |
| Veriff, Didit, Truora | Veredicto con razones, en servidor, < 2-3 s | Señal con motivos explicables, p95 de evaluación <= 300 ms escritorio (FRA-12) |

Los proveedores no publican APCER/BPCER comparables; nuestras metas se fijan con ISO/IEC 30107-3 (FRA-14, FRA-15) y se declaran como propias, no como paridad demostrada.

## Decisiones

1. **Heurísticas primero (Fase A), modelo opcional (Fase B).** Las heurísticas son explicables, sin licencias de pesos y sin datos de entrenamiento. El modelo solo suma una probabilidad.
2. **Implementación propia en TypeScript** de FFT 2D (radix-2 sobre 256x256), DCT 8x8, conversión HSV e histogramas. Sin OpenCV.js para no añadir 2 MB; si se necesita OpenCV.js para el cuadrilátero se reutiliza el de `packages/capture`.
3. **Entrada**: `{ frames: FrameRGBA[] (1 a 5), cuadrilatero, tipo: "amarilla" | "digital", datos?: { pdf417?, mrz?, visible? }, reloj: () => Date }`. Los frames llegan del Worker de captura ya existente; el detector rectifica el recorte a 1024 px.
4. **Agregación** (FRA-06): OR probabilístico ponderado. Pesos por defecto: pantalla 1, fotocopia 1, recorte 0,8, edicion 0,5, inconsistencia 1 (fecha-imposible, municipio-inexistente, digito-control) o 0,6 (vencido, nuip-fuera-de-rango).
5. **Política** (FRA-04, FRA-05): `accion = bloquear` solo con `bloquearSi`; en otro caso `revisar` si `nivel != bajo`. La política se lee de la configuración de la instancia (en la PWA autoalojada, de `config.json` precacheado; en el SDK, del constructor).
6. **Hipótesis de formato**: H-FRA-1 (región y comportamiento del holograma de la amarilla), H-FRA-2 (rangos de NUIP válidos por época de expedición), H-FRA-3 (radio de esquina de la digital en policarbonato). Se registran como `pendiente` en `docs/decisiones/hipotesis-formato.md` en la tarea 1.2 y se exponen en `warnings`.
7. **Datos sintéticos**: el generador corre en Docker (Python con augraphy MIT y kornia Apache-2.0) o en Node con código propio; simula rejilla de subpíxeles RGB, moiré por remuestreo, gamma de pantalla, reflejo especular, banding; para fotocopia, desaturación, tramado ordenado/difusión y textura de papel; recorte con esquinas rectas; edición con parche recomprimido.
8. **Candidatos de Fase B** (a auditar por `revisor-licencias`, no aprobados): MobileNetV3-Small entrenado por nosotros con IDNet-2025, IDSpace y FantasyID (CC BY 4.0) y sintéticos propios. DLC-2021 y MIDV-Holo son CC BY-SA 2.5: share-alike sobre pesos derivados, requiere decisión (P2). Prohibidos: TruFor, DocXPand-25k, pyiqa, cualquier peso RAIL o no comercial.
9. **Sin persistencia**: igual que el Worker lector (OFF-11): buffers a cero tras evaluar.

10. **Forma de `SenalRiesgo`** (FRA-01): `{ version: 1; puntaje: number /* entero 0-100 */; nivel: "bajo" | "medio" | "alto"; motivos: { codigo: "pantalla" | "fotocopia" | "recorte" | "edicion" | "inconsistencia"; puntaje: number /* 0-1 */; detalle: string /* lista cerrada */ }[]; accion: "continuar" | "revisar" | "bloquear"; senalesOmitidas: string[]; fase: "heuristica" | "heuristica+modelo"; warnings: string[] }`.

## Riesgos

- Heurísticas de moiré sensibles a la resolución de la cámara: se mide con escenas metamórficas (FRA-07) y con el set de campo.
- Sintéticos optimistas: metas reales separadas (FRA-15) y el revisor-producto no acepta cierre de Fase B solo con sintéticos.
- La autenticidad definitiva solo la da la Registraduría; se declara en el aviso.

## Pruebas

Comandos abreviados: `U` = `npx vitest run packages/fraud`; `T` = `npm run typecheck`; `B` = `npx vitest run --project fraud-browser`; `M` = `npm run test:mutacion` (mutate incluye `packages/fraud/src/**`); `E(x)` = `npx playwright test e2e/fraude/x.spec.ts`; `EV` = `npm run eval:fraude`; `G` = `npm run fraude:sinteticos`; `L` = `npm run check:licencias`; `P` = `npm run check:privacidad`; `C` = `npm run check`.

| Requisito | Tipo de prueba | Herramienta | Comando | Umbral |
|---|---|---|---|---|
| FRA-01 | Unitaria (escenarios literales) | Vitest | `U` | 100 % escenarios verdes |
| FRA-01 | Contrato de tipos | Vitest + `@ts-expect-error` | `T`, `U` | 0 errores inesperados |
| FRA-01 | Propiedad "no lanza" | fast-check | `U` | numRuns >= 1000, 0 excepciones |
| FRA-02 | E2E offline con cámara simulada | Playwright | `E(offline)` | Verde en Chromium y Pixel 7; 0 peticiones externas |
| FRA-03 | Unitaria (buffers a cero, JSON sin PII) | Vitest | `U` | 100 % verdes |
| FRA-03 | Seguridad estática de privacidad | `privacidad-check` | `P` | Código 0 |
| FRA-04 | Unitaria de política | Vitest | `U` | 100 % verdes |
| FRA-04 | Propiedad: sin `bloquearSi` nunca `bloquear` | fast-check | `U` | numRuns >= 1000 |
| FRA-05 | Unitaria y propiedad de validación de config | Vitest, fast-check | `U` | numRuns >= 1000; bordes 39/40/69/70 |
| FRA-06 | Unitaria literal y propiedades (monotonía, determinismo, rango 0-100) | Vitest, fast-check | `U` | numRuns >= 1000; proporción útil > 50 % |
| FRA-06 | Mutación | Stryker | `M` | >= 85 % por archivo (break 80) |
| FRA-07 | Unitaria sobre sintéticos y metamórfica | Vitest, generador | `U` | Escenarios verdes; auténticos con distorsión < 0,4 |
| FRA-07 | Eval por especie | corredor `evals/runners/fraude` | `EV` | APCER máx <= 10 % a BPCER <= 5 % |
| FRA-08 | Unitaria, metamórfica y eval | Vitest, corredor | `U`, `EV` | Igual que FRA-07; `warnings` contiene H-FRA-1 |
| FRA-09 | Unitaria con cuadriláteros literales y propiedad de invariancia a rotación | Vitest, fast-check | `U` | numRuns >= 1000 |
| FRA-10 | Unitaria y eval (sin meta) | Vitest, corredor | `U`, `EV` | Escenario verde; métricas reportadas |
| FRA-11 | Unitaria con literales y reloj inyectado; propiedad (fechas válidas generadas no producen `fecha-imposible`) | Vitest, fast-check | `U` | numRuns >= 1000 |
| FRA-11 | Casos de errores pasados (Ñ, RH `AB+`, apellidos) no producen inconsistencia | Vitest | `U` | 100 % verdes |
| FRA-11 | Mutación | Stryker | `M` | >= 85 % |
| FRA-12 | Rendimiento en navegador real | Vitest browser mode | `B` | p95 <= 300 ms Chromium; <= 800 ms en E2E Pixel 7 |
| FRA-12 | Presupuesto de bundle | Vitest sobre `apps/pwa/dist` | `U` | <= 153600 bytes gzip |
| FRA-13 | Unitaria del generador (determinismo, manifiesto) | Vitest (`tools/test`) | `npx vitest run tools` | sha256 idénticos; `"sintetico": true` |
| FRA-13 | Licencias del generador | `licencia-check` | `L` | Código 0 |
| FRA-14 | Unitaria del corredor (literales, regresión) | Vitest | `npx vitest run evals` | Escenarios verdes |
| FRA-14 | Mutación del corredor | Stryker | `M` | >= 85 % |
| FRA-15 | Unitaria del esquema de reporte | Vitest | `npx vitest run evals` | Rechaza claves con PII |
| FRA-16 | Unitaria con sesión ONNX inyectada; golden de salidas del modelo | Vitest, onnxruntime-node | `U` | Salida heurística idéntica sin modelo; golden exacto a 1e-4 |
| FRA-16 | Licencia del modelo | `licencia-check` + `revisor-licencias` | `L` | Manifiesto completo; aprobación escrita |
| FRA-16 | Eval del modelo | corredor | `EV` | AUC >= 0,95 en held-out (matriz `packages/fraud`); APCER/BPCER reportados |
| FRA-17 | E2E con cámara simulada | Playwright (agentes planner/generator/healer) | `E(resultado-riesgo)` | Verde en Chromium y Pixel 7 |
| FRA-17 | Accesibilidad | @axe-core/playwright | `E(accesibilidad)` | 0 violaciones serious o critical |
| Todos | Puerta completa | npm | `C` | Código 0 |
