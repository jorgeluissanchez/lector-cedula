## 0. Investigación y hipótesis

- [ ] 0.1 Investigador: confirmar con especímenes públicos de Migración Colombia (CE 2017 y CE 2025) las hipótesis CE01 a CE07 y T01, sin datos reales; registrar evidencia en `docs/decisiones/`. Cubre: OD-11, OD-12, OD-13, OD-33. Tipos: ninguno (documental). Verificación: `openspec validate otros-documentos --strict` tras actualizar estados.

## 1. Parsers puros (`packages/parsers`)

- [x] 1.1 Generador sintético de TD3 y TD1 genérico en `fixture-sintetico` (los literales de las specs como casos fijos). Ubicado en `packages/parsers/test/ayudas/generador-mrz-icao.ts` para no alterar la interfaz estable de `@lector-cedula/fixtures` (FX-02); se prueba por round-trip en `packages/parsers/test/mrz-icao.propiedades.test.ts`. Cubre: OD-01, OD-02, OD-10. Tipos: unitaria del generador y propiedad (dígitos válidos por construcción). Verificación: `npx vitest run packages/fixtures`.
- [x] 1.2 `paises-icao.ts` con 249 alfa-3, especiales ICAO y `UTO` espécimen. Cubre: OD-04. Tipos: unitaria y mutación. Verificación: `npx vitest run packages/parsers/test/paises-icao` y `npm run test:mutacion`.
- [x] 1.3 Pruebas en rojo y `parsearMrzTd3`. Cubre: OD-01, OD-01a, OD-02, OD-03, OD-05. Tipos: unitaria, propiedad (nunca lanza, round-trip), mutación. Verificación: `npx vitest run packages/parsers/test/mrz-td3` y `npm run test:mutacion`.
- [ ] 1.4 Prueba diferencial contra `cheminfo/mrz` como devDependency (requiere 5.1 antes). Cubre: OD-02. Tipos: diferencial. Verificación: `npx vitest run packages/parsers/test/mrz-td3.diferencial`.
- [x] 1.5 Pruebas en rojo y `parsearMrzTd1` genérico, sin cambiar `parsearMrzCedulaDigital`. Cubre: OD-10, OD-10a. Tipos: unitaria, propiedad, regresión, mutación. Verificación: `npx vitest run packages/parsers` y `npm run test:mutacion`.
- [x] 1.6 `clasificarDocumento` (CC, CE, TI, pasaporte, no admitido) con warnings de hipótesis. Cubre: OD-11, OD-12, OD-33. Tipos: unitaria y mutación. Verificación: `npx vitest run packages/parsers/test/clasificar-documento`.

## 2. Captura y lectura (`packages/capture`)

- [x] 2.1 Presencia con `"mrz-td1"` / `"mrz-td3"` y alias `"mrz"`. El Worker de calidad los envía con la opción `contenidoTd: true` (la PWA); sin ella conserva la forma heredada `"mrz"`/`null` para `@lector-cedula/web`, aún no migrado. Pruebas: `packages/capture/test/lectura/od-20-presencia-td3.test.ts` (presencia, Worker y rendimiento) y `apps/pwa/test/od-otros-documentos.test.ts` (pista TD3 en la secuencia y el cliente). Cubre: OD-20. Tipos: unitaria y rendimiento. Verificación: `npx vitest run packages/capture/test/lectura/od-20 apps/pwa/test/od-otros-documentos`.
- [x] 2.2 Lector MRZ con `formato: "td3"` y plan de giros. Cubre: OD-21. Tipos: integración con OCR real y metamórficas. Verificación: `npx vitest run packages/capture/test/mrz --maxWorkers=2`.
- [x] 2.3 `leerDocumento` con salida unificada, orden por pista, CE sin 2D. Cubre: OD-13, OD-21, OD-22, OD-22a. Tipos: unitaria con espías. Verificación: `npx vitest run packages/capture/test/lectura`.
- [x] 2.4 Parámetro `admitirTarjetaIdentidad` y regla de edad OFF-24b. Cubre: OD-30a, OD-31, OD-32, OD-32a, OD-33. Tipos: unitaria de frontera en ambos valores. Verificación: `npx vitest run packages/capture/test/lectura`.
- [x] 2.5 Presupuesto del respaldo MRZ tras una pista PDF417 (4 llamadas OCR, solo TD1) y `respaldoDe` en el mensaje y la PWA. Cubre: OFF-27c. Tipos: unitaria con espías y E2E. Verificación: `npx vitest run packages/capture/test/lectura/off-27-pista packages/capture/test/mrz/lector.test.ts apps/pwa/test/off-27-29` y `npx playwright test e2e/lectura/errores.spec.ts --project=lectura-chromium --workers=1`.

## 3. Evals

- [ ] 3.1 Golden sintético por tipo (pasaporte COL, pasaporte extranjero, CE, TI) y distorsiones del renderizador para TD3. Cubre: OD-21. Tipos: eval. Verificación: `npm run eval:quick` y `npm run eval:mrz-imagen` (sin regresión; el baseline solo se amplía, nunca se baja).

## 4. Servidor (`server/`, Docker)

- [ ] 4.1 `LECTOR_ADMITIR_TI` en `config.py` y `GET /v1/capacidades`. Cubre: OD-30, OD-30a. Tipos: unitaria pytest. Verificación: `docker compose -f server/compose.yaml run --rm pruebas`.
- [ ] 4.2 Contrato unificado (`tipoDocumento`, `fuente`, `tipo` obsoleto), 422 `autorizacion-representante-requerida`, retención 0 y webhook sin campos para menores. Cubre: OD-22, OD-22a, OD-34, OD-34a. Tipos: unitaria, propiedad (Hypothesis), contrato Schemathesis, ZAP. Verificación: `docker compose -f server/compose.yaml run --rm pruebas`.

## 5. Revisiones de dependencias y licencias

- [ ] 5.1 `revisor-licencias`: `cheminfo/mrz` como devDependency y fuente de la tabla de países y nombres en español. Cubre: OD-02, OD-04. Tipos: licencias. Verificación: `npm run check:licencias`.

## 6. PWA (`apps/pwa`)

- [x] 6.1 `VITE_ADMITIR_TI` con validación en build. Cubre: OD-30. Tipos: unitaria. Verificación: `npx vitest run apps/pwa/test/config`.
- [x] 6.2 Etiquetas por documento, mensajes nuevos y guía ID-3. Cubre: OD-23. Tipos: unitaria, E2E y accesibilidad (planner, generator, healer de Playwright; vídeo `pasaporte-col-1080p`). Verificación: `npm run test:e2e` (E2E `e2e/lectura/pasaporte.spec.ts` en verde en `lectura-chromium`; la guía ID-1 admite la página ID-3 del vídeo sin cambios).
- [ ] 6.3 (parcial: pantalla, casilla, enlace condicionado y pruebas unitarias hechos en `apps/pwa`; falta el E2E con `ti-amarilla-1080p` y una segunda compilación con `VITE_ADMITIR_TI=true`, que requiere la plantilla de 7.1) Pantalla `autorizacion-representante` y enlaces legales condicionados. Cubre: OD-34b, OD-35. Tipos: E2E y accesibilidad (vídeo `ti-amarilla-1080p`, dos builds). Verificación: `npm run test:e2e`.

## 7. Legal y privacidad

- [ ] 7.1 Agente legal: `docs/legal/autorizacion-representante-ti.md`, sección de menores en `aviso-privacidad-app.md` y `politica-tratamiento-datos.md`, entrada en `CHECKLIST-CUMPLIMIENTO.md` y pregunta en `PARA-EL-ABOGADO.md`. Cubre: OD-35. Tipos: unitaria de presencia de textos. Verificación: `npx vitest run tools/test/legal-ti.test.mjs`.
- [ ] 7.2 `privacidad-check`: dependencias de QR/NFC prohibidas y lista de números sintéticos declarados. Cubre: OD-40. Tipos: unitaria con casos que deben fallar. Verificación: `npx vitest run tools/test` y `npm run check:privacidad`.
- [ ] 7.3 `revisor-privacidad` sobre captura, servidor, datos de menores y retención. Cubre: OD-34, OD-40. Tipos: revisión con evidencia de `npm run check:privacidad`. Verificación: informe sin hallazgos críticos abiertos.

## 8. Cierre

- [ ] 8.1 En paralelo: `verificador` (spec contra código, otro agente distinto del implementador) y `pr-test-analyzer` (calidad de pruebas). Cubre: todos. Tipos: verificación. Verificación: `npm run check` verde y `openspec validate otros-documentos --strict`. Hallazgos críticos del analizador abren un cambio nuevo.
- [ ] 8.2 `eval-runner` y `revisor-producto` contra el punto 8 del benchmark. Cubre: OD-21. Tipos: eval. Verificación: `npm run eval`.
