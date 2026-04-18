"""Read a file from branch memory."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import click

from twerk_core.brmem.gateway import InvalidBranchNameError, InvalidMemoryPathError
from twerk_core.brmem.gateway_access import get_branch_memory_gateway
from twerk_core.clinkr.command import ClinkrCommandError
from twerk_core.clinkr.operation import clinkr_operation


@dataclass(frozen=True)
class GetBranchMemoryRequest:
    branch: str
    path: str
    at: str | None = None


@dataclass(frozen=True)
class GetBranchMemoryResult:
    branch: str
    path: str
    content: str
    at: str | None = None

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "branch": self.branch,
            "path": self.path,
            "content": self.content,
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
    gateway = get_branch_memory_gateway(ctx)

    try:
        content = gateway.get(request.branch, request.path, at=request.at)
    except InvalidBranchNameError as exc:
        return ClinkrCommandError(error_type="invalid_branch_name", message=str(exc))
    except InvalidMemoryPathError as exc:
        return ClinkrCommandError(error_type="invalid_memory_path", message=str(exc))

    if content is None:
        location = f" at {request.at}" if request.at is not None else ""
        return ClinkrCommandError(
            error_type="branch_memory_missing",
            message=(
                f"No branch memory content found for {request.branch}:{request.path}{location}."
            ),
        )

    return GetBranchMemoryResult(
        branch=request.branch,
        path=request.path,
        content=content,
        at=request.at,
    )
