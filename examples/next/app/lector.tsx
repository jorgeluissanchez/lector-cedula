"use client";
// Ejemplo Next (SDK-12, SDK-31, SDK-37): UI propia sobre useLectorCedula, sin servidor del lector. El render en servidor
// da fase `inicio`; la URL de los recursos se calcula solo en el navegador (al pulsar).
import { useState } from "react";
import { precargarMotor } from "@lector-cedula/web";
import { useLectorCedula } from "@lector-cedula/react";

const RECURSOS = "/lector-cedula/";
const absoluta = (): string => new URL(RECURSOS, window.location.href).href;

export function Lector() {
  const { videoRef, estado, iniciar, cancelar, reintentar } = useLectorCedula({ recursos: RECURSOS });
  const [motor, fijarMotor] = useState("");
  const n = estado.guia?.normalizada;
  const visible = n !== undefined && (estado.fase === "activo" || estado.fase === "listo");
  const precargar = (): void => {
    fijarMotor("cargando");
    precargarMotor({ recursos: absoluta() }).then(
      () => fijarMotor("listo"),
      (e: { codigo?: string }) => fijarMotor(e.codigo ?? "error"),
    );
  };
  return (
    <div data-fase={estado.fase}>
      <div className="cuadro">
        <video ref={videoRef} playsInline muted />
        <div
          data-prueba="guia"
          className="guia"
          style={visible ? { display: "block", left: `${n.x * 100}%`, top: `${n.y * 100}%`, width: `${n.ancho * 100}%`, height: `${n.alto * 100}%` } : { display: "none" }}
        />
      </div>
      <div className="fila">
        <button type="button" data-prueba="iniciar" onClick={() => void iniciar()}>
          Abrir cámara
        </button>
        <button type="button" data-prueba="precargar" onClick={precargar}>
          Precargar
        </button>
        <button type="button" data-prueba="cancelar" onClick={cancelar}>
          Cerrar
        </button>
        <button type="button" data-prueba="reintentar" onClick={reintentar}>
          Reintentar
        </button>
      </div>
      <dl aria-live="polite">
        <dt>Fase</dt>
        <dd data-prueba="fase">{estado.fase}</dd>
        <dt>Contenido</dt>
        <dd data-prueba="contenido">{estado.contenido ?? ""}</dd>
        <dt>NUIP</dt>
        <dd data-prueba="nuip">{estado.resultado?.campos.nuip ?? ""}</dd>
        <dt>Error</dt>
        <dd data-prueba="error">{estado.error?.codigo ?? ""}</dd>
        <dt>Motor</dt>
        <dd data-prueba="motor">{motor}</dd>
      </dl>
    </div>
  );
}
