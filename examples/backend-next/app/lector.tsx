"use client";
// Front React con backend propio (SDK-51): `backend: "/api/cedula"` del mismo origen y `autoIniciar`.
import { useLectorCedula } from "@lector-cedula/react";

export function Lector() {
  const { videoRef, estado, reintentar } = useLectorCedula({ recursos: "/lector-cedula/", backend: "/api/cedula", autoIniciar: true });
  return (
    <section>
      <video ref={videoRef} playsInline muted aria-label="Cámara" />
      <button type="button" data-prueba="reintentar" onClick={reintentar}>
        Otra vez
      </button>
      <p aria-live="polite">
        Estado: <b data-prueba="fase">{estado.fase}</b> · NUIP: <output data-prueba="nuip">{estado.resultado?.campos.nuip ?? ""}</output>
      </p>
    </section>
  );
}
