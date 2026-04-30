"""List objective snapshots across the repo or on a specific branch."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated, Any, Literal

import click

from brmem.gateway import EntryRef, check_branch_name
from brmem.validation import first_failure
from twerk_core.clinkr.context import load_typed_context
from twerk_core.clinkr.dataclass_json import JsonSerializable
from twerk_core.clinkr.ensure import Ensure
from twerk_core.clinkr.exit import ClinkrExit
from twerk_core.clinkr.failure import ClinkrFailure
from twerk_core.clinkr.operation import clinkr_operation
from twerk_core.git.types import DetachedHead, GitCommandFailure
from twerk_objectives.context import ObjectiveCliContext
from twerk_objectives.discovery import (
    OBJECTIVE_STATES,
    ObjectiveRepoEntry,
    ObjectiveState,
    discover_objectives,
    slug_for_key,
)
from twerk_objectives.gateway_access import (
    OBJECTIVE_NAMESPACE,
    resolve_current_objective_branch,
)


@dataclass(frozen=True)
class ObjectiveListRequest:
    branch: str | None = None
    here: bool = False
    include_closed: Annotated[
        bool,
        click.Option(
            ["--all"],
            is_flag=True,
            default=False,
            help="Include closed objectives in the listing.",
        ),
    ] = False
    closed_only: Annotated[
        bool,
        click.Option(
            ["--closed"],
            is_flag=True,
            default=False,
            help="Show only closed objectives.",
        ),
    ] = False


@dataclass(frozen=True)
class ObjectiveListResult(JsonSerializable):
    scope: Literal["branch", "repo"]
    branch: str | None = None
    entries: tuple[EntryRef, ...] = ()
    objectives: tuple[ObjectiveRepoEntry, ...] = ()

    @property
    def branch_slugs(self) -> tuple[str, ...]:
        return tuple(sorted({slug_for_key(entry.key) for entry in self.entries}))

    def to_json_dict(self) -> dict[str, Any]:
        if self.scope == "branch":
            return {
                "branch": self.branch,
                "slugs": list(self.branch_slugs),
                "entries": [
                    {
                        "namespace": entry.namespace,
                        "key": entry.key,
                        "branch": entry.branch,
                        "ref_name": entry.ref_name,
                    }
                    for entry in self.entries
                ],
            }
        return {
            "scope": "repo",
            "objectives": [
                {
                    "slug": m.slug,
                    "files": list(m.files),
                    "canonical_present": m.canonical_present,
                    "state": m.state,
                    "branches": [{"branch": bp.branch, "deleted": bp.deleted} for bp in m.branches],
                }
                for m in self.objectives
            ],
        }


def filter_by_state(
    objectives: tuple[ObjectiveRepoEntry, ...],
    allowed_states: frozenset[ObjectiveState],
) -> tuple[ObjectiveRepoEntry, ...]:
    """Return objectives whose ``state`` is in ``allowed_states``."""
    return tuple(m for m in objectives if m.state in allowed_states)


def _resolve_allowed_states(
    *,
    include_closed: bool,
    closed_only: bool,
) -> frozenset[ObjectiveState]:
    if closed_only:
        return frozenset(("closed",))
    if include_closed:
        return OBJECTIVE_STATES
    return frozenset(("open",))


def render_objective_list(result: ObjectiveListResult) -> None:
    if result.scope == "branch":
        for slug in result.branch_slugs:
            click.echo(slug)
        return

    if not result.objectives:
        return

    slug_width = max(len("SLUG"), max(len(m.slug) for m in result.objectives))
    states_present = {m.state for m in result.objectives}
    show_state_column = states_present != {"open"}
    state_width = max(len("STATE"), max(len(m.state) for m in result.objectives))
    state_header = f"  {'STATE'.ljust(state_width)}" if show_state_column else ""
    header = f"{'SLUG'.ljust(slug_width)}  CANONICAL{state_header}  BRANCHES"
    click.echo(header)
    for objective in result.objectives:
        canonical_cell = ("yes" if objective.canonical_present else "no").ljust(len("CANONICAL"))
        branches_cell = str(objective.live_branch_count)
        if objective.deleted_branch_count:
            branches_cell = f"{branches_cell} (+{objective.deleted_branch_count} deleted)"
        slug_cell = objective.slug.ljust(slug_width)
        if show_state_column:
            state_cell = objective.state.ljust(state_width)
            click.echo(f"{slug_cell}  {canonical_cell}  {state_cell}  {branches_cell}")
        else:
            click.echo(f"{slug_cell}  {canonical_cell}  {branches_cell}")


@clinkr_operation(
    name="list",
    help=(
        "List objective snapshots. Defaults to a repo-wide grouping by "
        "slug; pass --here for the current branch's snapshots, or "
        "--branch <name> to inspect a specific branch."
    ),
    aliases=("ls",),
    human_renderer=render_objective_list,
)
def run_list_objectives(
    ctx: click.Context,
    request: ObjectiveListRequest,
) -> ClinkrExit[ObjectiveListResult]:
    Ensure.true(
        not (request.here and request.branch is not None),
        error_type="conflicting_flags",
        message="--here cannot be combined with --branch.",
    )
    Ensure.true(
        not (request.include_closed and request.closed_only),
        error_type="conflicting_flags",
        message="--all cannot be combined with --closed.",
    )

    mctx = load_typed_context(ctx, ObjectiveCliContext)

    if not request.here and request.branch is None:
        objectives = discover_objectives(
            mctx.brmem_gateway,
            trunk_branch=mctx.git_gateway.get_trunk_branch(),
            is_branch_alive=mctx.git_gateway.branch_exists,
        )
        objectives = filter_by_state(
            objectives,
            _resolve_allowed_states(
                include_closed=request.include_closed,
                closed_only=request.closed_only,
            ),
        )
        return ClinkrExit.ok(
            ObjectiveListResult(scope="repo", objectives=objectives),
        )

    validation_failure = first_failure(
        (
            "invalid_branch_name",
            None if request.branch is None else check_branch_name(request.branch),
        ),
    )
    error_type, message = validation_failure or ("", "")
    Ensure.true(
        validation_failure is None,
        error_type=error_type,
        message=message,
    )

    match resolve_current_objective_branch(mctx.git_gateway, request.branch):
        case GitCommandFailure() as failure:
            raise ClinkrFailure(error_type="git_failed", message=failure.message)
        case DetachedHead():
            raise ClinkrFailure(
                error_type="detached_head",
                message="Detached HEAD: brmem requires a checked-out branch.",
            )
        case str() as branch:
            pass

    entries = mctx.brmem_gateway.list_entries(namespace=OBJECTIVE_NAMESPACE, branch=branch)

    return ClinkrExit.ok(
        ObjectiveListResult(
            scope="branch",
            branch=branch,
            entries=tuple(entries),
        ),
    )
