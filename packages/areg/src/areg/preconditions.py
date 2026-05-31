"""Host-tool preconditions for commands that shell out to external CLIs.

Each Click command that depends on an external tool calls the matching
helper as its first statement. On failure the helper raises
`click.ClickException`, which Click renders as a clean one-line error.
"""

from __future__ import annotations

import shutil

import click


def requires_gh() -> None:
    if not shutil.which("gh"):
        raise click.ClickException(
            "gh CLI is required but not found on PATH. Install GitHub CLI: https://cli.github.com/"
        )


def requires_npx() -> None:
    if not shutil.which("npx"):
        raise click.ClickException(
            "npx is required but not found on PATH. Install Node.js to continue."
        )
