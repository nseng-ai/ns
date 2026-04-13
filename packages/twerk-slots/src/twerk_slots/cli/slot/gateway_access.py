from __future__ import annotations

import click

from twerk_slots.context import SlotsCliContext
from twerk_slots.repo_context import NoRepoSentinel


def get_slots_cli_context() -> SlotsCliContext | NoRepoSentinel:
    """Return the typed slots CLI context stashed on the active Click context.

    The root group callback constructs a :class:`SlotsCliContext` (or a
    :class:`NoRepoSentinel` when cwd is outside a git repo) and assigns it to
    ``ctx.obj``. Tests bypass the callback by passing a pre-built context as
    ``obj=`` to ``CliRunner().invoke(...)``.
    """
    ctx = click.get_current_context()
    obj = ctx.obj
    if not isinstance(obj, (SlotsCliContext, NoRepoSentinel)):
        raise RuntimeError(
            "SlotsCliContext missing from click context; "
            "ensure the slot group callback ran or obj= was passed in tests."
        )
    return obj
