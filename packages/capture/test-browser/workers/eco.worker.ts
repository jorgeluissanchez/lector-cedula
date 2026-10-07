// Worker de prueba (tarea 1.2): responde con el mismo dato y el tamaño del buffer recibido.
const alcance = self as unknown as {
  onmessage: ((e: MessageEvent<{ valor: number; buffer: ArrayBuffer }>) => void) | null;
  postMessage(m: unknown): void;
};
alcance.onmessage = (e) => {
  alcance.postMessage({ valor: e.data.valor + 1, bytes: e.data.buffer.byteLength });
};
