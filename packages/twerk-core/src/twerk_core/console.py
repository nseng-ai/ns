"""Shared Rich console + table helpers for twerk plugins.

These primitives give every plugin a consistent visual language. Call
``make_table()`` instead of constructing :class:`rich.table.Table` directly so
the twerk look-and-feel lives in exactly one place.
"""

from __future__ import annotations

import sys

from rich import box
from rich.console import Console
from rich.table import Table


def get_console() -> Console:
    """Return a Rich console bound to the *current* ``sys.stdout``.

    Constructed lazily on every call so Click's ``CliRunner`` (which
    redirects ``sys.stdout`` per-invocation) reliably captures output, and
    Rich's tty auto-detection skips ANSI codes in tests.
    """
    return Console(file=sys.stdout)


def make_table(*, show_header: bool = True) -> Table:
    """Return a Rich table pre-styled with the canonical twerk look.

    ``expand=True`` makes the table fill the terminal width so a flex column
    (e.g. ``add_column("Title", ratio=1, overflow="ellipsis")``) ellipsizes
    cleanly instead of pushing fixed columns off-screen.
    """
    return Table(
        show_header=show_header,
        header_style="bold cyan",
        box=box.SIMPLE_HEAD,
        pad_edge=False,
        padding=(0, 1),
        show_lines=False,
        expand=True,
    )
