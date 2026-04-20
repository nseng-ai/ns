"""List branch-memory entries."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import click

from twerk_core.brmem.gateway import (
    EntryRef,
    InvalidBranchNameError,
    InvalidKeyError,
    InvalidNamespaceError,
)
from twerk_core.brmem.gateway_access import get_branch_memory_gateway
from twerk_core.clinkr.command import ClinkrCommandError
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
        click.echo(entry.ref_name)


@clinkr_operation(
    name="list",
    help=(
        "List branch-memory entries. --namespace, --key, and --branch are "
        "optional filters; no defaults are applied."
    ),
    human_renderer=render_list_entries,
)
def run_list_entries(
    ctx: click.Context,
    request: ListEntriesRequest,
) -> ListEntriesResult | ClinkrCommandError:
    gateway = get_branch_memory_gateway(ctx)

    try:
        entries = gateway.list_entries(
            namespace=request.namespace,
            key=request.key,
            branch=request.branch,
        )
    except InvalidNamespaceError as exc:
        return ClinkrCommandError(error_type="invalid_namespace", message=str(exc))
    except InvalidKeyError as exc:
        return ClinkrCommandError(error_type="invalid_key", message=str(exc))
    except InvalidBranchNameError as exc:
        return ClinkrCommandError(error_type="invalid_branch_name", message=str(exc))

    return ListEntriesResult(
        namespace=request.namespace,
        key=request.key,
        branch=request.branch,
        entries=entries,
    )
