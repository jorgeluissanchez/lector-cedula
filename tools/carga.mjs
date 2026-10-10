#!/usr/bin/env node
// Control de carga de la máquina de desarrollo (decisión del usuario, 2026-10-10: tope de CPU 70 %).
// Uso:
//   node tools/carga.mjs             -> imprime CPU y RAM; código 1 si supera el tope.
//   node tools/carga.mjs --esperar   -> espera (hasta 15 min) a que la CPU baje del umbral de arranque.
// Umbrales: CARGA_TOPE (70) para medir, CARGA_ARRANQUE (45) para arrancar una tarea pesada.
import os from "node:os";

const TOPE = Number(process.env.CARGA_TOPE ?? 70);
const ARRANQUE = Number(process.env.CARGA_ARRANQUE ?? 45);
const RAM_TOPE = Number(process.env.CARGA_RAM_TOPE ?? 80);

function tiempos() {
  let ocio = 0;
  let total = 0;
  for (const c of os.cpus()) {
    const t = c.times;
    ocio += t.idle;
    total += t.user + t.nice + t.sys + t.irq + t.idle;
  }
  return { ocio, total };
}

async function medir(ms = 3000) {
  const a = tiempos();
  await new Promise((r) => setTimeout(r, ms));
  const b = tiempos();
  const cpu = 100 * (1 - (b.ocio - a.ocio) / (b.total - a.total));
  const ram = 100 * (1 - os.freemem() / os.totalmem());
  return { cpu: Math.round(cpu), ram: Math.round(ram) };
}

const esperar = process.argv.includes("--esperar");
const limite = Date.now() + 15 * 60_000;
for (;;) {
  const m = await medir();
  const linea = `CPU ${m.cpu}% (tope ${TOPE}%) | RAM ${m.ram}% (tope ${RAM_TOPE}%)`;
  if (!esperar) {
    console.log(linea);
    process.exit(m.cpu > TOPE || m.ram > RAM_TOPE ? 1 : 0);
  }
  if (m.cpu <= ARRANQUE && m.ram <= RAM_TOPE) {
    console.log(`${linea} -> se puede arrancar`);
    process.exit(0);
  }
  if (Date.now() > limite) {
    console.log(`${linea} -> sigue alta tras 15 min; no arranques la tarea pesada`);
    process.exit(1);
  }
  console.log(`${linea} -> esperando`);
  await new Promise((r) => setTimeout(r, 20_000));
}
