"""List directed handoff artifacts."""

from __future__ import annotations

from itertools import groupby
from typing import Literal

import click

from asdl_core.clinkr.context import load_typed_context
from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_core.git.types import DetachedHead, GitCommandFailure
from asdl_handoff.cli.handoff.context import HandoffCliContext
from brmem.key_validation import check_key
from brmem.ref_layout import EntryRef, check_branch_name

HANDOFF_NAMESPACE = "handoffs"
_HANDOFF_KEY_SUFFIX = ".md"


class ListHandoffsRequest(ClinkrModel):
    branch: str | None = None
    all_branches: bool = False


class HandoffSummary(ClinkrModel):
    branch: str
    slug: str
    key: str
    entry_locator: str


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
        for group_index, (branch, handoffs) in enumerate(
            groupby(result.handoffs, key=lambda handoff: handoff.branch)
        ):
            if group_index > 0:
                click.echo()
            click.echo(branch)
            for handoff in handoffs:
                click.echo(f"  - {handoff.slug}")
        return

    click.echo(f"Handoffs on {result.branch}")
    click.echo()
    for handoff in result.handoffs:
        click.echo(f"  - {handoff.slug}")


@clinkr_operation(
    name="list",
    help=(
        "List saved handoffs. Defaults to the current branch; pass --branch to override "
        "or --all-branches to include every branch."
    ),
    human_renderer=render_list_handoffs,
)
def run_list_handoffs(
    ctx: click.Context,
    request: ListHandoffsRequest,
) -> ClinkrExit[ListHandoffsResult]:
    handoff_context = load_typed_context(ctx, HandoffCliContext)

    Ensure.true(
        not (request.branch is not None and request.all_branches),
        error_type="branch_and_all_branches_conflict",
        message="--branch and --all-branches are mutually exclusive.",
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
            handoffs=_handoffs_from_entries(entries),
        )
    )


def _resolve_branch(context: HandoffCliContext, requested_branch: str | None) -> str:
    if requested_branch is not None:
        return requested_branch

    current = context.git_gateway.get_current_branch(context.cwd)
    if isinstance(current, DetachedHead):
        Ensure.fail(
            error_type="detached_head",
            message=(
                "Cannot list handoffs in detached HEAD; pass --branch <branch> or --all-branches."
            ),
        )
    if isinstance(current, GitCommandFailure):
        Ensure.fail(error_type=current.error_type, message=current.message)
    return current


def _handoffs_from_entries(entries: list[EntryRef]) -> list[HandoffSummary]:
    handoffs: list[HandoffSummary] = []
    seen: set[tuple[str, str]] = set()
    for entry in entries:
        if entry.namespace != HANDOFF_NAMESPACE or not _is_handoff_key(entry.key):
            continue
        identity = (entry.branch, entry.key)
        if identity in seen:
            continue
        seen.add(identity)
        handoffs.append(
            HandoffSummary(
                branch=entry.branch,
                slug=_handoff_slug(entry.key),
                key=entry.key,
                entry_locator=entry.entry_locator,
            )
        )
    return sorted(handoffs, key=lambda handoff: (handoff.branch, handoff.slug))


def _is_handoff_key(key: str) -> bool:
    return (
        key.endswith(_HANDOFF_KEY_SUFFIX)
        and "/" not in key
        and len(key) > len(_HANDOFF_KEY_SUFFIX)
        and check_key(key) is None
    )


def _handoff_slug(key: str) -> str:
    return key[: -len(_HANDOFF_KEY_SUFFIX)]
