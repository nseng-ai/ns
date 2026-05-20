from __future__ import annotations

from importlib.metadata import PackageNotFoundError, version

import click

from packagechk.check import check_package_name, registry_selection
from packagechk.gateways.registries.gateway import PackageRegistryGateway
from packagechk.gateways.registries.real import RealPackageRegistryGateway
from packagechk.output import render_human, render_json

REGISTRY_CHOICES = ("pypi", "npm", "brew")


def package_version() -> str:
    try:
        return version("packagechk")
    except PackageNotFoundError:
        return "0.1.0"


def build_cli(registry_gateway: PackageRegistryGateway | None = None) -> click.Command:
    gateway = registry_gateway or RealPackageRegistryGateway()

    @click.command(
        name="packagechk",
        context_settings={"help_option_names": ["-h", "--help"]},
        help="Check whether a package name is available to claim.",
    )
    @click.argument("name")
    @click.option(
        "--registry",
        "registry_options",
        type=click.Choice(REGISTRY_CHOICES),
        multiple=True,
        help="Registry to check. May be repeated. Defaults to PyPI and npm.",
    )
    @click.option("--json", "json_output", is_flag=True, help="Emit JSON output.")
    @click.version_option(package_version(), prog_name="packagechk")
    def cli(name: str, registry_options: tuple[str, ...], json_output: bool) -> None:
        registries = registry_selection(registry_options)
        report = check_package_name(
            package_name=name,
            registries=registries,
            registry_gateway=gateway,
        )
        if json_output:
            click.echo(render_json(report))
        else:
            click.echo(render_human(report), err=report.exit_code == 2)
        raise SystemExit(report.exit_code)

    return cli


def main() -> None:
    build_cli()()
