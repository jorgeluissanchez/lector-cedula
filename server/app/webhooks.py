"""Webhooks `validation.completed` (decisiones 8, 9 y 10; AV-25 a AV-28).

- Firma `t=<unix>,v1=<hex>`: HMAC-SHA256, con el secreto de webhooks de la clave de API, de
  `<t>.<cuerpo>`. El cuerpo se serializa una sola vez y esos mismos bytes se firman y se envían.
- El evento solo lleva identificadores y veredicto; nunca datos del documento (decisión 9).
- Calendario fijo desde el primer intento: 0, 60, 300, 1800, 7200 y 21 600 s; timeout de 10 s; las
  redirecciones no se siguen y cuentan como fallo.
- Antes de cada intento el host se resuelve con el `Resolvedor`; si alguna IP es interna o no
  enrutable, el intento se bloquea sin reintentos. La conexión se hace a la IP ya comprobada.
- Cada intento produce una línea de log con `event_id`, `attempt` y `outcome`; nunca la URL, la IP,
  las cabeceras ni el cuerpo.
"""

import hashlib
import hmac
import ipaddress
import json
import logging
import re
from dataclasses import dataclass, field
from urllib.parse import urlsplit

from app.almacen import Almacen, Validacion
from app.config import Config
from app.puertos import Cancelable, Puertos
from app.representacion import instante

CALENDARIO_S = (0, 60, 300, 1800, 7200, 21_600)
TIMEOUT_S = 10
_CABECERA = re.compile(r"^t=([0-9]{1,15}),v1=([0-9a-f]{64})$")
_NAT64 = ipaddress.ip_network("64:ff9b::/96")

log = logging.getLogger("lector.webhooks")


def firmar(secreto: str, t: int, cuerpo: bytes) -> str:
    return hmac.new(secreto.encode(), str(t).encode() + b"." + cuerpo, hashlib.sha256).hexdigest()


def cabecera_firma(secreto: str, t: int, cuerpo: bytes) -> str:
    return f"t={t},v1={firmar(secreto, t, cuerpo)}"


def verificar_firma(secreto: str, cabecera: str, cuerpo: bytes) -> bool:
    """Verificación en tiempo constante, como la haría el receptor (sin tolerancia de antigüedad)."""
    coincidencia = _CABECERA.fullmatch(cabecera)
    if coincidencia is None:
        return False
    t, recibida = int(coincidencia.group(1)), coincidencia.group(2)
    return hmac.compare_digest(recibida, firmar(secreto, t, cuerpo))


def _ipv4_incrustada(ip: ipaddress.IPv6Address) -> ipaddress.IPv4Address | None:
    if ip.ipv4_mapped is not None:
        return ip.ipv4_mapped
    if ip in _NAT64:
        return ipaddress.IPv4Address(int(ip) & 0xFFFFFFFF)
    if ip.sixtofour is not None:
        return ip.sixtofour
    if ip.teredo is not None:
        return ip.teredo[1]
    return None


def ip_bloqueada(texto: str) -> bool:
    """Verdadero si `texto` no es una IP global de unidifusión (loopback, privada, link-local,
    multicast, reservada, no especificada, CGNAT o IPv4 incrustada en una de ellas) o no es una IP."""
    try:
        ip = ipaddress.ip_address(texto)
    except ValueError:
        return True
    if isinstance(ip, ipaddress.IPv6Address):
        if ip.scope_id is not None:
            return True
        incrustada = _ipv4_incrustada(ip)
        if incrustada is not None and ip_bloqueada(str(incrustada)):
            return True
    return not ip.is_global or ip.is_multicast


def cuerpo_evento(id_evento: str, validacion: Validacion, creado_en: str) -> bytes:
    evento = {
        "id": id_evento,
        "type": "validation.completed",
        "created_at": creado_en,
        "sandbox": validacion.sandbox,
        "data": {
            "validation_id": validacion.id,
            "status": validacion.status,
            "declined_reason": validacion.declined_reason,
        },
    }
    return json.dumps(evento, ensure_ascii=False, separators=(",", ":")).encode()


@dataclass
class _Entrega:
    validation_id: str
    id_evento: str
    url: str
    secreto: str = field(repr=False)
    cuerpo: bytes = field(repr=False)
    sandbox: bool
    primer_intento: float
    tarea: Cancelable | None = None


class ServicioWebhooks:
    def __init__(self, almacen: Almacen, puertos: Puertos, config: Config) -> None:
        self.almacen = almacen
        self.puertos = puertos
        self.config = config
        self._entregas: dict[str, _Entrega] = {}

    def al_terminar(self, validacion: Validacion) -> None:
        """Programa el primer intento si la validación tiene `webhook_url`."""
        if validacion.webhook_url is None:
            return
        clave = self.config.claves.get(validacion.propietario)
        if clave is None:
            return
        ahora = self.puertos.reloj.ahora()
        id_evento = self.puertos.generador_ids.id_evento()
        entrega = _Entrega(
            validation_id=validacion.id,
            id_evento=id_evento,
            url=validacion.webhook_url,
            secreto=clave.secreto_webhook,
            cuerpo=cuerpo_evento(id_evento, validacion, instante(ahora)),
            sandbox=validacion.sandbox,
            primer_intento=ahora,
        )
        self._entregas[validacion.id] = entrega
        self._programar(entrega, 1)

    def cancelar(self, validation_id: str) -> None:
        entrega = self._entregas.pop(validation_id, None)
        if entrega is not None and entrega.tarea is not None:
            entrega.tarea.cancel()

    def _programar(self, entrega: _Entrega, intento: int) -> None:
        planificador = self.puertos.planificador
        assert planificador is not None  # noqa: S101 - Puertos.__post_init__ lo garantiza
        momento = entrega.primer_intento + CALENDARIO_S[intento - 1]
        entrega.tarea = planificador.programar(momento, lambda: self._intentar(entrega, intento))

    def _registrar(self, entrega: _Entrega, intento: int, resultado: str) -> None:
        log.info(
            "webhook_intento",
            extra={
                "campos": {
                    "validation_id": entrega.validation_id,
                    "event_id": entrega.id_evento,
                    "attempt": intento,
                    "outcome": resultado,
                    "sandbox": entrega.sandbox,
                }
            },
        )

    async def _intentar(self, entrega: _Entrega, intento: int) -> None:
        # Una validación suprimida o vencida ya no notifica (AV-23).
        if self._entregas.get(entrega.validation_id) is not entrega:
            return
        if self.almacen.obtener_sin_propietario(entrega.validation_id) is None:
            self._entregas.pop(entrega.validation_id, None)
            return
        resultado = await self._enviar(entrega, intento)
        self._registrar(entrega, intento, resultado)
        if resultado == "failed" and intento < len(CALENDARIO_S):
            self._programar(entrega, intento + 1)
        else:
            self._entregas.pop(entrega.validation_id, None)

    async def _enviar(self, entrega: _Entrega, intento: int) -> str:
        host = urlsplit(entrega.url).hostname or ""
        try:
            ips = await self.puertos.resolvedor.resolver(host)
        except OSError:
            return "failed"
        # SDK-40: un destino exacto de WEBHOOK_DESTINOS_PRUEBA (solo ENTORNO=pruebas) puede ser interno.
        excepcion = self.config.es_destino_prueba(entrega.url)
        if not ips or (not excepcion and any(ip_bloqueada(ip) for ip in ips)):
            return "blocked"
        t = int(self.puertos.reloj.ahora())
        cabeceras = {
            "Content-Type": "application/json",
            "User-Agent": "lector-cedula-webhooks/1",
            "X-Lector-Event-Id": entrega.id_evento,
            "X-Lector-Attempt": str(intento),
            "X-Lector-Signature": cabecera_firma(entrega.secreto, t, entrega.cuerpo),
        }
        try:
            estado = await self.puertos.transporte.enviar(
                entrega.url, ips[0], cabeceras, entrega.cuerpo, TIMEOUT_S
            )
        except (TimeoutError, OSError):
            return "failed"
        return "delivered" if 200 <= estado < 300 else "failed"
