// SDK-56 en E2E (B.7): el reparto de chunks de los ejemplos con backend propio separa el SDK de React y de la app, para
// medir el presupuesto del modo back solo sobre el SDK. Rutas literales de Windows y POSIX.
import { describe, expect, it } from "vitest";
import { esSdk, salidaConChunksSdk } from "../../vite-chunks-sdk.mjs";

const reparto = salidaConChunksSdk().manualChunks as (id: string) => string | undefined;

describe("SDK-56 reparto de chunks del ejemplo", () => {
  it("SDK-56 el núcleo, la captura y el protocolo van al chunk sdk (Windows y POSIX)", () => {
    for (const id of [
      "C:\\Users\\x\\Hector\\packages\\web\\dist\\controlador.js",
      "/repo/packages/capture/dist/calidad/ligera.js",
      "/repo/packages/protocolo/dist/index.js",
    ]) {
      expect(esSdk(id), id).toBe(true);
      expect(reparto(id), id).toBe("sdk");
    }
  });

  it("SDK-56 React, react-dom, scheduler y el adaptador @lector-cedula/react no cuentan como SDK", () => {
    expect(reparto("/repo/node_modules/react/cjs/react.production.js")).toBe("react");
    expect(reparto("C:\\repo\\node_modules\\react-dom\\cjs\\react-dom-client.production.js")).toBe("react");
    expect(reparto("/repo/node_modules/scheduler/index.js")).toBe("react");
    expect(esSdk("/repo/packages/react/dist/index.js")).toBe(false);
    expect(reparto("/repo/packages/react/dist/index.js")).toBeUndefined();
  });

  it("SDK-56 el código de la app y otras dependencias no van al chunk sdk", () => {
    expect(reparto("/repo/examples/backend-express/src/main.tsx")).toBeUndefined();
    expect(reparto("/repo/node_modules/otra/packages/web/x.js")).toBeUndefined();
    expect(reparto("/repo/node_modules/react-is/index.js")).toBeUndefined();
  });
});
