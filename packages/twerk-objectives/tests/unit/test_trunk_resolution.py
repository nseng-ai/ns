"""Unit tests for shared git trunk resolution."""

from __future__ import annotations

from twerk_core.git.testing import FakeGitGateway
from twerk_objectives.trunk_resolution import TrunkResolution, resolve_trunk


def test_resolve_trunk_returns_git_gateway_trunk() -> None:
    result = resolve_trunk(FakeGitGateway(trunk_branch="main"))

    assert result == TrunkResolution(trunk="main")
