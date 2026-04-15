from __future__ import annotations

from twerk_core.clinkr.group import ClinkrGroup, discover_group


def build_cli() -> ClinkrGroup:
    """Build the standalone ``objective`` CLI group."""
    return discover_group(
        "twerk_objectives.cli.objective",
        context_settings={"help_option_names": ["-h", "--help"]},
        version_package_name="twerk-objectives",
    )


def main() -> None:
    """Entry point for the standalone ``objective`` CLI."""
    build_cli()()
