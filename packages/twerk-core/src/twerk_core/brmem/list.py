"""List branch-memory entries."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import click

from twerk_core.brmem.gateway import EntryRef, check_branch_name, check_namespace
from twerk_core.brmem.gateway_access import get_branch_memory_gateway, get_git_gateway
from twerk_core.brmem.key_validation import check_key
from twerk_core.brmem.validation import first_failure
from twerk_core.clinkr.exit import ClinkrExit
from twerk_core.clinkr.operation import clinkr_operation
from twerk_core.git.types import DetachedHead, GitCommandFailure


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
    validation_failure = first_failure(
        (
            "invalid_namespace",
            None if request.namespace is None else check_namespace(request.namespace),
        ),
        ("invalid_key", None if request.key is None else check_key(request.key)),
        (
            "invalid_branch_name",
            None if request.branch is None else check_branch_name(request.branch),
        ),
    )
    if validation_failure is not None:
        error_type, message = validation_failure
        return ClinkrExit.failure(error_type=error_type, message=message)

    if request.branch is not None:
        branch = request.branch
    else:
        match get_git_gateway(ctx).get_current_branch(Path.cwd()):
            case GitCommandFailure() as failure:
                return ClinkrExit.failure(error_type="git_failed", message=failure.message)
            case DetachedHead():
                return ClinkrExit.failure(
                    error_type="detached_head",
                    message="Detached HEAD: brmem requires a checked-out branch.",
                )
            case str() as current_branch:
                branch = current_branch

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
