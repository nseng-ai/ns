"""List memjective snapshots attached to a branch or across the whole repo."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

import click

from twerk_core.brmem.gateway import EntryRef, check_branch_name
from twerk_core.brmem.gateway_access import (
    get_branch_memory_gateway,
    get_git_gateway,
    resolve_current_brmem_branch,
)
from twerk_core.brmem.validation import first_failure
from twerk_core.clinkr.exit import ClinkrExit
from twerk_core.clinkr.operation import clinkr_operation
from twerk_core.memjective.discovery import (
    MemjectiveRepoEntry,
    discover_memjectives,
)
from twerk_core.memjective.gateway_access import MEMJECTIVE_NAMESPACE


@dataclass(frozen=True)
class MemjectiveListRequest:
    branch: str | None = None
    repo: bool = False


@dataclass(frozen=True)
class MemjectiveListResult:
    scope: Literal["branch", "repo"]
    branch: str | None = None
    entries: tuple[EntryRef, ...] = ()
    memjectives: tuple[MemjectiveRepoEntry, ...] = ()

    def to_json_dict(self) -> dict[str, Any]:
        if self.scope == "branch":
            return {
                "branch": self.branch,
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
            "memjectives": [
                {
                    "slug": m.slug,
                    "key": m.key,
                    "seed_present": m.seed_present,
                    "branches": [{"branch": bp.branch, "stale": bp.stale} for bp in m.branches],
                }
                for m in self.memjectives
            ],
        }


def render_memjective_list(result: MemjectiveListResult) -> None:
    if result.scope == "branch":
        for entry in result.entries:
            click.echo(entry.key)
        return

    if not result.memjectives:
        return

    slug_width = max(len("SLUG"), max(len(m.slug) for m in result.memjectives))
    header = f"{'SLUG'.ljust(slug_width)}  SEED  BRANCHES"
    click.echo(header)
    for memjective in result.memjectives:
        seed_cell = "yes" if memjective.seed_present else "no "
        branches_cell = str(memjective.live_branch_count)
        if memjective.stale_branch_count:
            branches_cell = f"{branches_cell} (+{memjective.stale_branch_count} stale)"
        click.echo(f"{memjective.slug.ljust(slug_width)}  {seed_cell}   {branches_cell}")


@clinkr_operation(
    name="list",
    help=(
        "List memjective snapshots. Defaults to the current branch; "
        "pass --branch to inspect another branch, or --repo to group every "
        "memjective in the repo by slug."
    ),
    aliases=("ls",),
    human_renderer=render_memjective_list,
)
def run_list_memjectives(
    ctx: click.Context,
    request: MemjectiveListRequest,
) -> ClinkrExit[MemjectiveListResult]:
    if request.repo and request.branch is not None:
        return ClinkrExit.failure(
            error_type="conflicting_flags",
            message="--repo cannot be combined with --branch.",
        )

    if request.repo:
        gateway = get_branch_memory_gateway(ctx)
        git_gateway = get_git_gateway(ctx)
        memjectives = discover_memjectives(
            gateway,
            is_branch_alive=git_gateway.branch_exists,
        )
        return ClinkrExit.ok(
            MemjectiveListResult(scope="repo", memjectives=memjectives),
        )

    validation_failure = first_failure(
        (
            "invalid_branch_name",
            None if request.branch is None else check_branch_name(request.branch),
        ),
    )
    if validation_failure is not None:
        error_type, message = validation_failure
        return ClinkrExit.failure(error_type=error_type, message=message)

    match resolve_current_brmem_branch(ctx, request.branch):
        case ClinkrExit() as exit_:
            return exit_
        case str() as branch:
            pass

    gateway = get_branch_memory_gateway(ctx)
    entries = gateway.list_entries(namespace=MEMJECTIVE_NAMESPACE, branch=branch)

    return ClinkrExit.ok(
        MemjectiveListResult(
            scope="branch",
            branch=branch,
            entries=tuple(entries),
        ),
    )
