# PWA autoalojada: compila el monorepo y sirve apps/pwa/dist con nginx. Contexto de build: raíz del repositorio.
# Mismo comando de build que vercel.json (despliegue-produccion).
FROM node:24-bookworm-slim AS build
WORKDIR /repo
# Todo el repositorio antes de npm ci: la PWA depende de varios workspaces (capture, fraud, web, protocolo…)
# y una lista a mano se desactualiza (la demo dejó de desplegar al añadir @lector-cedula/web).
COPY . .
RUN npm ci --ignore-scripts
# mitigacion-autor (MA-04): esta imagen es la demo pública; aviso de demostración y CSP connect-src 'self'.
# Para una instancia propia: --build-arg VITE_DEMO=false.
ARG VITE_DEMO=true
ENV VITE_DEMO=${VITE_DEMO}
# El modelo MRZ se descarga con verificación SHA-256 (models/manifest.json); compilar parsers y protocolo (sus exports apuntan a dist) antes que la PWA.
RUN npm run modelos:mrz && npx tsc -b packages/parsers packages/protocolo && npm run build -w @lector-cedula/pwa

FROM nginx:1.29-alpine
COPY apps/pwa/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/pwa/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
