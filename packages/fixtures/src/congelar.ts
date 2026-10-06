/**
 * Congela en profundidad objetos y arreglos (FX-02). Los `Uint8Array` y demás vistas de `ArrayBuffer` se dejan
 * sin congelar: no se puede congelar un TypedArray no vacío y cada llamada devuelve uno nuevo.
 */
export function congelarProfundo<T>(valor: T): T {
  if (typeof valor !== "object" || valor === null || ArrayBuffer.isView(valor)) return valor;
  for (const hijo of Object.values(valor)) congelarProfundo(hijo);
  return Object.freeze(valor);
}
