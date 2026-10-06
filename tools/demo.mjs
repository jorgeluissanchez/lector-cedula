#!/usr/bin/env node
// Demostración: genera una cédula SINTÉTICA (persona ficticia, NUIP 9999...) y la lee con los parsers.
// Uso: npm run demo
import { PERSONA_BASE, generarMrzTd1, generarPdf417 } from "../packages/fixtures/dist/index.js";
import * as parsers from "../packages/parsers/dist/index.js";

const p = PERSONA_BASE;
console.log(`Persona ficticia: ${p.primerNombre} ${p.segundoNombre} ${p.primerApellido} ${p.segundoApellido}, NUIP ${p.nuip}\n`);

console.log("=== Cédula digital: zona MRZ del reverso ===");
const mrz = generarMrzTd1(p);
console.log(mrz.lineas.join("\n"));
const r = parsers.parsearMrzCedulaDigital(mrz.lineas, { fechaReferencia: new Date().toISOString().slice(0, 10) });
console.table({ ...r.campos, "dígitos de control válidos": r.valido });

console.log("\n=== Cédula amarilla: código de barras PDF417 (bytes crudos) ===");
const pdf = generarPdf417(p);
console.log(`${pdf.bytes.length} bytes; los bytes biométricos se descartan sin leerse.`);
if (typeof parsers.parsearPdf417Amarilla === "function") {
  const x = parsers.parsearPdf417Amarilla(pdf.bytes, { divipol: parsers.buscarDivipol });
  const c = x.campos ?? x;
  const lugar = parsers.buscarDivipol(`${c.codigoDepartamentoNacimiento}${c.codigoMunicipioNacimiento}`);
  console.table({ ...c, lugarNacimiento: lugar.encontrado ? `${lugar.municipio}, ${lugar.departamento}` : "desconocido" });
} else {
  console.log("(parser PDF417 aún en construcción)");
}
