from __future__ import annotations

import sys
import tempfile
import urllib.parse
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path

import click

from asdl_core.cli_runtime import add_runtime_option
from packagechk.check import check_package_name, registry_selection
from packagechk.claim import (
    ClaimProjectSpec,
    NpmClaimProjectSpec,
    module_name_from_package,
    write_claim_project_files,
    write_npm_claim_project_files,
)
from packagechk.gateways.npm_publish.gateway import NpmPublishGateway
from packagechk.gateways.npm_publish.real import RealNpmPublishGateway
from packagechk.gateways.pypi_publish.gateway import PypiPublishError, PypiPublishGateway
from packagechk.gateways.pypi_publish.real import RealPypiPublishGateway
from packagechk.gateways.registries.gateway import PackageRegistryGateway
from packagechk.gateways.registries.real import RealPackageRegistryGateway
from packagechk.models import CheckStatus
from packagechk.npm import npm_validation_error
from packagechk.output import render_human, render_json
from packagechk.pypi import normalize_pypi_name, pypi_validation_error

REGISTRY_CHOICES = ("pypi", "npm", "brew")
LEGACY_CHECK_COMMAND_NAME = "check"
HELP_AND_VERSION_OPTIONS = {"-h", "--help", "--version", "--runtime"}
DEFAULT_CLAIM_VERSION = "0.0.1"
DEFAULT_CLAIM_DESCRIPTION = "Claimed package name"
DEFAULT_NPM_CLAIM_LICENSE = "MIT"


class PackagechkCommandGroup(click.Group):
    """Click group that preserves the historical bare-name check command."""

    def resolve_command(
        self,
        ctx: click.Context,
        args: list[str],
    ) -> tuple[str | None, click.Command | None, list[str]]:
        if args:
            first_arg = args[0]
            if first_arg in self.commands or first_arg in HELP_AND_VERSION_OPTIONS:
                return super().resolve_command(ctx, args)
            check_command = self.commands[LEGACY_CHECK_COMMAND_NAME]
            return LEGACY_CHECK_COMMAND_NAME, check_command, args
        return super().resolve_command(ctx, args)


def package_version() -> str:
    try:
        return version("packagechk")
    except PackageNotFoundError:
        return "0.1.0"


def build_cli(
    registry_gateway: PackageRegistryGateway | None = None,
    pypi_publish_gateway: PypiPublishGateway | None = None,
    npm_publish_gateway: NpmPublishGateway | None = None,
) -> click.Command:
    registry = registry_gateway or RealPackageRegistryGateway()
    publisher = pypi_publish_gateway or RealPypiPublishGateway()
    npm_publisher = npm_publish_gateway or RealNpmPublishGateway()

    @click.group(
        cls=PackagechkCommandGroup,
        name="packagechk",
        context_settings={
            "help_option_names": ["-h", "--help"],
            "ignore_unknown_options": True,
            "allow_extra_args": True,
        },
        help=(
            "Check whether a package name is available to claim.\n\n"
            "Default check path: packagechk NAME [--registry pypi|npm|brew] [--json]."
        ),
        no_args_is_help=False,
    )
    @click.version_option(package_version(), prog_name="packagechk")
    def cli() -> None:
        pass

    @click.command(
        name=LEGACY_CHECK_COMMAND_NAME,
        hidden=True,
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
    def check_command(name: str, registry_options: tuple[str, ...], json_output: bool) -> None:
        _run_check_command(
            name=name,
            registry_options=registry_options,
            json_output=json_output,
            registry_gateway=registry,
        )

    @click.command(
        name="claim-pypi",
        context_settings={"help_option_names": ["-h", "--help"]},
        help="Claim a PyPI package name by publishing a minimal placeholder package.",
    )
    @click.argument("name")
    @click.option(
        "--description",
        default=None,
        help="Package description. Defaults to a generic claim description.",
    )
    @click.option(
        "--version",
        "claim_version",
        default=DEFAULT_CLAIM_VERSION,
        show_default=True,
        help="Version to publish.",
    )
    @click.option("--dry-run", is_flag=True, help="Show planned operations without effects.")
    @click.option("--force", is_flag=True, help="Skip confirmation prompt.")
    @click.option("--skip-check", is_flag=True, help="Skip PyPI availability pre-check.")
    def claim_pypi_command(
        name: str,
        description: str | None,
        claim_version: str,
        dry_run: bool,
        force: bool,
        skip_check: bool,
    ) -> None:
        _run_claim_pypi_command(
            name=name,
            description=description,
            claim_version=claim_version,
            dry_run=dry_run,
            force=force,
            skip_check=skip_check,
            registry_gateway=registry,
            publish_gateway=publisher,
        )

    @click.command(
        name="claim-npm",
        context_settings={"help_option_names": ["-h", "--help"]},
        help=(
            "Claim an npm package name by publishing a minimal placeholder package. "
            "Requires `~/.npmrc` with a `_authToken` line (granular token with "
            "publish + bypass-2FA scopes) or equivalent auth picked up by `npm publish`."
        ),
    )
    @click.argument("name")
    @click.option(
        "--description",
        default=None,
        help="Package description. Defaults to a generic claim description.",
    )
    @click.option(
        "--version",
        "claim_version",
        default=DEFAULT_CLAIM_VERSION,
        show_default=True,
        help="Version to publish.",
    )
    @click.option("--dry-run", is_flag=True, help="Show planned operations without effects.")
    @click.option("--force", is_flag=True, help="Skip confirmation prompt.")
    @click.option("--skip-check", is_flag=True, help="Skip npm availability pre-check.")
    def claim_npm_command(
        name: str,
        description: str | None,
        claim_version: str,
        dry_run: bool,
        force: bool,
        skip_check: bool,
    ) -> None:
        _run_claim_npm_command(
            name=name,
            description=description,
            claim_version=claim_version,
            dry_run=dry_run,
            force=force,
            skip_check=skip_check,
            registry_gateway=registry,
            publish_gateway=npm_publisher,
        )

    add_runtime_option(cli, runtime="python", entry_point="packagechk.cli:main")
    cli.add_command(check_command)
    cli.add_command(claim_pypi_command)
    cli.add_command(claim_npm_command)
    return cli


def _run_check_command(
    *,
    name: str,
    registry_options: tuple[str, ...],
    json_output: bool,
    registry_gateway: PackageRegistryGateway,
) -> None:
    registries = registry_selection(registry_options)
    report = check_package_name(
        package_name=name,
        registries=registries,
        registry_gateway=registry_gateway,
    )
    if json_output:
        click.echo(render_json(report))
    else:
        click.echo(render_human(report), err=report.exit_code == 2)
    raise SystemExit(report.exit_code)


def _run_claim_pypi_command(
    *,
    name: str,
    description: str | None,
    claim_version: str,
    dry_run: bool,
    force: bool,
    skip_check: bool,
    registry_gateway: PackageRegistryGateway,
    publish_gateway: PypiPublishGateway,
) -> None:
    validation_error = pypi_validation_error(name)
    if validation_error is not None:
        click.echo(f"pypi: invalid: {validation_error}", err=True)
        raise SystemExit(2)

    lookup_name = normalize_pypi_name(name)
    module_name = module_name_from_package(lookup_name)
    spec = ClaimProjectSpec(
        package_name=name,
        module_name=module_name,
        description=description or DEFAULT_CLAIM_DESCRIPTION,
        version=claim_version,
    )

    if dry_run:
        _render_claim_dry_run(spec=spec, lookup_name=lookup_name, skip_check=skip_check)
        raise SystemExit(0)

    if lookup_name != name:
        click.echo(f"PyPI lookup name: {lookup_name}", err=True)

    if not skip_check:
        check_result = registry_gateway.check_pypi(name)
        if check_result.status is CheckStatus.TAKEN:
            click.echo(f"pypi: taken: {check_result.message}", err=True)
            if check_result.package_url is not None:
                click.echo(check_result.package_url, err=True)
            raise SystemExit(1)
        if check_result.status is not CheckStatus.AVAILABLE:
            click.echo(f"pypi: {check_result.status.value}: {check_result.message}", err=True)
            raise SystemExit(2)

    tools_error = publish_gateway.ensure_publish_tools_available()
    if tools_error is not None:
        click.echo(tools_error, err=True)
        raise SystemExit(2)

    if not force:
        click.echo("Warning: this will publish a real package to PyPI.", err=True)
        click.echo(f"Package: {name} ({claim_version})", err=True)
        sys.stderr.flush()
        if not click.confirm("Continue?", default=False, err=True):
            click.echo("Aborted by user.", err=True)
            raise SystemExit(1)

    with tempfile.TemporaryDirectory(prefix="packagechk-claim-pypi-") as temporary_dir:
        project_dir = Path(temporary_dir)
        write_claim_project_files(project_dir, spec)
        click.echo("Building placeholder package with uv build...", err=True)
        try:
            artifacts = publish_gateway.build_package(project_dir)
        except PypiPublishError as error:
            click.echo(str(error), err=True)
            raise SystemExit(2) from error

        if not artifacts:
            click.echo("No distribution artifacts were built.", err=True)
            raise SystemExit(2)

        click.echo("Publishing placeholder package with uvx uv-publish...", err=True)
        publish_error = publish_gateway.publish_artifacts(project_dir, artifacts)
        if publish_error is not None:
            click.echo(publish_error, err=True)
            raise SystemExit(2)

    click.echo(f"✓ Claimed PyPI package name {name!r}.", err=True)
    click.echo(f"View project: {_pypi_project_url(lookup_name)}", err=True)
    raise SystemExit(0)


def _render_claim_dry_run(*, spec: ClaimProjectSpec, lookup_name: str, skip_check: bool) -> None:
    click.echo(f"[DRY RUN] Would claim PyPI package name {spec.package_name!r}.", err=True)
    click.echo(f"Package name: {spec.package_name}", err=True)
    if lookup_name != spec.package_name:
        click.echo(f"PyPI lookup name: {lookup_name}", err=True)
    click.echo(f"Version: {spec.version}", err=True)
    click.echo(f"Description: {spec.description}", err=True)
    click.echo(f"Module name: {spec.module_name}", err=True)
    if skip_check:
        click.echo("Availability check: skipped (--skip-check)", err=True)
    else:
        click.echo("Availability check: would check PyPI before publishing", err=True)
    click.echo("Would create a temporary placeholder project directory", err=True)
    click.echo("Would write: pyproject.toml", err=True)
    click.echo(f"Would write: src/{spec.module_name}/__init__.py", err=True)
    click.echo("Would run: uv build", err=True)
    click.echo("Would run: uvx uv-publish <artifacts>", err=True)
    click.echo(f"PyPI URL: {_pypi_project_url(lookup_name)}", err=True)


def _pypi_project_url(normalized_name: str) -> str:
    quoted_name = urllib.parse.quote(normalized_name, safe="")
    return f"https://pypi.org/project/{quoted_name}/"


def _run_claim_npm_command(
    *,
    name: str,
    description: str | None,
    claim_version: str,
    dry_run: bool,
    force: bool,
    skip_check: bool,
    registry_gateway: PackageRegistryGateway,
    publish_gateway: NpmPublishGateway,
) -> None:
    validation_error = npm_validation_error(name)
    if validation_error is not None:
        click.echo(f"npm: invalid: {validation_error}", err=True)
        raise SystemExit(2)

    spec = NpmClaimProjectSpec(
        package_name=name,
        description=description or DEFAULT_CLAIM_DESCRIPTION,
        version=claim_version,
        license=DEFAULT_NPM_CLAIM_LICENSE,
    )

    if dry_run:
        _render_claim_npm_dry_run(spec=spec, skip_check=skip_check)
        raise SystemExit(0)

    if not skip_check:
        check_result = registry_gateway.check_npm(name)
        if check_result.status is CheckStatus.TAKEN:
            click.echo(f"npm: taken: {check_result.message}", err=True)
            if check_result.package_url is not None:
                click.echo(check_result.package_url, err=True)
            raise SystemExit(1)
        if check_result.status is not CheckStatus.AVAILABLE:
            click.echo(f"npm: {check_result.status.value}: {check_result.message}", err=True)
            raise SystemExit(2)

    tools_error = publish_gateway.ensure_publish_tools_available()
    if tools_error is not None:
        click.echo(tools_error, err=True)
        raise SystemExit(2)

    if not force:
        click.echo("Warning: this will publish a real package to npm.", err=True)
        click.echo(f"Package: {name} ({claim_version})", err=True)
        sys.stderr.flush()
        if not click.confirm("Continue?", default=False, err=True):
            click.echo("Aborted by user.", err=True)
            raise SystemExit(1)

    with tempfile.TemporaryDirectory(prefix="packagechk-claim-npm-") as temporary_dir:
        project_dir = Path(temporary_dir)
        write_npm_claim_project_files(project_dir, spec)
        click.echo("Publishing placeholder package with npm publish...", err=True)
        publish_error = publish_gateway.publish_project(project_dir)
        if publish_error is not None:
            click.echo(publish_error, err=True)
            raise SystemExit(2)

    click.echo(f"✓ Claimed npm package name {name!r}.", err=True)
    click.echo(f"View package: {_npm_package_url(name)}", err=True)
    raise SystemExit(0)


def _render_claim_npm_dry_run(*, spec: NpmClaimProjectSpec, skip_check: bool) -> None:
    click.echo(f"[DRY RUN] Would claim npm package name {spec.package_name!r}.", err=True)
    click.echo(f"Package name: {spec.package_name}", err=True)
    click.echo(f"Version: {spec.version}", err=True)
    click.echo(f"Description: {spec.description}", err=True)
    click.echo(f"License: {spec.license}", err=True)
    if skip_check:
        click.echo("Availability check: skipped (--skip-check)", err=True)
    else:
        click.echo("Availability check: would check npm before publishing", err=True)
    click.echo("Would create a temporary placeholder project directory", err=True)
    click.echo("Would write: package.json", err=True)
    click.echo("Would write: README.md", err=True)
    click.echo("Would write: index.js", err=True)
    click.echo("Would run: npm publish --access=public", err=True)
    click.echo(f"npm URL: {_npm_package_url(spec.package_name)}", err=True)


def _npm_package_url(package_name: str) -> str:
    quoted_name = urllib.parse.quote(package_name, safe="@/")
    return f"https://www.npmjs.com/package/{quoted_name}"


def main() -> None:
    build_cli()()
