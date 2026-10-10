// Vitest acotado para la mutación del modelo backend propio (sdk-integracion, fase B): decidir-front, verificacion y
// maquina con sus pruebas de packages/web/test/backend.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { pool: "forks", include: ["packages/web/test/backend/sdk-{45,46,48,57}-*.test.ts", "packages/web/test/sdk-27-28-maquina.test.ts"] },
});
