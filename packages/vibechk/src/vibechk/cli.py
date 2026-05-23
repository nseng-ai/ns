from __future__ import annotations

from importlib.metadata import PackageNotFoundError, version

import click


def package_version() -> str:
    try:
        return version("vibechk")
    except PackageNotFoundError:
        return "0.1.0"


def build_cli() -> click.Command:
    @click.group(
        name="vibechk",
        context_settings={"help_option_names": ["-h", "--help"]},
        help="Run lightweight agent context evals and publish Markdown evidence.",
        no_args_is_help=True,
    )
    @click.version_option(package_version(), prog_name="vibechk")
    def cli() -> None:
        pass

    return cli


def main() -> None:
    build_cli()()
