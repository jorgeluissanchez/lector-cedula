/**
 * Configuración de compilación de la PWA (otros-documentos, OD-30). `VITE_ADMITIR_TI` admite la tarjeta de identidad
 * y los menores (OD-32, con la autorización del representante de OD-34b): solo `"true"` o `"false"`; ausente o vacía
 * es `"false"`. Cualquier otro valor hace fallar `vite build` con un mensaje que nombra la variable.
 */
export function leerAdmitirTi(valor: string | undefined): boolean {
  if (valor === undefined || valor === "" || valor === "false") return false;
  if (valor === "true") return true;
  throw new Error(`VITE_ADMITIR_TI debe ser "true" o "false" (recibido: ${JSON.stringify(valor)})`);
}

/**
 * mitigacion-autor (MA-01): `VITE_DEMO` muestra el aviso de demostración en inicio. Solo `"true"` o `"false"`; ausente
 * o vacía es `"false"`. Otro valor hace fallar `vite build` con un mensaje que nombra la variable.
 */
export function leerDemo(valor: string | undefined): boolean {
  if (valor === undefined || valor === "" || valor === "false") return false;
  if (valor === "true") return true;
  throw new Error(`VITE_DEMO debe ser "true" o "false" (recibido: ${JSON.stringify(valor)})`);
}

/** MA-03: en la demo, ninguna conexión sale del propio origen aunque el servidor no ponga la CSP de nginx.conf. */
export const CSP_DEMO = `<meta http-equiv="Content-Security-Policy" content="connect-src 'self'">`;

export function inyectarCspDemo(html: string, demo: boolean): string {
  return demo ? html.replace("</head>", `  ${CSP_DEMO}\n  </head>`) : html;
}
