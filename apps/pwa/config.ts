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
