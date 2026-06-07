"""List directed handoff artifacts."""

from __future__ import annotations

from typing import Annotated, Literal

import click

from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_core.console import get_console, make_table
from asdl_core.format import format_relative_time
from asdl_core.git.types import DetachedHead, GitCommandFailure
from asdl_handoff.cli.handoff.context import HandoffCliContext, load_handoff_context
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
            help="List handoffs across every active branch.",
        ),
    ] = False
    include_deleted: Annotated[
        bool,
        click.Option(
            ["--include-deleted"],
            is_flag=True,
            default=False,
            help="Include handoffs whose local branch no longer exists.",
        ),
    ] = False


class ListHandoffsResult(ClinkrModel):
    scope: Literal["branch", "all-branches"]
    branch: str | None
    include_deleted: bool
    handoffs: list[HandoffSummary]


def render_list_handoffs(result: ListHandoffsResult) -> None:
    if not result.handoffs:
        if result.scope == "all-branches":
            click.echo(_all_branches_empty_message(result))
            return
        click.echo(f"No handoffs found on branch {result.branch}.")
        return

    if result.scope == "all-branches":
        click.echo(_all_branches_title(result))
        click.echo()
        _render_all_branches_human_table(result.handoffs)
        return

    click.echo(f"Handoffs on {result.branch}")
    click.echo()
    _render_branch_human_table(result.handoffs)


def render_list_handoffs_markdown(result: ListHandoffsResult) -> None:
    if not result.handoffs:
        if result.scope == "all-branches":
            click.echo(_all_branches_empty_message(result))
            return
        click.echo(f"No handoffs found on branch {result.branch}.")
        return

    if result.scope == "all-branches":
        click.echo(_all_branches_title(result))
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


def _all_branches_title(result: ListHandoffsResult) -> str:
    if result.include_deleted:
        return "Handoffs across branches"
    return "Handoffs across active branches"


def _all_branches_empty_message(result: ListHandoffsResult) -> str:
    if result.include_deleted:
        return "No handoffs found across branches."
    return "No handoffs found across active branches."


@clinkr_operation(
    name="list",
    help=(
        "List handoffs. Defaults to the current branch. Pass --all to list "
        "across active branches or --include-deleted to include deleted local branches."
    ),
    human_renderer=render_list_handoffs,
    markdown_renderer=render_list_handoffs_markdown,
)
def run_list_handoffs(
    ctx: click.Context,
    request: ListHandoffsRequest,
) -> ClinkrExit[ListHandoffsResult]:
    handoff_context = load_handoff_context(ctx)

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
            include_deleted=request.include_deleted,
            handoffs=collect_handoff_summaries(
                entries,
                handoff_context.brmem_gateway,
                handoff_context.git_gateway,
                include_deleted=request.include_deleted,
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
