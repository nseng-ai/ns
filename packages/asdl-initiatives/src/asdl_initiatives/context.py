"""Typed runtime context for the ``initiative`` CLI."""

from __future__ import annotations

from dataclasses import dataclass

from asdl_core.git.git_gateway import GitGateway


@dataclass(frozen=True, slots=True)
class InitiativeCliContext:
    """Dependencies for Initiative commands that need repository facts."""

    git_gateway: GitGateway
