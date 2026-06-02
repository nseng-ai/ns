"""List directed handoff artifacts."""

from __future__ import annotations

from typing import Annotated, Literal

import click

from asdl_core.clinkr.context import load_typed_context
from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_core.console import get_console, make_table
from asdl_core.format import format_relative_time
from asdl_core.git.types import DetachedHead, GitCommandFailure
from asdl_handoff.cli.handoff.context import HandoffCliContext
from asdl_handoff.cli.handoff.inventory import (
    HANDOFF_NAMESPACE,
    HandoffSummary,
    collect_handoff_summaries,
)
from brmem.ref_layout import check_branch_name


class ListHandoffsRequest(ClinkrModel):
    branch: str | None = None
    all_branches: Annotated[
        bool,
        click.Option(
            ["--all"],
            is_flag=True,
            default=False,
            help="List handoffs across every branch.",
        ),
    ] = False


class ListHandoffsResult(ClinkrModel):
    scope: Literal["branch", "all-branches"]
    branch: str | None
    handoffs: list[HandoffSummary]


def render_list_handoffs(result: ListHandoffsResult) -> None:
    if not result.handoffs:
        if result.scope == "all-branches":
            click.echo("No saved handoffs found across branches.")
            return
        click.echo(f"No saved handoffs found on branch {result.branch}.")
        return

    if result.scope == "all-branches":
        click.echo("Handoffs across branches")
        click.echo()
        _render_all_branches_human_table(result.handoffs)
        return

    click.echo(f"Handoffs on {result.branch}")
    click.echo()
    _render_branch_human_table(result.handoffs)


def render_list_handoffs_markdown(result: ListHandoffsResult) -> None:
    if not result.handoffs:
        if result.scope == "all-branches":
            click.echo("No saved handoffs found across branches.")
            return
        click.echo(f"No saved handoffs found on branch {result.branch}.")
        return

    if result.scope == "all-branches":
        click.echo("Handoffs across branches")
        click.echo()
        click.echo("| branch | state | handoff | updated |")
        click.echo("| --- | --- | --- | --- |")
        for handoff in result.handoffs:
            click.echo(
                f"| {_markdown_table_cell(handoff.branch)} "
                f"| {_markdown_table_cell(handoff.branch_state)} "
                f"| {_markdown_table_cell(handoff.slug)} "
                f"| {_markdown_table_cell(handoff.updated_at)} |"
            )
        return

    click.echo(f"Handoffs on {result.branch}")
    click.echo()
    click.echo("| handoff | updated |")
    click.echo("| --- | --- |")
    for handoff in result.handoffs:
        click.echo(
            f"| {_markdown_table_cell(handoff.slug)} | {_markdown_table_cell(handoff.updated_at)} |"
        )


@clinkr_operation(
    name="list",
    help=(
        "List saved handoffs. Defaults to the current branch; pass --branch to override "
        "or --all to include every branch."
    ),
    human_renderer=render_list_handoffs,
    markdown_renderer=render_list_handoffs_markdown,
)
def run_list_handoffs(
    ctx: click.Context,
    request: ListHandoffsRequest,
) -> ClinkrExit[ListHandoffsResult]:
    handoff_context = load_typed_context(ctx, HandoffCliContext)

    Ensure.true(
        not (request.branch is not None and request.all_branches),
        error_type="branch_and_all_conflict",
        message="--branch and --all are mutually exclusive.",
    )

    validation_failure = None if request.branch is None else check_branch_name(request.branch)
    Ensure.true(
        validation_failure is None,
        error_type="invalid_branch_name",
        message=validation_failure or "invalid branch name",
    )

    branch = None if request.all_branches else _resolve_branch(handoff_context, request.branch)
    entries = handoff_context.brmem_gateway.list_entries(
        namespace=HANDOFF_NAMESPACE,
        branch=branch,
    )
    return ClinkrExit.ok(
        ListHandoffsResult(
            scope="all-branches" if request.all_branches else "branch",
            branch=branch,
            handoffs=collect_handoff_summaries(
                entries,
                handoff_context.brmem_gateway,
                handoff_context.git_gateway,
            ),
        )
    )


def _render_branch_human_table(handoffs: list[HandoffSummary]) -> None:
    table = make_table()
    table.add_column(
        "Handoff",
        style="bold cyan",
        no_wrap=True,
        overflow="ellipsis",
        ratio=1,
    )
    table.add_column("Updated", no_wrap=True)
    for handoff in handoffs:
        table.add_row(handoff.slug, _format_updated_age(handoff.updated_at))
    get_console().print(table)


def _render_all_branches_human_table(handoffs: list[HandoffSummary]) -> None:
    table = make_table()
    table.add_column("Branch", no_wrap=True, overflow="ellipsis", ratio=1)
    table.add_column("State", no_wrap=True)
    table.add_column(
        "Handoff",
        style="bold cyan",
        no_wrap=True,
        overflow="ellipsis",
        ratio=1,
    )
    table.add_column("Updated", no_wrap=True)
    for handoff in handoffs:
        table.add_row(
            handoff.branch,
            handoff.branch_state,
            handoff.slug,
            _format_updated_age(handoff.updated_at),
        )
    get_console().print(table)


def _format_updated_age(updated_at: str) -> str:
    formatted = format_relative_time(updated_at)
    if formatted == "":
        return updated_at
    return formatted


def _markdown_table_cell(value: str) -> str:
    return value.replace("|", r"\|")


def _resolve_branch(context: HandoffCliContext, requested_branch: str | None) -> str:
    if requested_branch is not None:
        return requested_branch

    current = context.git_gateway.get_current_branch(context.cwd)
    if isinstance(current, DetachedHead):
        Ensure.fail(
            error_type="detached_head",
            message="Cannot list handoffs in detached HEAD; pass --branch <branch> or --all.",
        )
    if isinstance(current, GitCommandFailure):
        Ensure.fail(error_type=current.error_type, message=current.message)
    return current
