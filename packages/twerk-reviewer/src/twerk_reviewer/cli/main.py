from __future__ import annotations

from twerk_core.clinkr.group import ClinkrGroup
from twerk_core.plugin import build_standalone_cli, invoke_standalone_cli
from twerk_reviewer.cli.plugin import build_reviewer_plugin


def build_cli() -> ClinkrGroup:
    """Build the standalone ``reviewer`` CLI group."""
    return build_standalone_cli(build_reviewer_plugin(), package_name="twerk-reviewer")


def main() -> None:
    """Entry point for the standalone ``reviewer`` CLI."""
    invoke_standalone_cli(build_reviewer_plugin(), package_name="twerk-reviewer")
