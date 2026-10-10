// Ejemplo Next con backend propio (SDK-12, SDK-31): el layout se renderiza en el servidor; el lector vive en un componente cliente.
import type { ReactNode } from "react";

export const metadata = { title: "Lector de cédula: ejemplo Next" };

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
