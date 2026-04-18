from __future__ import annotations

from collections.abc import Mapping

import click
from rich import box
from rich.console import Console
from rich.table import Table

from sklish.discovery import (
    InstalledManifestSource,
    Manifest,
    ManifestSource,
    SourceGroup,
    aggregate,
)
from sklish.invocation import (
    SCOPE_GLOBAL,
    SCOPE_PROJECT,
    SOURCE_TYPE_LOCAL,
    NpxRunner,
    RealNpxRunner,
    RealSkillStateSource,
    SkillStateSource,
    build_command,
    build_update_command,
    render_command,
)

SCOPE_CHOICES: tuple[str, ...] = ("user", "project", "both")


def _manifest_source(ctx: click.Context) -> ManifestSource:
    obj = ctx.ensure_object(dict)
    source = obj.get("manifest_source")
    if source is None:
        source = InstalledManifestSource()
        obj["manifest_source"] = source
    return source


def _npx_runner(ctx: click.Context) -> NpxRunner:
    obj = ctx.ensure_object(dict)
    runner = obj.get("npx_runner")
    if runner is None:
        runner = RealNpxRunner()
        obj["npx_runner"] = runner
    return runner


def _skill_state_source(ctx: click.Context) -> SkillStateSource:
    obj = ctx.ensure_object(dict)
    source = obj.get("skill_state_source")
    if source is None:
        source = RealSkillStateSource()
        obj["skill_state_source"] = source
    return source


@click.group(context_settings={"help_option_names": ["-h", "--help"]})
@click.version_option(package_name="sklish")
@click.pass_context
def cli(ctx: click.Context) -> None:
    """Install agent skills declared by installed Python packages."""
    ctx.ensure_object(dict)


def _select_manifests(
    ctx: click.Context,
    manifests: tuple[Manifest, ...],
    packages: tuple[str, ...],
    all_packages: bool,
) -> tuple[Manifest, ...]:
    if all_packages and packages:
        click.echo("--package and --all are mutually exclusive.", err=True)
        ctx.exit(2)
    if not all_packages and not packages:
        click.echo("Specify --package <name> (repeatable) or --all.", err=True)
        ctx.exit(2)
    if all_packages:
        return manifests
    known = {m.dist_name for m in manifests}
    unknown = [p for p in packages if p not in known]
    if unknown:
        click.echo(f"Unknown package(s): {', '.join(unknown)}", err=True)
        click.echo(f"Known packages: {', '.join(sorted(known))}", err=True)
        ctx.exit(2)
    wanted = set(packages)
    return tuple(m for m in manifests if m.dist_name in wanted)


def _targeting_options(f):
    f = click.option(
        "--all",
        "all_packages",
        is_flag=True,
        help="Include every declaring package.",
    )(f)
    f = click.option(
        "--package",
        "packages",
        multiple=True,
        metavar="NAME",
        help="Filter to a specific declaring package (repeatable).",
    )(f)
    return f


@cli.command(name="list")
@_targeting_options
@click.pass_context
def list_command(
    ctx: click.Context,
    packages: tuple[str, ...],
    all_packages: bool,
) -> None:
    """Print every declared skill: dist -> source -> skill -> installed scope."""
    manifests = _manifest_source(ctx).get_manifests()
    if not manifests:
        click.echo("No sklish manifests declared by installed packages.")
        return
    if not all_packages and not packages:
        all_packages = True
    selected = _select_manifests(ctx, manifests, packages, all_packages)
    states = _skill_state_source(ctx).get_states()
    table = Table(box=box.SIMPLE)
    table.add_column("Package", style="cyan", no_wrap=True)
    table.add_column("Source", style="magenta", no_wrap=True)
    table.add_column("Skill", style="green", no_wrap=True)
    table.add_column("Installed", no_wrap=True)
    for manifest in selected:
        source_link = f"[link=https://github.com/{manifest.source}]{manifest.source}[/link]"
        for skill in manifest.skills:
            skill_link = (
                f"[link=https://github.com/{manifest.source}/tree/HEAD/skills/{skill}]"
                f"{skill}[/link]"
            )
            installed = _format_installed(states.get(skill, {}))
            table.add_row(manifest.dist_name, source_link, skill_link, installed)
    Console().print(table)


def _format_installed(scopes: Mapping[str, str]) -> str:
    project_type = scopes.get(SCOPE_PROJECT)
    global_type = scopes.get(SCOPE_GLOBAL)
    resolved_type = project_type if project_type is not None else global_type
    if project_type is not None and global_type is not None:
        scope_label = "[bold bright_green]project+global[/bold bright_green]"
    elif project_type is not None:
        scope_label = "[green]project[/green]"
    elif global_type is not None:
        scope_label = "[blue]global[/blue]"
    else:
        return "[dim]—[/dim]"
    return f"{scope_label} [dim]({resolved_type})[/dim]"


@cli.command()
@_targeting_options
@click.option(
    "--scope",
    type=click.Choice(SCOPE_CHOICES),
    default=None,
    help="Install scope. Prompts if absent (default: project).",
)
@click.option(
    "--dry-run",
    is_flag=True,
    help="Print npx commands without running them.",
)
@click.pass_context
def install(
    ctx: click.Context,
    packages: tuple[str, ...],
    all_packages: bool,
    scope: str | None,
    dry_run: bool,
) -> None:
    """Install skills declared by installed packages via `npx skills add`."""
    manifest_source = _manifest_source(ctx)
    runner = _npx_runner(ctx)

    manifests = manifest_source.get_manifests()
    if not manifests:
        click.echo("No sklish manifests declared by installed packages.")
        return

    selected = _select_manifests(ctx, manifests, packages, all_packages)
    groups = aggregate(selected)

    if not dry_run and not runner.is_available():
        click.echo(
            "npx is not on PATH. Install Node.js (which provides npx), "
            "or re-run with --dry-run to see the commands that would run.",
            err=True,
        )
        ctx.exit(1)

    states = _skill_state_source(ctx).get_states()

    if scope is None and _all_covered(groups, states, _global_variants("project")):
        click.echo(
            "All selected skills already installed at project scope. "
            "Pass --scope user|both to target other scopes, "
            "or run `sklish update` to refresh installed skills."
        )
        return

    if scope is None:
        scope = click.prompt(
            "Install scope",
            type=click.Choice(SCOPE_CHOICES),
            default="project",
        )

    global_variants = _global_variants(scope)

    any_work = False
    for group in groups:
        for global_install in global_variants:
            target_scope = SCOPE_GLOBAL if global_install else SCOPE_PROJECT
            pending = tuple(s for s in group.skills if target_scope not in states.get(s, {}))
            if not pending:
                continue
            any_work = True
            argv = build_command(group.source, pending, global_install=global_install)
            if dry_run:
                click.echo(render_command(argv))
                continue
            exit_code = runner.run(argv)
            if exit_code != 0:
                ctx.exit(exit_code)

    if not any_work:
        click.echo(f"All selected skills already installed at {scope} scope.")


@cli.command()
@_targeting_options
@click.option(
    "--dry-run",
    is_flag=True,
    help="Print npx commands without running them.",
)
@click.pass_context
def update(
    ctx: click.Context,
    packages: tuple[str, ...],
    all_packages: bool,
    dry_run: bool,
) -> None:
    """Update installed skills in place via `npx skills update`. Scope is left unchanged."""
    manifest_source = _manifest_source(ctx)
    runner = _npx_runner(ctx)

    manifests = manifest_source.get_manifests()
    if not manifests:
        click.echo("No sklish manifests declared by installed packages.")
        return

    selected = _select_manifests(ctx, manifests, packages, all_packages)

    if not dry_run and not runner.is_available():
        click.echo(
            "npx is not on PATH. Install Node.js (which provides npx), "
            "or re-run with --dry-run to see the commands that would run.",
            err=True,
        )
        ctx.exit(1)

    states = _skill_state_source(ctx).get_states()

    seen: set[str] = set()
    ordered_skills: list[str] = []
    for manifest in selected:
        for name in manifest.skills:
            if name not in seen:
                seen.add(name)
                ordered_skills.append(name)

    any_work = False
    skipped_local: list[str] = []
    for global_scope in (False, True):
        target_scope = SCOPE_GLOBAL if global_scope else SCOPE_PROJECT
        here: list[str] = []
        for name in ordered_skills:
            source_type = states.get(name, {}).get(target_scope)
            if source_type is None:
                continue
            if source_type == SOURCE_TYPE_LOCAL:
                skipped_local.append(name)
                continue
            here.append(name)
        if not here:
            continue
        any_work = True
        argv = build_update_command(tuple(here), global_scope=global_scope)
        if dry_run:
            click.echo(render_command(argv))
            continue
        exit_code = runner.run(argv)
        if exit_code != 0:
            ctx.exit(exit_code)

    if skipped_local:
        unique = sorted(set(skipped_local))
        click.echo(f"Skipping local-source skills (managed in-tree): {', '.join(unique)}")

    if not any_work and not skipped_local:
        click.echo("No installed skills to update. Run `sklish install` first.")


def _global_variants(scope: str) -> tuple[bool, ...]:
    if scope == "user":
        return (True,)
    if scope == "both":
        return (False, True)
    return (False,)


def _all_covered(
    groups: tuple[SourceGroup, ...],
    states: Mapping[str, Mapping[str, str]],
    global_variants: tuple[bool, ...],
) -> bool:
    for group in groups:
        for skill in group.skills:
            scopes = states.get(skill, {})
            for global_install in global_variants:
                target_scope = SCOPE_GLOBAL if global_install else SCOPE_PROJECT
                if target_scope not in scopes:
                    return False
    return True


def main() -> None:
    cli()
