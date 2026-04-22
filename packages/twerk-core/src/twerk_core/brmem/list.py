"""List branch-memory entries."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import click

from twerk_core.brmem.gateway import EntryRef
from twerk_core.brmem.gateway_access import get_branch_memory_gateway, resolve_branch_name
from twerk_core.brmem.validation import validate_entry_filters
from twerk_core.clinkr.command import ClinkrCommandError
from twerk_core.clinkr.exit import ClinkrExit
from twerk_core.clinkr.operation import clinkr_operation


@dataclass(frozen=True)
class ListEntriesRequest:
    namespace: str | None = None
    key: str | None = None
    branch: str | None = None


@dataclass(frozen=True)
class ListEntriesResult:
    namespace: str | None
    key: str | None
    branch: str | None
    entries: list[EntryRef]

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "namespace": self.namespace,
            "key": self.key,
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


def render_list_entries(result: ListEntriesResult) -> None:
    for entry in result.entries:
        click.echo(f"{entry.namespace}/{entry.key}")


@clinkr_operation(
    name="list",
    help=(
        "List branch-memory entries. Defaults to the current branch; "
        "pass --branch to override. --namespace and --key further filter."
    ),
    human_renderer=render_list_entries,
)
def run_list_entries(
    ctx: click.Context,
    request: ListEntriesRequest,
) -> ClinkrExit[ListEntriesResult]:
    validation_error = validate_entry_filters(
        namespace=request.namespace,
        key=request.key,
        branch=request.branch,
    )
    if validation_error is not None:
        return ClinkrExit.failure(
            error_type=validation_error.error_type,
            message=validation_error.message,
        )

    branch = resolve_branch_name(ctx, request.branch)
    if isinstance(branch, ClinkrCommandError):
        return ClinkrExit.failure(error_type=branch.error_type, message=branch.message)

    gateway = get_branch_memory_gateway(ctx)
    entries = gateway.list_entries(
        namespace=request.namespace,
        key=request.key,
        branch=branch,
    )

    return ClinkrExit.ok(
        ListEntriesResult(
            namespace=request.namespace,
            key=request.key,
            branch=branch,
            entries=entries,
        )
    )
