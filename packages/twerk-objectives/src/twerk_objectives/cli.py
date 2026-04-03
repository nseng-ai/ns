from __future__ import annotations

from clinkr.group import clinkr_group


@clinkr_group("objective", discover="twerk_objectives.commands")
def cli_group() -> None:
    """Manage objectives."""
