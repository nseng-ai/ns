"""List memjective snapshots across the repo or on a specific branch."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

import click

from twerk_core.brmem.gateway import EntryRef, check_branch_name
from twerk_core.brmem.validation import first_failure
from twerk_core.clinkr.context import load_typed_context
from twerk_core.clinkr.dataclass_json import JsonSerializable
from twerk_core.clinkr.exit import ClinkrExit
from twerk_core.clinkr.operation import clinkr_operation
from twerk_core.git.types import DetachedHead, GitCommandFailure
from twerk_core.memjective.context import MemjectiveCliContext
from twerk_core.memjective.discovery import (
    MemjectiveRepoEntry,
    discover_memjectives,
    slug_for_key,
)
from twerk_core.memjective.gateway_access import (
    MEMJECTIVE_NAMESPACE,
    resolve_current_memjective_branch,
)


@dataclass(frozen=True)
class MemjectiveListRequest:
    branch: str | None = None
    here: bool = False


@dataclass(frozen=True)
class MemjectiveListResult(JsonSerializable):
    scope: Literal["branch", "repo"]
    branch: str | None = None
    entries: tuple[EntryRef, ...] = ()
    memjectives: tuple[MemjectiveRepoEntry, ...] = ()

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
            "memjectives": [
                {
                    "slug": m.slug,
                    "files": list(m.files),
                    "seed_present": m.seed_present,
                    "branches": [{"branch": bp.branch, "deleted": bp.deleted} for bp in m.branches],
                }
                for m in self.memjectives
            ],
        }


def render_memjective_list(result: MemjectiveListResult) -> None:
    if result.scope == "branch":
        for slug in result.branch_slugs:
            click.echo(slug)
        return

    if not result.memjectives:
        return

    slug_width = max(len("SLUG"), max(len(m.slug) for m in result.memjectives))
    header = f"{'SLUG'.ljust(slug_width)}  SEED  BRANCHES"
    click.echo(header)
    for memjective in result.memjectives:
        seed_cell = "yes" if memjective.seed_present else "no "
        branches_cell = str(memjective.live_branch_count)
        if memjective.deleted_branch_count:
            branches_cell = f"{branches_cell} (+{memjective.deleted_branch_count} deleted)"
        click.echo(f"{memjective.slug.ljust(slug_width)}  {seed_cell}   {branches_cell}")


@clinkr_operation(
    name="list",
    help=(
        "List memjective snapshots. Defaults to a repo-wide grouping by "
        "slug; pass --here for the current branch's snapshots, or "
        "--branch <name> to inspect a specific branch."
    ),
    aliases=("ls",),
    human_renderer=render_memjective_list,
)
def run_list_memjectives(
    ctx: click.Context,
    request: MemjectiveListRequest,
) -> ClinkrExit[MemjectiveListResult]:
    if request.here and request.branch is not None:
        return ClinkrExit.failure(
            error_type="conflicting_flags",
            message="--here cannot be combined with --branch.",
        )

    mctx = load_typed_context(ctx, MemjectiveCliContext)

    if not request.here and request.branch is None:
        memjectives = discover_memjectives(
            mctx.brmem_gateway,
            is_branch_alive=mctx.git_gateway.branch_exists,
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

    match resolve_current_memjective_branch(mctx.git_gateway, request.branch):
        case GitCommandFailure() as failure:
            return ClinkrExit.failure(error_type="git_failed", message=failure.message)
        case DetachedHead():
            return ClinkrExit.failure(
                error_type="detached_head",
                message="Detached HEAD: brmem requires a checked-out branch.",
            )
        case str() as branch:
            pass

    entries = mctx.brmem_gateway.list_entries(namespace=MEMJECTIVE_NAMESPACE, branch=branch)

    return ClinkrExit.ok(
        MemjectiveListResult(
            scope="branch",
            branch=branch,
            entries=tuple(entries),
        ),
    )
