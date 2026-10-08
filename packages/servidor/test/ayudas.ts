// Datos sintéticos de AV-25/AV-26 (api-validaciones-contrato) y firma de referencia con node:crypto,
// independiente de la implementación con crypto.subtle (oráculo de las pruebas).
import { createHmac } from "node:crypto";

export const SECRETO = "whsec_sintetico_0123456789abcdef";
export const AHORA = 1791300000;
export const KT = "sk_test_00000000000000000000000000000000";
export const SRV = "https://api.lector-cedula.example";
export const AUT = { datos: true, sensibles: false, version_texto: "2026-10-01", otorgada_en: "2026-10-06T15:19:00Z" };

export const CUERPO_AV25 =
  '{"id":"evt_00000000000000000000000000000001","type":"validation.completed","created_at":"2026-10-06T15:20:00Z","sandbox":true,"data":{"validation_id":"val_0123456789abcdef0123456789abcdef","status":"success","declined_reason":null}}';
export const FIRMA_V1 = "t=1791300000,v1=1b3358c314ebcad6047166133405e2be0692e92e52d17606840183a58d5711df";

export function firmarReferencia(cuerpo: Uint8Array | string, secreto: string, t: number): string {
  const hmac = createHmac("sha256", secreto);
  hmac.update(`${t}.`);
  hmac.update(typeof cuerpo === "string" ? Buffer.from(cuerpo, "utf8") : cuerpo);
  return `t=${t},v1=${hmac.digest("hex")}`;
}
