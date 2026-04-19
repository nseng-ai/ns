"""List paths stored in branch memory."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import click

from twerk_core.brmem.gateway import InvalidBranchNameError, ref_name_for_branch
from twerk_core.brmem.gateway_access import get_branch_memory_gateway, resolve_branch_name
from twerk_core.clinkr.command import ClinkrCommandError
from twerk_core.clinkr.operation import clinkr_operation


@dataclass(frozen=True)
class ListBranchMemoryRequest:
    branch: str | None = None
    at: str | None = None


@dataclass(frozen=True)
class ListBranchMemoryResult:
    branch: str
    ref_name: str
    target: str
    paths: list[str]
    at: str | None = None

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "branch": self.branch,
            "ref_name": self.ref_name,
            "target": self.target,
            "paths": list(self.paths),
            "at": self.at,
        }


def render_list_branch_memory(result: ListBranchMemoryResult) -> None:
    for path in result.paths:
        click.echo(path)


@clinkr_operation(
    name="list",
    help="List paths stored in branch memory.",
    human_renderer=render_list_branch_memory,
)
def run_list_branch_memory(
    ctx: click.Context,
    request: ListBranchMemoryRequest,
) -> ListBranchMemoryResult | ClinkrCommandError:
    branch = resolve_branch_name(ctx, request.branch)
    if isinstance(branch, ClinkrCommandError):
        return branch

    gateway = get_branch_memory_gateway(ctx)
    ref_name = ref_name_for_branch(branch)
    target = request.at if request.at is not None else ref_name

    try:
        paths = gateway.list(branch, at=request.at)
    except InvalidBranchNameError as exc:
        return ClinkrCommandError(error_type="invalid_branch_name", message=str(exc))

    return ListBranchMemoryResult(
        branch=branch,
        ref_name=ref_name,
        target=target,
        paths=paths,
        at=request.at,
    )
