#!/usr/bin/env node
// MOT-18: regenera THIRD_PARTY_NOTICES y LICENSE de @lector-cedula/servidor y @lector-cedula/motor (los comprueba
// tools/test/avisos-motor.test.mjs). Uso: node tools/avisos-motor.mjs
import { copyFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { textoAvisosTercerosMotor } from "./avisos-terceros.mjs";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
for (const [nombre, dir] of [
  ["@lector-cedula/servidor", "servidor"],
  ["@lector-cedula/motor", "motor"],
]) {
  const destino = join(RAIZ, "packages", dir);
  writeFileSync(join(destino, "THIRD_PARTY_NOTICES"), textoAvisosTercerosMotor(nombre));
  copyFileSync(join(RAIZ, "LICENSE"), join(destino, "LICENSE"));
}
