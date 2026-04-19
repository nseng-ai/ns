"""Copy content at a path from one branch's memory to another's."""

from __future__ import annotations

import subprocess
from dataclasses import dataclass
from typing import Annotated, Any

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
class CopyBranchMemoryRequest:
    path: Annotated[
        str,
        click.Argument(
            ["path"],
            type=click.STRING,
        ),
    ]
    from_branch: Annotated[
        str,
        click.Option(
            ["--from-branch"],
            required=True,
            type=click.STRING,
        ),
    ]
    to_branch: str | None = None
    at: str | None = None


@dataclass(frozen=True)
class CopyBranchMemoryResult:
    path: str
    from_branch: str
    to_branch: str
    source_target: str
    ref_name: str
    commit: str
    at: str | None = None

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "path": self.path,
            "from_branch": self.from_branch,
            "to_branch": self.to_branch,
            "source_target": self.source_target,
            "ref_name": self.ref_name,
            "commit": self.commit,
            "at": self.at,
        }


def render_copy_branch_memory(result: CopyBranchMemoryResult) -> None:
    click.echo(
        "\n".join(
            [
                (
                    f"Copied {result.path} from branch {result.from_branch} "
                    f"to branch {result.to_branch}."
                ),
                f"Source: {result.source_target}",
                f"Ref: {result.ref_name}",
                f"Commit: {result.commit}",
                f"Inspect: git show {result.ref_name}:{result.path}",
            ]
        )
    )


@clinkr_operation(
    name="copy",
    help="Copy content at a path from one branch's memory to another's.",
    human_renderer=render_copy_branch_memory,
)
def run_copy_branch_memory(
    ctx: click.Context,
    request: CopyBranchMemoryRequest,
) -> CopyBranchMemoryResult | ClinkrCommandError:
    to_branch = resolve_branch_name(ctx, request.to_branch)
    if isinstance(to_branch, ClinkrCommandError):
        return to_branch

    gateway = get_branch_memory_gateway(ctx)

    try:
        content = gateway.get(request.from_branch, request.path, at=request.at)
    except InvalidBranchNameError as exc:
        return ClinkrCommandError(error_type="invalid_branch_name", message=str(exc))
    except InvalidMemoryPathError as exc:
        return ClinkrCommandError(error_type="invalid_memory_path", message=str(exc))

    from_ref = ref_name_for_branch(request.from_branch)
    source_target = request.at if request.at is not None else from_ref

    if content is None:
        return ClinkrCommandError(
            error_type="branch_memory_missing",
            message=(
                f"No branch memory content found for branch {request.from_branch} path "
                f"{request.path} at {source_target}. Inspect with: "
                f"git ls-tree -r {source_target}"
            ),
        )

    try:
        commit = gateway.put(to_branch, request.path, content)
    except InvalidBranchNameError as exc:
        return ClinkrCommandError(error_type="invalid_branch_name", message=str(exc))
    except InvalidMemoryPathError as exc:
        return ClinkrCommandError(error_type="invalid_memory_path", message=str(exc))
    except subprocess.CalledProcessError as exc:
        details = exc.stderr.strip() if exc.stderr else str(exc)
        return ClinkrCommandError(
            error_type="git_failure",
            message=f"Failed to write branch memory: {details}",
        )

    return CopyBranchMemoryResult(
        path=request.path,
        from_branch=request.from_branch,
        to_branch=to_branch,
        source_target=source_target,
        ref_name=ref_name_for_branch(to_branch),
        commit=commit,
        at=request.at,
    )
