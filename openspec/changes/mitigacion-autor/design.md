# Diseño

1. `leerDemo` sigue el patrón de `leerAdmitirTi` (OD-30): validación estricta en `vite build`.
2. `__DEMO__` se inyecta con `define`; el aviso es un `<section role="note">` sin botones, primer hijo del panel de `inicio`.
3. La PWA no tiene ningún envío a servidor; en demo se refuerza con una meta CSP `connect-src 'self'` inyectada por `transformIndexHtml` (útil cuando el servidor no pone la CSP de `nginx.conf`, p. ej. `vite preview`).
4. El E2E usa un segundo build en `dist-demo` servido en el puerto 4175 para no pisar `dist`.
5. El Dockerfile de la PWA es la imagen de la demo en Dokploy: `ARG VITE_DEMO=true`; quien despliega en producción pasa `--build-arg VITE_DEMO=false`.
