"""``objective branches`` read-only inventory across local branch tips."""

from __future__ import annotations

import click

from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.failure import ClinkrFailure
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_core.console import get_console, make_table
from asdl_core.format import format_relative_time
from asdl_core.git.types import GitCommandFailure
from asdl_objectives.context import (
    ObjectiveCliContext,
    ObjectiveCliUnavailable,
    load_objective_context,
)

OBJECTIVE_ROOT = ".asdl/objectives"


class ObjectiveBranchesRequest(ClinkrModel):
    pass


class ObjectiveBranchEntry(ClinkrModel):
    branch: str
    tip_head_iso: str | None
    ahead_trunk: int


class ObjectiveBranchGroup(ClinkrModel):
    slug: str
    branches: tuple[ObjectiveBranchEntry, ...]


class ObjectiveBranchesResult(ClinkrModel):
    trunk_branch: str
    groups: tuple[ObjectiveBranchGroup, ...]


def render_objective_branches_human(result: ObjectiveBranchesResult) -> None:
    console = get_console()
    if not result.groups:
        console.print("[dim]No open Objective branch states found.[/dim]")
        return

    console.print("[bold]Open Objectives across local branches[/bold]")
    for group in result.groups:
        console.print()
        console.print(f"[bold cyan]{group.slug}[/bold cyan]")
        table = make_table()
        table.add_column("Branch", style="bold", no_wrap=True)
        table.add_column("Tip age", no_wrap=True)
        table.add_column("Ahead trunk", justify="right", no_wrap=True)
        for entry in group.branches:
            table.add_row(
                entry.branch,
                format_relative_time(entry.tip_head_iso),
                f"+{entry.ahead_trunk}",
            )
        console.print(table)


def render_objective_branches_markdown(result: ObjectiveBranchesResult) -> None:
    click.echo("# Open Objectives across local branches")
    if not result.groups:
        click.echo()
        click.echo("No open Objective branch states found.")
        return

    for group in result.groups:
        click.echo()
        click.echo(f"## {group.slug}")
        click.echo()
        click.echo("| branch | tip age | ahead trunk |")
        click.echo("| --- | --- | ---: |")
        for entry in group.branches:
            click.echo(
                f"| `{entry.branch}` | "
                f"{format_relative_time(entry.tip_head_iso)} | "
                f"+{entry.ahead_trunk} |"
            )


@clinkr_operation(
    name="branches",
    help="List open Objective branch states across local branches.",
    human_renderer=render_objective_branches_human,
    markdown_renderer=render_objective_branches_markdown,
)
def run_objective_branches(
    ctx: click.Context,
    request: ObjectiveBranchesRequest,
) -> ClinkrExit[ObjectiveBranchesResult]:
    del request
    objective_ctx = load_objective_context(ctx)
    if isinstance(objective_ctx, ObjectiveCliUnavailable):
        return ClinkrExit.failure(error_type="not_in_repo", message=objective_ctx.message)
    return ClinkrExit.ok(build_objective_branches_result(objective_ctx))


def build_objective_branches_result(ctx: ObjectiveCliContext) -> ObjectiveBranchesResult:
    rows_by_slug: dict[str, list[ObjectiveBranchEntry]] = {}
    trunk = ctx.trunk_branch

    for branch in ctx.git.list_local_branches():
        if branch == trunk:
            continue

        ref = f"refs/heads/{branch}"
        slugs_result = ctx.git.list_directories_at_ref(ref, OBJECTIVE_ROOT)
        if isinstance(slugs_result, GitCommandFailure):
            raise ClinkrFailure(
                error_type="git_list_objectives_failed",
                message=slugs_result.message,
            )

        open_slugs = tuple(
            slug
            for slug in sorted(slugs_result)
            if not ctx.git.path_exists_at_ref(ref, f"{OBJECTIVE_ROOT}/{slug}/closed.md")
        )
        if not open_slugs:
            continue

        ahead_result = ctx.git.count_commits_in_range(f"{trunk}..{branch}")
        if isinstance(ahead_result, GitCommandFailure):
            raise ClinkrFailure(
                error_type="git_ahead_count_failed",
                message=ahead_result.message,
            )
        tip_head_iso = ctx.git.branch_head_iso(branch)

        for slug in open_slugs:
            rows_by_slug.setdefault(slug, []).append(
                ObjectiveBranchEntry(
                    branch=branch,
                    tip_head_iso=tip_head_iso,
                    ahead_trunk=ahead_result,
                )
            )

    return ObjectiveBranchesResult(
        trunk_branch=trunk,
        groups=tuple(
            ObjectiveBranchGroup(
                slug=slug,
                branches=tuple(sorted(entries, key=lambda entry: entry.branch)),
            )
            for slug, entries in sorted(rows_by_slug.items())
        ),
    )
