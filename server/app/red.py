"""Puertos de red de los webhooks (decisiones 6 y 10): resolución DNS y transporte HTTP.

El transporte conecta a la IP ya comprobada por el `Resolvedor` (sin segunda resolución, lo que cierra
el DNS rebinding) y valida el certificado contra el nombre del host (SNI). No sigue redirecciones, no
lee variables de entorno de proxy y corta a los 10 s.
"""

import asyncio
import socket
from typing import Protocol
from urllib.parse import urlsplit, urlunsplit

import httpx


class Transporte(Protocol):
    async def enviar(
        self, url: str, ip: str, cabeceras: dict[str, str], cuerpo: bytes, timeout_s: float
    ) -> int:
        """`POST` de `cuerpo` a `url` conectando a `ip`; devuelve el estado HTTP. Lanza `TimeoutError`
        u `OSError` si no hay respuesta."""
        ...


class Resolvedor(Protocol):
    async def resolver(self, host: str) -> list[str]: ...


class ResolvedorSistema:
    async def resolver(self, host: str) -> list[str]:
        infos = await asyncio.get_running_loop().getaddrinfo(host, 443, type=socket.SOCK_STREAM)
        return list(dict.fromkeys(str(info[4][0]) for info in infos))


class TransporteHttpx:
    async def enviar(
        self, url: str, ip: str, cabeceras: dict[str, str], cuerpo: bytes, timeout_s: float
    ) -> int:
        partes = urlsplit(url)
        host = partes.hostname or ""
        # `http` solo llega aquí para un destino de WEBHOOK_DESTINOS_PRUEBA (SDK-40); AV-28 exige `https`.
        esquema = "http" if partes.scheme == "http" else "https"
        defecto = 80 if esquema == "http" else 443
        puerto = partes.port or defecto
        ip_url = f"[{ip}]" if ":" in ip else ip
        destino = urlunsplit((esquema, f"{ip_url}:{puerto}", partes.path or "/", partes.query, ""))
        anfitrion = host if puerto == defecto else f"{host}:{puerto}"
        try:
            async with httpx.AsyncClient(
                follow_redirects=False, timeout=timeout_s, trust_env=False
            ) as cliente:
                respuesta = await cliente.post(
                    destino,
                    content=cuerpo,
                    headers={**cabeceras, "Host": anfitrion},
                    extensions={"sni_hostname": host},
                )
        except httpx.TimeoutException:
            raise TimeoutError from None
        except httpx.HTTPError:
            raise OSError from None
        return respuesta.status_code
