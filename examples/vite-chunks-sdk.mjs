// sdk-integracion B.7 (SDK-56 en E2E, decisión del orquestador 2026-10-10): el presupuesto del modo back se mide solo
// sobre los chunks del SDK, sin React ni el código de la app. Este reparto de Rollup para los ejemplos con backend
// propio pone todo el SDK que usa la app (núcleo, dependencias por omisión, verificación, captura ligera y protocolo)
// en un solo chunk `assets/sdk-*.js`, igual que la medición de B.6 (un solo paquete de esbuild), y React en
// `assets/react-*.js`. Lo que la app no importa (la lectura headless de `leerDocumento`) queda fuera por tree-shaking.

/** Módulo del SDK: cualquier paquete del monorrepo salvo el adaptador de React (va con React, fuera del presupuesto). */
export function esSdk(id) {
  const ruta = id.replaceAll("\\", "/");
  return /\/packages\/(?!react\/)[^/]+\//u.test(ruta) && !ruta.includes("/node_modules/");
}

const esReact = (id) => /\/node_modules\/(react|react-dom|scheduler)\//u.test(id.replaceAll("\\", "/"));

/** Opciones de `build.rollupOptions.output` para los ejemplos con backend propio. */
export function salidaConChunksSdk() {
  return {
    manualChunks(id) {
      if (esReact(id)) return "react";
      if (esSdk(id)) return "sdk";
      return undefined;
    },
  };
}
