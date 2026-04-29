"""Unit tests for shared Graphite trunk resolution."""

from __future__ import annotations

from pathlib import Path

from twerk_core.gt.testing import FakeGtGateway
from twerk_core.gt.types import GtCommandFailure
from twerk_objectives.trunk_resolution import TrunkResolution, resolve_trunk


def test_resolve_trunk_returns_graphite_trunk() -> None:
    result = resolve_trunk(FakeGtGateway(trunk="main"), Path("/repo"))

    assert result == TrunkResolution(trunk="main", failure=None)


def test_resolve_trunk_falls_back_to_master_on_failure() -> None:
    failure = GtCommandFailure(message="not a gt repo", returncode=1)
    result = resolve_trunk(FakeGtGateway(trunk=failure), Path("/repo"))

    assert result == TrunkResolution(trunk="master", failure=failure)
