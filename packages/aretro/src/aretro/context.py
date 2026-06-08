"""Build the typed aretro CLI context."""

from __future__ import annotations

from dataclasses import dataclass

from asdl_core.git.construction import build_git_gateway
from asdl_core.git.git_gateway import GitGateway
from asdl_core.sessions.adapters.pi_jsonl import PiJsonlSessionSource
from asdl_core.sessions.source import SessionSource


@dataclass(frozen=True)
class AretroCliContext:
    """Typed context for the ``aretro`` CLI."""

    git_gateway: GitGateway
    session_source: SessionSource


def build_aretro_context() -> AretroCliContext:
    """Assemble a :class:`AretroCliContext` from real gateways."""
    return AretroCliContext(
        git_gateway=build_git_gateway(),
        session_source=PiJsonlSessionSource(),
    )
