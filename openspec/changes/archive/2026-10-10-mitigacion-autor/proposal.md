# mitigacion-autor

## Por qué

El autor publica una librería MIT, no vende servicios ni aloja datos de terceros. La demo pública y el repositorio deben dejarlo claro para reducir su riesgo legal: que nadie use su cédula real en la demo, que quien despliega es el Responsable del tratamiento (Ley 1581 de 2012) y que los canales públicos (issues, seguridad) no reciban datos personales.

## Qué cambia

- PWA: opción de compilación `VITE_DEMO` con aviso visible y no ocultable en inicio y CSP `connect-src 'self'`; la imagen Docker de la PWA la activa por defecto.
- README raíz: descargo, responsabilidad de quien despliega y uso aceptable.
- `SECURITY.md`, `DISCLAIMER.md`, README mínimo en cada paquete publicable y plantillas de issues.

## Impacto

`apps/pwa` (config, vite.config, App, Dockerfile), `docs/despliegue`, documentos de raíz, `packages/*/README.md`, `.github/ISSUE_TEMPLATE`, `playwright.config.ts` (proyecto `demo-chromium`), pruebas nuevas.
