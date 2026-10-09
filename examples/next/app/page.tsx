// Página de servidor: SSR sin tocar APIs del navegador; el lector se hidrata en el cliente.
import { Lector } from "./lector";

export default function Pagina() {
  return (
    <main>
      <h1>Onboarding con cédula</h1>
      <Lector />
    </main>
  );
}
