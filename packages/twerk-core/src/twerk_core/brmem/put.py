"""Write a file into branch memory."""

from __future__ import annotations

import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path, PurePath
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
class PutBranchMemoryRequest:
    file: Annotated[
        str,
        click.Argument(
            ["file"],
            type=click.STRING,
        ),
    ]
    stdin: bool = False
    path: Annotated[str | None, click.Option(["--path"], default=None)] = None
    branch: str | None = None


@dataclass(frozen=True)
class PutBranchMemoryResult:
    branch: str
    path: str
    ref_name: str
    commit: str
    source_file: str

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "branch": self.branch,
            "path": self.path,
            "ref_name": self.ref_name,
            "commit": self.commit,
            "source_file": self.source_file,
        }


def render_put_branch_memory(result: PutBranchMemoryResult) -> None:
    source = "stdin" if result.source_file == "<stdin>" else result.source_file
    click.echo(
        "\n".join(
            [
                f"Stored {result.path} from {source} for branch {result.branch}.",
                f"Ref: {result.ref_name}",
                f"Commit: {result.commit}",
                f"Inspect: git show {result.ref_name}:{result.path}",
            ]
        )
    )


@clinkr_operation(
    name="put",
    help="Write a file into branch memory.",
    human_renderer=render_put_branch_memory,
)
def run_put_branch_memory(
    ctx: click.Context,
    request: PutBranchMemoryRequest,
) -> PutBranchMemoryResult | ClinkrCommandError:
    if request.stdin and ctx.parent is not None and ctx.parent.info_name == "json":
        return ClinkrCommandError(
            error_type="stdin_unsupported_in_json_mode",
            message=(
                "brmem put --stdin is only supported in the human CLI; JSON mode already "
                "uses stdin for the request body."
            ),
        )

    if request.stdin:
        content = sys.stdin.read()
        source_file = "<stdin>"
        memory_path = (
            request.path if request.path is not None else PurePath(request.file).as_posix()
        )
    else:
        try:
            content = Path(request.file).read_text(encoding="utf-8")
        except FileNotFoundError:
            return ClinkrCommandError(
                error_type="source_file_missing",
                message=f"Source file not found: {request.file}",
            )
        except OSError as exc:
            return ClinkrCommandError(
                error_type="source_file_unreadable",
                message=f"Failed to read source file {request.file}: {exc}",
            )
        source_file = request.file
        memory_path = (
            request.path if request.path is not None else PurePath(request.file).as_posix()
        )

    branch = resolve_branch_name(ctx, request.branch)
    if isinstance(branch, ClinkrCommandError):
        return branch

    gateway = get_branch_memory_gateway(ctx)

    try:
        commit = gateway.put(branch, memory_path, content)
    except InvalidBranchNameError as exc:
        return ClinkrCommandError(error_type="invalid_branch_name", message=str(exc))
    except InvalidMemoryPathError as exc:
        return ClinkrCommandError(error_type="invalid_memory_path", message=str(exc))
    except subprocess.CalledProcessError as exc:
        details = exc.stderr.strip() or str(exc)
        return ClinkrCommandError(
            error_type="git_failure",
            message=f"Failed to write branch memory: {details}",
        )

    return PutBranchMemoryResult(
        branch=branch,
        path=memory_path,
        ref_name=ref_name_for_branch(branch),
        commit=commit,
        source_file=source_file,
    )
