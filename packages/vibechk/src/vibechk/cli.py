from __future__ import annotations

import json
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path

import click

from asdl_core.cli_runtime import add_runtime_option
from vibechk.deps import CliDeps
from vibechk.errors import VibechkError
from vibechk.reports import (
    render_comparison_report,
    render_run_report,
    render_runs_table,
    run_list_entry_to_json,
)
from vibechk.store import list_bundles, read_bundle, resolve_store_root
from vibechk.workflow import execute_run


def package_version() -> str:
    try:
        return version("vibechk")
    except PackageNotFoundError:
        return "0.1.0"


def build_cli(deps: CliDeps | None = None) -> click.Command:
    def get_deps() -> CliDeps:
        if deps is not None:
            return deps
        return CliDeps.production()

    @click.group(
        name="vibechk",
        context_settings={"help_option_names": ["-h", "--help"]},
        help="Run lightweight agent context evals and publish Markdown evidence.",
        no_args_is_help=True,
    )
    @click.version_option(package_version(), prog_name="vibechk")
    def cli() -> None:
        pass

    @click.command(
        name="run",
        context_settings={"help_option_names": ["-h", "--help"]},
        help=(
            "Run a plan in a clean git workdir and persist a local run bundle. "
            "No runtime budget is applied by default."
        ),
    )
    @click.option(
        "--plan",
        "plan_path",
        required=True,
        type=click.Path(exists=True, dir_okay=False, readable=True, path_type=Path),
        help="Plan Markdown file to execute.",
    )
    @click.option(
        "--workdir",
        default=Path("."),
        show_default=True,
        type=click.Path(exists=True, file_okay=False, path_type=Path),
        help="Clean git workdir where the runner should execute.",
    )
    @click.option(
        "--runner",
        "runner_name",
        default=None,
        help="Runner adapter name. Defaults to the first production adapter.",
    )
    @click.option("--model", default=None, help="Optional model name passed to the runner.")
    @click.option(
        "--store",
        "store_path",
        default=None,
        type=click.Path(file_okay=False, path_type=Path),
        help="Override vibechk store root.",
    )
    def run_command(
        plan_path: Path,
        workdir: Path,
        runner_name: str | None,
        model: str | None,
        store_path: Path | None,
    ) -> None:
        try:
            active_deps = get_deps()
            result = execute_run(
                plan_path=plan_path,
                workdir=workdir,
                runner_name=runner_name or active_deps.default_runner_name,
                model=model,
                store=store_path,
                deps=active_deps,
            )
        except VibechkError as error:
            raise click.ClickException(str(error)) from None

        click.echo(f"Run ID: {result.run_id}")
        if result.exit_code != 0:
            raise SystemExit(result.exit_code)

    @click.command(
        name="runs",
        context_settings={"help_option_names": ["-h", "--help"]},
        help="List local vibechk run bundles from the configured store.",
    )
    @click.option(
        "--store",
        "store_path",
        default=None,
        type=click.Path(file_okay=False, path_type=Path),
        help="Override vibechk store root.",
    )
    @click.option(
        "--format",
        "output_format",
        type=click.Choice(["table", "json"]),
        default="table",
        show_default=True,
        help="Output format.",
    )
    def runs_command(store_path: Path | None, output_format: str) -> None:
        try:
            store_root = resolve_store_root(store_path)
            loaded = list_bundles(store_root)
        except VibechkError as error:
            raise click.ClickException(str(error)) from None

        if output_format == "json":
            click.echo(json.dumps([run_list_entry_to_json(item) for item in loaded], indent=2))
            return

        if not loaded:
            click.echo("No vibechk runs found.")
            return

        click.echo(render_runs_table(loaded))

    @click.command(
        name="show",
        context_settings={"help_option_names": ["-h", "--help"]},
        help="Render a Markdown report for a local run bundle.",
    )
    @click.argument("run_id")
    @click.option(
        "--store",
        "store_path",
        default=None,
        type=click.Path(file_okay=False, path_type=Path),
        help="Override vibechk store root.",
    )
    def show_command(run_id: str, store_path: Path | None) -> None:
        try:
            store_root = resolve_store_root(store_path)
            loaded = read_bundle(store_root, run_id)
        except VibechkError as error:
            raise click.ClickException(str(error)) from None
        click.echo(render_run_report(loaded), nl=False)

    @click.command(
        name="diff",
        context_settings={"help_option_names": ["-h", "--help"]},
        help="Render a Markdown comparison between two local run bundles.",
    )
    @click.argument("baseline_id")
    @click.argument("treatment_id")
    @click.option(
        "--store",
        "store_path",
        default=None,
        type=click.Path(file_okay=False, path_type=Path),
        help="Override vibechk store root.",
    )
    def diff_command(baseline_id: str, treatment_id: str, store_path: Path | None) -> None:
        try:
            store_root = resolve_store_root(store_path)
            baseline = read_bundle(store_root, baseline_id)
            treatment = read_bundle(store_root, treatment_id)
        except VibechkError as error:
            raise click.ClickException(str(error)) from None
        click.echo(render_comparison_report(baseline, treatment), nl=False)

    add_runtime_option(cli, runtime="python", entry_point="vibechk.cli:main")
    cli.add_command(run_command)
    cli.add_command(runs_command)
    cli.add_command(show_command)
    cli.add_command(diff_command)
    return cli


def main() -> None:
    build_cli()()
