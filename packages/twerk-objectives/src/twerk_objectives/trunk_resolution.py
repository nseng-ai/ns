"""Graphite trunk resolution shared by objective commands."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from twerk_core.gt.gateway import GtGateway
from twerk_core.gt.types import GtCommandFailure
from twerk_objectives.discovery import MASTER_BRANCH


@dataclass(frozen=True)
class TrunkResolution:
    """Resolved trunk name plus the optional failure that forced a fallback."""

    trunk: str
    failure: GtCommandFailure | None


def resolve_trunk(gt: GtGateway, cwd: Path) -> TrunkResolution:
    """Return Graphite's trunk, falling back to ``MASTER_BRANCH`` on failure."""
    result = gt.trunk(cwd)
    if isinstance(result, GtCommandFailure):
        return TrunkResolution(trunk=MASTER_BRANCH, failure=result)
    return TrunkResolution(trunk=result, failure=None)
