"""In-memory fakes for the slots gateways, importable from tests.

Mirrors the ``twerk_core.gh.testing`` pattern: fakes live inside the
package so tests can import them by their dotted path without any
``sys.path`` manipulation.
"""

from __future__ import annotations

from twerk_slots.gateway.testing.git import FakeGitGateway
from twerk_slots.gateway.testing.pool_state import FakePoolStateGateway
from twerk_slots.gateway.testing.storage import FakeSlotsStorageGateway

__all__ = [
    "FakeGitGateway",
    "FakePoolStateGateway",
    "FakeSlotsStorageGateway",
]
