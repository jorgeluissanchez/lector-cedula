/* eslint-disable no-control-regex -- el estándar URL define los caracteres de control C0 que se recortan y prohíben. */
/**
 * `URL` mínimo para motores sin la API web (QuickJS, JavaScriptCore sin `URL`), inyectado por esbuild solo dentro del
 * IIFE (no se escribe en `globalThis`). Cubre lo que usan `opcionInvalida` y `urlSubidaValida` de `packages/web`:
 * `protocol`, `hostname`, `host`, `port`, `origin` y la validez (lanza `TypeError` como `new URL`). Sigue el algoritmo
 * del WHATWG URL Standard para esquemas especiales (barras y contrabarras, puerto por omisión, IPv4 con partes
 * decimales, octales y hexadecimales, IPv6 entre corchetes, puntos de código prohibidos). Diferencia conocida y más
 * estricta: un host no ASCII (IDNA) se rechaza en lugar de convertirse a punycode. La prueba diferencial frente a la
 * `URL` de Node está en `test/nat-01-12-reglas.test.ts`.
 */
const PUERTOS: Readonly<Record<string, string>> = { "http:": "80", "https:": "443", "ws:": "80", "wss:": "443", "ftp:": "21", "file:": "" };
const PROHIBIDOS_HOST = /[\u0000-\u001f\u007f #/:<>?@[\\\]^|%]/u;
const PROHIBIDOS_OPACO = /[\u0000 #/:<>?@[\\\]^|]/u;
const ESQUEMA = /^[A-Za-z][A-Za-z0-9+.-]*:/u;

const invalida = (): never => {
  throw new TypeError("Invalid URL");
};

function numeroIpv4(parte: string): number | null {
  if (parte === "") return null;
  let base = 10;
  let p = parte;
  if (/^0[xX]/u.test(p)) {
    base = 16;
    p = p.slice(2);
  } else if (p.length > 1 && p.startsWith("0")) {
    base = 8;
    p = p.slice(1);
  }
  if (p === "") return 0;
  const valido = base === 16 ? /^[0-9A-Fa-f]+$/u : base === 8 ? /^[0-7]+$/u : /^[0-9]+$/u;
  return valido.test(p) ? parseInt(p, base) : null;
}

/** Último rótulo numérico: el host debe ser una IPv4 (WHATWG, "ends in a number"). */
function terminaEnNumero(host: string): boolean {
  const partes = host.split(".");
  if (partes.at(-1) === "") {
    if (partes.length === 1) return false;
    partes.pop();
  }
  const ultima = partes.at(-1) ?? "";
  return /^[0-9]+$/u.test(ultima) || /^0[xX][0-9A-Fa-f]*$/u.test(ultima);
}

function ipv4(host: string): string {
  const partes = host.split(".");
  if (partes.at(-1) === "" && partes.length > 1) partes.pop();
  if (partes.length > 4) invalida();
  const numeros = partes.map(numeroIpv4);
  if (numeros.some((n) => n === null)) invalida();
  const ns = numeros as number[];
  if (ns.slice(0, -1).some((n) => n > 255)) invalida();
  const ultimo = ns.at(-1) as number;
  if (ultimo >= 256 ** (5 - ns.length)) invalida();
  let valor = ultimo;
  ns.slice(0, -1).forEach((n, i) => {
    valor += n * 256 ** (3 - i);
  });
  return [24, 16, 8, 0].map((d) => Math.floor(valor / 2 ** d) % 256).join(".");
}

function decodificarPorcentaje(s: string): string {
  return s.replace(/%([0-9A-Fa-f]{2})/gu, (_m, h: string) => String.fromCharCode(parseInt(h, 16)));
}

function hostEspecial(crudo: string, esquema: string): string {
  if (crudo === "") return esquema === "file:" ? "" : invalida();
  if (crudo.startsWith("[")) {
    if (!crudo.endsWith("]") || !/^\[[0-9A-Fa-f:.]+\]$/u.test(crudo) || !crudo.includes(":")) invalida();
    return crudo.toLowerCase();
  }
  const host = decodificarPorcentaje(crudo);
  // Más estricto que IDNA: ningún carácter no ASCII.
  if (/[^\u0000-\u007f]/u.test(host) || PROHIBIDOS_HOST.test(host)) invalida();
  const minusculas = host.toLowerCase();
  if (minusculas === "") invalida();
  return terminaEnNumero(minusculas) ? ipv4(minusculas) : minusculas;
}

interface Autoridad {
  readonly hostname: string;
  readonly port: string;
}

function autoridad(texto: string, esquema: string, especial: boolean): Autoridad {
  const arroba = texto.lastIndexOf("@");
  const hostPuerto = arroba >= 0 ? texto.slice(arroba + 1) : texto;
  if (arroba >= 0 && hostPuerto === "") invalida();
  const cierre = hostPuerto.lastIndexOf("]");
  const dosPuntos = hostPuerto.lastIndexOf(":");
  const conPuerto = dosPuntos > cierre;
  const hostCrudo = conPuerto ? hostPuerto.slice(0, dosPuntos) : hostPuerto;
  const puertoCrudo = conPuerto ? hostPuerto.slice(dosPuntos + 1) : "";
  if (!/^[0-9]*$/u.test(puertoCrudo)) invalida();
  const numero = puertoCrudo === "" ? null : parseInt(puertoCrudo, 10);
  if (numero !== null && numero > 65535) invalida();
  let hostname: string;
  if (especial) hostname = hostEspecial(hostCrudo, esquema);
  else {
    if (hostCrudo.startsWith("[")) hostEspecial(hostCrudo, esquema);
    else if (PROHIBIDOS_OPACO.test(hostCrudo)) invalida();
    hostname = hostCrudo;
  }
  // Credenciales o puerto sin host: inválida en cualquier esquema.
  if ((conPuerto || arroba >= 0) && hostname === "") invalida();
  const port = numero === null || String(numero) === PUERTOS[esquema] ? "" : String(numero);
  return { hostname, port };
}

export class URLNucleo {
  readonly protocol: string;
  readonly hostname: string;
  readonly port: string;
  readonly href: string;

  constructor(entrada: unknown, base?: unknown) {
    const texto = String(entrada)
      .replace(/^[\u0000- ]+|[\u0000- ]+$/gu, "")
      .replace(/[\t\n\r]/gu, "");
    const esquema = ESQUEMA.exec(texto);
    if (esquema === null) {
      if (base === undefined) invalida();
      const b = base instanceof URLNucleo ? base : new URLNucleo(base);
      const especialBase = b.protocol in PUERTOS;
      const doble = especialBase ? /^[/\\]{2}/u.test(texto) : texto.startsWith("//");
      const r = doble ? new URLNucleo(b.protocol + texto) : b;
      this.protocol = r.protocol;
      this.hostname = r.hostname;
      this.port = r.port;
      this.href = r.href;
      return;
    }
    this.protocol = esquema[0].toLowerCase();
    const resto = texto.slice(esquema[0].length);
    const especial = this.protocol in PUERTOS;
    let a: Autoridad = { hostname: "", port: "" };
    const b = base === undefined ? null : base instanceof URLNucleo ? base : new URLNucleo(base);
    if (especial && b !== null && b.protocol === this.protocol && this.protocol !== "file:" && !/^[/\\]{2}/u.test(resto)) {
      // Mismo esquema especial que la base y sin dos barras: es una ruta relativa a la base.
      a = { hostname: b.hostname, port: b.port };
    } else if (this.protocol === "file:") {
      // `file:` solo tiene host tras dos barras (o contrabarras); si no, todo es ruta.
      if (/^[/\\]{2}/u.test(resto)) {
        const tras = resto.slice(2);
        const fin = tras.search(/[/\\?#]/u);
        // En file no hay credenciales ni puerto: `@` y `:` son puntos de código prohibidos del host.
        const host = hostEspecial(fin < 0 ? tras : tras.slice(0, fin), this.protocol);
        a = { hostname: host === "localhost" ? "" : host, port: "" };
      }
    } else if (especial) {
      const sinBarras = resto.replace(/^[/\\]*/u, "");
      const fin = sinBarras.search(/[/\\?#]/u);
      a = autoridad(fin < 0 ? sinBarras : sinBarras.slice(0, fin), this.protocol, true);
    } else if (resto.startsWith("//")) {
      const tras = resto.slice(2);
      const fin = tras.search(/[/?#]/u);
      a = autoridad(fin < 0 ? tras : tras.slice(0, fin), this.protocol, false);
    }
    this.hostname = a.hostname;
    this.port = a.port;
    this.href = `${this.protocol}//${this.host}`;
  }

  get host(): string {
    return this.port === "" ? this.hostname : `${this.hostname}:${this.port}`;
  }

  get origin(): string {
    return this.protocol in PUERTOS && this.protocol !== "file:" ? `${this.protocol}//${this.host}` : "null";
  }

  toString(): string {
    return this.href;
  }
}

export { URLNucleo as URL };
