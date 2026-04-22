"""Present-state summary for a single memjective slug."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated, Any

import click

from twerk_core.brmem.gateway_access import (
    get_branch_memory_gateway,
    get_git_gateway,
    resolve_current_brmem_branch,
)
from twerk_core.clinkr.exit import ClinkrExit
from twerk_core.clinkr.operation import clinkr_operation
from twerk_core.memjective.discovery import (
    BranchPresence,
    MemjectiveRepoEntry,
    discover_memjectives,
    key_for_slug,
    slug_for_key,
)
from twerk_core.memjective.gateway_access import MEMJECTIVE_NAMESPACE


@dataclass(frozen=True)
class MemjectiveShowRequest:
    slug: Annotated[
        str | None,
        click.Argument(["slug"], type=click.STRING, required=False, default=None),
    ] = None


@dataclass(frozen=True)
class MemjectiveShowResult:
    slug: str
    key: str
    seed_present: bool
    branches: tuple[BranchPresence, ...]

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "slug": self.slug,
            "key": self.key,
            "seed_present": self.seed_present,
            "branches": [{"branch": bp.branch, "stale": bp.stale} for bp in self.branches],
        }


def render_memjective_show(result: MemjectiveShowResult) -> None:
    click.echo(f"slug: {result.slug}")
    click.echo(f"key:  {result.key}")
    click.echo(f"seed: {'present (master)' if result.seed_present else 'absent'}")
    if not result.branches:
        click.echo("branches: (none)")
        return
    click.echo("branches:")
    for bp in result.branches:
        marker = " [stale]" if bp.stale else ""
        click.echo(f"  - {bp.branch}{marker}")


def _result_from_entry(entry: MemjectiveRepoEntry) -> MemjectiveShowResult:
    return MemjectiveShowResult(
        slug=entry.slug,
        key=entry.key,
        seed_present=entry.seed_present,
        branches=entry.branches,
    )


@clinkr_operation(
    name="show",
    help=(
        "Summarize where a memjective currently exists: whether a master "
        "seed is present and which branches carry a snapshot. If SLUG is "
        "omitted and exactly one memjective is attached to the current "
        "branch, it is selected automatically."
    ),
    human_renderer=render_memjective_show,
)
def run_show_memjective(
    ctx: click.Context,
    request: MemjectiveShowRequest,
) -> ClinkrExit[MemjectiveShowResult]:
    gateway = get_branch_memory_gateway(ctx)
    git_gateway = get_git_gateway(ctx)

    if request.slug is None:
        match resolve_current_brmem_branch(ctx, None):
            case ClinkrExit() as exit_:
                return exit_
            case str() as branch:
                pass

        branch_slugs = sorted(
            {
                slug_for_key(entry.key)
                for entry in gateway.list_entries(namespace=MEMJECTIVE_NAMESPACE, branch=branch)
            }
        )
        if not branch_slugs:
            return ClinkrExit.failure(
                error_type="no_memjective_on_branch",
                message=f"No memjective on branch {branch!r}.",
            )
        if len(branch_slugs) > 1:
            names = ", ".join(branch_slugs)
            return ClinkrExit.failure(
                error_type="ambiguous_memjective",
                message=(f"Multiple memjectives on branch {branch!r}: {names}. Specify a SLUG."),
            )
        requested_slug = branch_slugs[0]
    else:
        requested_slug = slug_for_key(request.slug)

    memjectives = discover_memjectives(
        gateway,
        is_branch_alive=git_gateway.branch_exists,
    )
    matches = [m for m in memjectives if m.slug == requested_slug]
    if not matches:
        empty = MemjectiveShowResult(
            slug=requested_slug,
            key=key_for_slug(requested_slug),
            seed_present=False,
            branches=(),
        )
        return ClinkrExit.negative(
            empty,
            message=f"No memjective found for slug {requested_slug!r}.",
        )

    return ClinkrExit.ok(_result_from_entry(matches[0]))
