// Arranque del ejemplo Nest (motor-backend-embebido, tarea 1.3): `npm run build -w examples/backend-nest` y
// `npm run start -w examples/backend-nest` (PORT, por omisión 4198). Solo escucha en 127.0.0.1.
import { crearApp } from "./app.js";

const puerto = Number(process.env.PORT ?? 4198);
const { app } = await crearApp();
await app.listen(puerto, "127.0.0.1");
process.stdout.write(`ejemplo backend-nest en http://127.0.0.1:${puerto}\n`);
