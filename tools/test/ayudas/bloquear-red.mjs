// Hook de precarga (`node --import`) para MOT-06 y MOT-23 "Sin red" (motor-backend-embebido, D2 de design.md).
// Sustituye en el proceso hijo net.connect/createConnection, tls.connect, http(s).request/get, fetch y dns.lookup/resolve
// por funciones que lanzan y dejan la marca RED-PROHIBIDA en stderr.
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import { syncBuiltinESMExports } from "node:module";
import net from "node:net";
import tls from "node:tls";

export const MARCA = "RED-PROHIBIDA";

function prohibir(api) {
  const mensaje = `${MARCA}: ${api}`;
  process.stderr.write(`${mensaje}\n`);
  const error = new Error(mensaje);
  error.code = "ECONNREFUSED";
  return error;
}

function lanzar(api) {
  return () => {
    throw prohibir(api);
  };
}

net.connect = lanzar("net.connect");
net.createConnection = lanzar("net.createConnection");
tls.connect = lanzar("tls.connect");
http.request = lanzar("http.request");
http.get = lanzar("http.get");
https.request = lanzar("https.request");
https.get = lanzar("https.get");
for (const api of ["lookup", "resolve", "resolve4", "resolve6", "resolveAny"]) {
  if (typeof dns[api] === "function") dns[api] = lanzar(`dns.${api}`);
  if (typeof dns.promises[api] === "function") dns.promises[api] = async () => { throw prohibir(`dns.promises.${api}`); };
}
globalThis.fetch = async () => {
  throw prohibir("fetch");
};
if (typeof globalThis.WebSocket === "function") {
  globalThis.WebSocket = function WebSocketProhibido() {
    throw prohibir("WebSocket");
  };
}

syncBuiltinESMExports();
