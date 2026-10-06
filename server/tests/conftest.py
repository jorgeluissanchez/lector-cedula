"""Configuración común de pytest para el servidor.

Perfil `ci` de Hypothesis: sin base de ejemplos en disco (los tests se montan en solo lectura y no
deben dejar archivos) y sin deadline (la duración en Docker varía con la carga de la máquina).
Cada prueba de propiedades fija su propio `max_examples` según la tabla de `design.md`.
"""

from hypothesis import settings

settings.register_profile("ci", database=None, deadline=None)
settings.load_profile("ci")
