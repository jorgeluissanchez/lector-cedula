// Generador sintético de MRZ ICAO 9303 TD3 (pasaporte) y TD1 genérico (CE) para eval:mrz-imagen (cambio
// otros-documentos, OD-21, tarea 3.1). Solo personas ficticias: nombres hechos de sílabas al azar con el PRNG
// mulberry32 de @lector-cedula/fixtures; números aleatorios. Dígitos de control con implementación propia.
import { crearPrng } from "../../packages/fixtures/dist/prng.js";

const ALFABETO = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Dígito de control ICAO 9303: `0-9` su cifra, `A-Z` 10 a 35, `<` 0; pesos 7, 3, 1; módulo 10. */
export function digitoIcao(campo) {
  let suma = 0;
  for (let i = 0; i < campo.length; i++) {
    const c = campo[i];
    const v = c === "<" ? 0 : ALFABETO.indexOf(c);
    if (v < 0) throw new Error(`carácter fuera del alfabeto MRZ: ${c}`);
    suma += v * [7, 3, 1][i % 3];
  }
  return String(suma % 10);
}

function relleno(texto, n) {
  if (texto.length > n) throw new Error(`"${texto}" no cabe en ${n}`);
  return texto + "<".repeat(n - texto.length);
}

const aMrz = (t) => t.replaceAll(" ", "<");

/** Dos líneas de 44 con los cinco dígitos de control correctos. */
export function generarTd3(d) {
  const l1 = relleno(relleno(d.codigo ?? "P", 2) + relleno(d.emisor, 3) + aMrz(d.apellidos) + "<<" + aMrz(d.nombres), 44);
  const numero = relleno(d.numero, 9);
  const opcional = relleno(d.opcional, 14);
  const parcial =
    numero + digitoIcao(numero) + relleno(d.nacionalidad, 3) + d.nacimiento + digitoIcao(d.nacimiento) + d.sexo + d.vencimiento + digitoIcao(d.vencimiento) + opcional + digitoIcao(opcional);
  const compuesto = parcial.slice(0, 10) + parcial.slice(13, 20) + parcial.slice(21, 43);
  return [l1, parcial + digitoIcao(compuesto)];
}

/** Tres líneas de 30 con los cuatro dígitos de control correctos. */
export function generarTd1(d) {
  const numero = relleno(d.numero, 9);
  const l1 = relleno(d.codigo, 2) + relleno(d.emisor, 3) + numero + digitoIcao(numero) + relleno(d.opcional1, 15);
  const l2 = d.nacimiento + digitoIcao(d.nacimiento) + d.sexo + d.vencimiento + digitoIcao(d.vencimiento) + relleno(d.nacionalidad, 3) + relleno(d.opcional2, 11);
  const compuesto = l1.slice(5, 30) + l2.slice(0, 7) + l2.slice(8, 15) + l2.slice(18, 29);
  return [l1, l2 + digitoIcao(compuesto), relleno(aMrz(d.apellidos) + "<<" + aMrz(d.nombres), 30)];
}

const SILABAS = ["BA", "CA", "DA", "FE", "GO", "LA", "MA", "NO", "PE", "RI", "SA", "TO", "VE", "ZU", "LU", "MI", "RO", "TA"];
const EMISORES_TD3 = ["COL", "COL", "COL", "ESP", "VEN", "MEX", "ECU", "PER", "USA", "D", "UTO"];
const NACIONALIDADES_CE = ["VEN", "ECU", "PER", "ESP", "MEX", "ARG", "USA"];

function azar(semilla) {
  const r = crearPrng(semilla).siguiente;
  const entero = (min, max) => min + Math.floor(r() * (max - min + 1));
  const elegir = (lista) => lista[entero(0, lista.length - 1)];
  const palabra = () => Array.from({ length: entero(2, 3) }, () => elegir(SILABAS)).join("");
  const cifras = (n) => Array.from({ length: n }, () => String(entero(0, 9))).join("");
  const alfanum = (n) => Array.from({ length: n }, () => ALFABETO[entero(0, 35)]).join("");
  const fecha = (a0, a1) => [entero(a0, a1), entero(1, 12), entero(1, 28)].map((n) => String(n).padStart(2, "0")).join("");
  return { entero, elegir, palabra, cifras, alfanum, fecha };
}

/** Pasaporte ficticio `i` (semilla base + i): colombianos (número `AA` + 7 cifras y NUIP opcional) y extranjeros. */
export function pasaporteFicticio(semilla) {
  const a = azar(semilla);
  const emisor = a.elegir(EMISORES_TD3);
  const col = emisor === "COL";
  const lineas = generarTd3({
    emisor,
    apellidos: a.entero(0, 1) === 1 ? `${a.palabra()} ${a.palabra()}` : a.palabra(),
    nombres: a.entero(0, 1) === 1 ? `${a.palabra()} ${a.palabra()}` : a.palabra(),
    numero: col ? `${a.elegir(["AQ", "AR", "AS", "AT", "AU", "AV"])}${a.cifras(7)}` : a.alfanum(a.entero(8, 9)),
    nacionalidad: emisor,
    nacimiento: a.fecha(50, 99),
    sexo: a.elegir(["F", "M"]),
    vencimiento: a.fecha(27, 35),
    opcional: col ? a.cifras(10) : "",
  });
  return { sintetico: true, formato: "td3", lineas };
}

/** CE ficticia: código `I`, emisor COL, número de 6 o 7 cifras y nacionalidad extranjera (hipótesis CE01 a CE03). */
export function ceFicticia(semilla) {
  const a = azar(semilla);
  const lineas = generarTd1({
    codigo: "I",
    emisor: "COL",
    numero: a.cifras(a.entero(6, 7)).replace(/^0/u, "1"),
    opcional1: "",
    nacimiento: a.fecha(50, 99),
    sexo: a.elegir(["F", "M"]),
    vencimiento: a.fecha(27, 35),
    nacionalidad: a.elegir(NACIONALIDADES_CE),
    opcional2: "",
    apellidos: a.palabra(),
    nombres: a.entero(0, 1) === 1 ? `${a.palabra()} ${a.palabra()}` : a.palabra(),
  });
  return { sintetico: true, formato: "td1", lineas };
}
