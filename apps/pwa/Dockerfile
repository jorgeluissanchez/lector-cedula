# PWA autoalojada: compila el monorepo y sirve apps/pwa/dist con nginx. Contexto de build: raíz del repositorio.
# Mismo comando de build que vercel.json (despliegue-produccion).
FROM node:24-bookworm-slim AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/pwa/package.json apps/pwa/
COPY packages/parsers/package.json packages/parsers/
COPY packages/capture/package.json packages/capture/
COPY packages/fixtures/package.json packages/fixtures/
RUN npm ci --ignore-scripts
COPY . .
# El modelo MRZ se descarga con verificación SHA-256 (models/manifest.json); compilar parsers antes que la PWA.
RUN npm run modelos:mrz && npx tsc -b packages/parsers && npm run build -w @lector-cedula/pwa

FROM nginx:1.29-alpine
COPY apps/pwa/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/pwa/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
