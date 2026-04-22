from __future__ import annotations

import json
from typing import Any

import click

from twerk_core.clinkr.exit import ClinkrExit


def emit_machine_envelope(result: Any) -> None:
    """Emit the machine-readable envelope for an operation's result.

    Used by the ``--format json`` dispatch path. Raises ``SystemExit`` when
    the operation's exit code is non-zero.
    """
    if not isinstance(result, ClinkrExit):
        raise TypeError(
            f"clinkr operation did not return a ClinkrExit; got {type(result).__name__}"
        )
    click.echo(json.dumps(result.to_envelope_dict(), indent=2))
    if result.exit_code != 0:
        raise SystemExit(result.exit_code)
