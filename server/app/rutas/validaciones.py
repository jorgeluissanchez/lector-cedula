"""Rutas de `/v1/validations`.

Toda ruta exige `Authorization: Bearer <clave>` (AV-02), salvo la subida con token firmado (AV-08).
La paridad de rutas con el contrato se exige en AV-01.
"""

import json
from typing import Annotated

from fastapi import Depends, FastAPI, Request
from fastapi.responses import Response
from pydantic import ValidationError

from app.almacen import Validacion
from app.auth import Cliente, cliente_limitado
from app.errores import ErrorApi, traducir_errores
from app.idempotencia import (
    PATRON_CLAVE,
    EnCurso,
    RegistroIdempotencia,
    Repetir,
    RespuestaGuardada,
    Reutilizada,
    huella_cuerpo,
)
from app.modelos import CrearValidacion, reglas_de_creacion
from app.representacion import representar, serializar
from app.rutas import subida
from app.servicio import ServicioValidaciones

ClienteAutenticado = Annotated[Cliente, Depends(cliente_limitado)]

LIMITE_CUERPO_CREACION = 16_384
TIPO_JSON = "application/json"


def _servicio(request: Request) -> ServicioValidaciones:
    return request.app.state.servicio


def _validacion_del_cliente(request: Request, id_validacion: str, cliente: Cliente) -> Validacion:
    """La validación del cliente o 404 `not-found`, idéntico para inexistente, mal formada o ajena."""
    validacion = _servicio(request).obtener(id_validacion, propietario=cliente.hash_clave)
    if validacion is None:
        raise ErrorApi(404, "not-found")
    request.state.validation_id = validacion.id
    return validacion


async def leer_cuerpo_limitado(request: Request, limite: int) -> bytes:
    """Lee el cuerpo sin pasar de `limite` bytes: 413 por `Content-Length` sin leer nada, o en cuanto
    lo leído supera el límite."""
    longitud = request.headers.get("content-length")
    if longitud is not None and longitud.isdigit() and int(longitud) > limite:
        raise ErrorApi(413, "request-too-large")
    cuerpo = bytearray()
    async for trozo in request.stream():
        cuerpo += trozo
        if len(cuerpo) > limite:
            raise ErrorApi(413, "request-too-large")
    return bytes(cuerpo)


def validar_creacion(
    cuerpo: bytes, cliente: Cliente, ahora: float, destinos_prueba: tuple[str, ...] = ()
) -> tuple[CrearValidacion, object]:
    try:
        modelo = CrearValidacion.model_validate_json(cuerpo)
    except ValidationError as error:
        raise ErrorApi(422, "invalid-request", traducir_errores(error.errors())) from None
    errores, otorgada = reglas_de_creacion(modelo, cliente.sandbox, ahora, cliente.retornos, destinos_prueba)
    if errores:
        raise ErrorApi(422, "invalid-request", errores)
    return modelo, otorgada


def _destinos_prueba(request: Request) -> tuple[str, ...]:
    """SDK-40: destinos de webhook admitidos solo con ENTORNO=pruebas."""
    config = request.app.state.config
    return config.webhook_destinos_prueba if config.entorno == "pruebas" else ()


def respuesta_validacion(request: Request, validacion: Validacion, estado: int = 200) -> Response:
    contenido = serializar(representar(validacion, request.app.state.config))
    return Response(content=contenido, status_code=estado, media_type=TIPO_JSON)


def _suprimida(servicio: ServicioValidaciones, previa: Repetir, propietario: str) -> bool:
    """La respuesta guardada apunta a una validación que ya no existe (suprimida o vencida)."""
    id_validacion = json.loads(previa.respuesta.contenido)["id"]
    return servicio.obtener(id_validacion, propietario) is None


def registrar(aplicacion: FastAPI) -> None:
    """Registra las operaciones en la aplicación (no en un router incluido) para que la prueba de
    paridad las lea de `aplicacion.routes`."""

    @aplicacion.post("/v1/validations")
    async def crear_validacion(request: Request, cliente: ClienteAutenticado) -> Response:
        servicio = _servicio(request)
        registro: RegistroIdempotencia = request.app.state.idempotencia
        clave = request.headers.get("idempotency-key")
        if clave is not None and not PATRON_CLAVE.fullmatch(clave):
            raise ErrorApi(400, "invalid-idempotency-key")
        cuerpo = await leer_cuerpo_limitado(request, LIMITE_CUERPO_CREACION)

        if clave is not None:
            previa = registro.reservar(
                cliente.hash_clave, clave, huella_cuerpo(cuerpo), servicio.puertos.reloj.ahora()
            )
            if isinstance(previa, EnCurso):
                raise ErrorApi(409, "idempotency-key-in-progress")
            if isinstance(previa, Reutilizada):
                raise ErrorApi(422, "idempotency-key-reused")
            if isinstance(previa, Repetir) and _suprimida(servicio, previa, cliente.hash_clave):
                # AV-23: tras la supresión todo sobre ese id es 404; repetir el 201 lo contradiría.
                registro.olvidar(cliente.hash_clave, clave)
                previa = registro.reservar(
                    cliente.hash_clave, clave, huella_cuerpo(cuerpo), servicio.puertos.reloj.ahora()
                )
            if isinstance(previa, Repetir):
                guardada = previa.respuesta
                return Response(
                    content=guardada.contenido,
                    status_code=guardada.estado,
                    headers={**dict(guardada.cabeceras), "Idempotent-Replayed": "true"},
                    media_type=TIPO_JSON,
                )
        try:
            if servicio.puertos.retener_creacion is not None:
                await servicio.puertos.retener_creacion()
            modelo, otorgada = validar_creacion(
                cuerpo, cliente, servicio.puertos.reloj.ahora(), _destinos_prueba(request)
            )
            validacion = servicio.crear(modelo, cliente.hash_clave, cliente.sandbox, otorgada)  # type: ignore[arg-type]
            request.state.validation_id = validacion.id
            contenido = serializar(representar(validacion, request.app.state.config))
            cabeceras = (("Location", f"/v1/validations/{validacion.id}"),)
            if clave is not None:
                registro.guardar(
                    cliente.hash_clave,
                    clave,
                    RespuestaGuardada(estado=201, contenido=contenido, cabeceras=cabeceras),
                    servicio.puertos.reloj.ahora(),
                )
            return Response(content=contenido, status_code=201, headers=dict(cabeceras), media_type=TIPO_JSON)
        finally:
            # Un rechazo (4xx) o un error no consumen la clave (AV-04); un 201 ya quedó guardado.
            if clave is not None:
                registro.liberar_si_en_curso(cliente.hash_clave, clave)

    @aplicacion.get("/v1/validations/{id}")
    async def obtener_validacion(id: str, request: Request, cliente: ClienteAutenticado) -> Response:
        return respuesta_validacion(request, _validacion_del_cliente(request, id, cliente))

    @aplicacion.delete("/v1/validations/{id}")
    async def suprimir_validacion(id: str, request: Request, cliente: ClienteAutenticado) -> Response:
        """Supresión por revocación (AV-23): 204 sin cuerpo; después, 404 para todo."""
        validacion = _validacion_del_cliente(request, id, cliente)
        _servicio(request).suprimir(validacion, "revocacion")
        return Response(status_code=204)

    @aplicacion.post("/v1/validations/{id}/images")
    async def subir_imagenes(id: str, request: Request) -> Response:
        return await subida.subir_imagenes(id, request)
