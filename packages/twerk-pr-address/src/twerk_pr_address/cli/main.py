from __future__ import annotations

from twerk_core.clinkr.group import ClinkrGroup, discover_group


def build_cli() -> ClinkrGroup:
    """Build the standalone ``pr-address`` CLI group."""
    return discover_group(
        "twerk_pr_address.cli.pr_address",
        context_settings={"help_option_names": ["-h", "--help"]},
        version_package_name="twerk-pr-address",
    )


def main() -> None:
    """Entry point for the standalone ``pr-address`` CLI."""
    build_cli()()
