// MOT-12: en runtimes edge (condición de exportación `edge-light`) el paquete no funciona: necesita node:worker_threads,
// node:fs y WASM con hilos. Falla al importar con un mensaje claro en vez de romper más tarde.
throw new Error("@lector-cedula/motor requiere runtime nodejs");
