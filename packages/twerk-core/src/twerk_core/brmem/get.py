"""Read a file from branch memory."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import click

from twerk_core.brmem.gateway import (
    InvalidBranchNameError,
    InvalidMemoryPathError,
    ref_name_for_branch,
)
from twerk_core.brmem.gateway_access import get_branch_memory_gateway, resolve_branch_name
from twerk_core.clinkr.command import ClinkrCommandError
from twerk_core.clinkr.operation import clinkr_operation


@dataclass(frozen=True)
class GetBranchMemoryRequest:
    path: str
    branch: str | None = None
    at: str | None = None


@dataclass(frozen=True)
class GetBranchMemoryResult:
    branch: str
    path: str
    content: str
    ref_name: str
    target: str
    at: str | None = None

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "branch": self.branch,
            "path": self.path,
            "content": self.content,
            "ref_name": self.ref_name,
            "target": self.target,
            "at": self.at,
        }


def render_get_branch_memory(result: GetBranchMemoryResult) -> None:
    click.echo(result.content, nl=not result.content.endswith("\n"))


@clinkr_operation(
    name="get",
    help="Read a file from branch memory.",
    human_renderer=render_get_branch_memory,
)
def run_get_branch_memory(
    ctx: click.Context,
    request: GetBranchMemoryRequest,
) -> GetBranchMemoryResult | ClinkrCommandError:
    branch = resolve_branch_name(ctx, request.branch)
    if isinstance(branch, ClinkrCommandError):
        return branch

    gateway = get_branch_memory_gateway(ctx)
    ref_name = ref_name_for_branch(branch)
    target = request.at if request.at is not None else ref_name

    try:
        content = gateway.get(branch, request.path, at=request.at)
    except InvalidBranchNameError as exc:
        return ClinkrCommandError(error_type="invalid_branch_name", message=str(exc))
    except InvalidMemoryPathError as exc:
        return ClinkrCommandError(error_type="invalid_memory_path", message=str(exc))

    if content is None:
        return ClinkrCommandError(
            error_type="branch_memory_missing",
            message=(
                f"No branch memory content found for branch {branch} path {request.path} at "
                f"{target}. Inspect with: git ls-tree -r {target}"
            ),
        )

    return GetBranchMemoryResult(
        branch=branch,
        path=request.path,
        content=content,
        ref_name=ref_name,
        target=target,
        at=request.at,
    )
