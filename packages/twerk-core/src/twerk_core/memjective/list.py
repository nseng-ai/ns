"""List memjective snapshots attached to a branch."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import click

from twerk_core.brmem.gateway import EntryRef, check_branch_name
from twerk_core.brmem.gateway_access import (
    get_branch_memory_gateway,
    resolve_current_brmem_branch,
)
from twerk_core.brmem.validation import first_failure
from twerk_core.clinkr.exit import ClinkrExit
from twerk_core.clinkr.operation import clinkr_operation
from twerk_core.memjective.gateway_access import MEMJECTIVE_NAMESPACE


@dataclass(frozen=True)
class MemjectiveListRequest:
    branch: str | None = None


@dataclass(frozen=True)
class MemjectiveListResult:
    branch: str
    entries: list[EntryRef]

    def to_json_dict(self) -> dict[str, Any]:
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


def render_memjective_list(result: MemjectiveListResult) -> None:
    for entry in result.entries:
        click.echo(entry.key)


@clinkr_operation(
    name="list",
    help=(
        "List memjective snapshots attached to a branch. "
        "Defaults to the current branch; pass --branch to override."
    ),
    aliases=("ls",),
    human_renderer=render_memjective_list,
)
def run_list_memjectives(
    ctx: click.Context,
    request: MemjectiveListRequest,
) -> ClinkrExit[MemjectiveListResult]:
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
        MemjectiveListResult(branch=branch, entries=entries),
    )
