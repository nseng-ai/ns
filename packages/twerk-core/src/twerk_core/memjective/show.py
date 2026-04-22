"""Present-state summary for a single memjective slug."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated, Any

import click

from twerk_core.brmem.gateway_access import (
    get_branch_memory_gateway,
    get_git_gateway,
)
from twerk_core.clinkr.exit import ClinkrExit
from twerk_core.clinkr.operation import clinkr_operation
from twerk_core.memjective.discovery import (
    BranchPresence,
    discover_memjectives,
    slug_for_key,
)


@dataclass(frozen=True)
class MemjectiveShowRequest:
    slug: Annotated[str, click.Argument(["slug"], type=click.STRING)]


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


@clinkr_operation(
    name="show",
    help=(
        "Summarize where a memjective currently exists: whether a master "
        "seed is present and which branches carry a snapshot."
    ),
    human_renderer=render_memjective_show,
)
def run_show_memjective(
    ctx: click.Context,
    request: MemjectiveShowRequest,
) -> ClinkrExit[MemjectiveShowResult]:
    requested_slug = slug_for_key(request.slug)

    gateway = get_branch_memory_gateway(ctx)
    git_gateway = get_git_gateway(ctx)
    memjectives = discover_memjectives(
        gateway,
        is_branch_alive=git_gateway.branch_exists,
    )

    matches = [m for m in memjectives if m.slug == requested_slug]
    if not matches:
        empty = MemjectiveShowResult(
            slug=requested_slug,
            key=f"{requested_slug}.md",
            seed_present=False,
            branches=(),
        )
        return ClinkrExit.negative(
            empty,
            message=f"No memjective found for slug {requested_slug!r}.",
        )

    memjective = matches[0]
    return ClinkrExit.ok(
        MemjectiveShowResult(
            slug=memjective.slug,
            key=memjective.key,
            seed_present=memjective.seed_present,
            branches=memjective.branches,
        )
    )
