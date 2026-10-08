// despliegue-produccion, DP-07: ayudas de las E2E con las cabeceras de vercel.json. Código de prueba.
import type { Page } from "@playwright/test";

export const CSP =
  "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; img-src 'self'; style-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'";

/** Registra violaciones de CSP: eventos `securitypolicyviolation` del documento y mensajes de consola de página y workers. */
export async function vigilarCsp(page: Page): Promise<() => Promise<string[]>> {
  const consola: string[] = [];
  const esViolacion = (t: string) => /Content Security Policy|Refused to/iu.test(t);
  page.on("console", (m) => { if (esViolacion(m.text())) consola.push(m.text()); });
  page.on("worker", (w) => w.on("console", (m) => { if (esViolacion(m.text())) consola.push(`[worker] ${m.text()}`); }));
  await page.addInitScript(() => {
    const w = window as unknown as { __csp: string[] };
    w.__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => w.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  return async () => [...consola, ...(await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp))];
}

