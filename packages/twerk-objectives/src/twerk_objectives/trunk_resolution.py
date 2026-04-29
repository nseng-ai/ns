"""Git trunk resolution shared by objective commands."""

from __future__ import annotations

from dataclasses import dataclass

from twerk_core.git.git_gateway import GitGateway


@dataclass(frozen=True)
class TrunkResolution:
    """Resolved trunk branch name."""

    trunk: str


def resolve_trunk(git: GitGateway) -> TrunkResolution:
    """Return the git gateway's bound trunk branch."""
    return TrunkResolution(trunk=git.get_trunk_branch())
