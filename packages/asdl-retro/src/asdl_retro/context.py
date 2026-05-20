"""Build the typed branch-retro CLI context."""

from __future__ import annotations

from dataclasses import dataclass

from asdl_core.git.git_gateway import GitGateway
from asdl_core.git.real_git_gateway import RealGitGateway
from asdl_core.sessions.adapters.pi_jsonl import PiJsonlSessionSource
from asdl_core.sessions.source import SessionSource


@dataclass(frozen=True)
class BranchRetroCliContext:
    """Typed context for the ``branch-retro`` CLI."""

    git_gateway: GitGateway
    session_source: SessionSource


def build_branch_retro_context() -> BranchRetroCliContext:
    """Assemble a :class:`BranchRetroCliContext` from real gateways."""
    return BranchRetroCliContext(
        git_gateway=RealGitGateway(),
        session_source=PiJsonlSessionSource(),
    )
