/**
 * Registro de evaluadores: tipo de fixture -> función de un parser compilado.
 *
 * Cada entrada:
 *   modulo:   ruta desde la raíz del repo al módulo compilado (dist/), p. ej. "packages/parsers/dist/index.js"
 *   exportar: nombre de la función exportada que recibe `entrada` del fixture
 *   adaptar:  (opcional) transforma el resultado al objeto plano que se compara con `esperado`
 *
 * Al añadir un parser nuevo, regístralo aquí y añade fixtures en evals/fixtures/<tipo>/.
 */
export const EVALUADORES = {
  "nuip-formato": { modulo: "packages/parsers/dist/index.js", exportar: "validarFormatoNuip" },
};
