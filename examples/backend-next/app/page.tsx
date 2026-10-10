// Página del ejemplo: el lector se hidrata en el cliente y envía al route handler del mismo origen (SDK-51).
import { Lector } from "./lector";

export default function Pagina() {
  return (
    <main>
      <h1>Verifica tu identidad</h1>
      <Lector />
    </main>
  );
}
