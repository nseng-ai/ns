"""Gateway retrieval from Click context."""

from __future__ import annotations

import click

from aretro.context import AretroCliContext
from asdl_core.clinkr.context import load_typed_context
from asdl_core.git.git_gateway import GitGateway
from asdl_core.sessions.source import SessionSource


def get_git_gateway(ctx: click.Context) -> GitGateway:
    """Retrieve the shared GitGateway from the given Click context."""
    return load_typed_context(ctx, AretroCliContext).git_gateway


def get_session_source(ctx: click.Context) -> SessionSource:
    """Retrieve the session source from the given Click context."""
    return load_typed_context(ctx, AretroCliContext).session_source
