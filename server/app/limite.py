"""Rate limiting por ventana deslizante (decisión 11, AV-11).

Registro de marcas de tiempo aceptadas por hash de clave (`deque` de como máximo N elementos).
Garantiza como máximo N aceptadas en cualquier ventana de 60 s, cosa que un token bucket no
garantiza. Las marcas se guardan en microsegundos enteros para que los bordes de la ventana no
dependan del redondeo en coma flotante. Las peticiones rechazadas no cuentan.
"""

from collections import deque

_MICRO = 1_000_000


class VentanaDeslizante:
    def __init__(self, limite: int, ventana_s: int = 60) -> None:
        if limite < 1:
            raise ValueError("el límite debe ser al menos 1")
        self.limite = limite
        self._ventana = ventana_s * _MICRO
        self._marcas: dict[str, deque[int]] = {}

    def registrar(self, clave: str, ahora: float) -> int | None:
        """Cuenta la petición y devuelve `None` si se acepta, o los segundos enteros de `Retry-After`
        (al menos 1) si la ventana que termina ahora ya tiene `limite` aceptadas."""
        actual = round(ahora * _MICRO)
        marcas = self._marcas.setdefault(clave, deque(maxlen=self.limite))
        while marcas and actual - marcas[0] >= self._ventana:
            marcas.popleft()
        if len(marcas) >= self.limite:
            restante = marcas[0] + self._ventana - actual
            return max(1, -(-restante // _MICRO))
        marcas.append(actual)
        return None
