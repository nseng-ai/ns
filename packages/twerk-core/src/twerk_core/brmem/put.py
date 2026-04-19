"""Write content to a path in branch memory."""

from __future__ import annotations

import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Annotated, Any

import click

from twerk_core.brmem.gateway import (
    InvalidBranchNameError,
    InvalidMemoryPathError,
    ref_name_for_branch,
)
from twerk_core.brmem.gateway_access import get_branch_memory_gateway, resolve_branch_name
from twerk_core.clinkr.command import ClinkrCommandError
from twerk_core.clinkr.exit import ClinkrExit
from twerk_core.clinkr.operation import clinkr_operation


@dataclass(frozen=True)
class PutBranchMemoryRequest:
    path: Annotated[
        str,
        click.Argument(
            ["path"],
            type=click.STRING,
        ),
    ]
    stdin: bool = False
    file: str | None = None
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
    help="Write content to a path in branch memory.",
    human_renderer=render_put_branch_memory,
)
def run_put_branch_memory(
    ctx: click.Context,
    request: PutBranchMemoryRequest,
) -> ClinkrExit[PutBranchMemoryResult]:
    if request.stdin and ctx.parent is not None and ctx.parent.info_name == "json":
        return ClinkrExit.fail(
            error_type="stdin_unsupported_in_json_mode",
            message=(
                "brmem put --stdin is only supported in the human CLI; JSON mode already "
                "uses stdin for the request body."
            ),
            exit_code=2,
        )

    if request.stdin and request.file is not None:
        return ClinkrExit.fail(
            error_type="stdin_and_file_conflict",
            message="--stdin and --file are mutually exclusive.",
            exit_code=2,
        )

    if request.stdin:
        content = sys.stdin.read()
        source_file = "<stdin>"
    else:
        source_path = request.file if request.file is not None else request.path
        try:
            content = Path(source_path).read_text(encoding="utf-8")
        except FileNotFoundError:
            return ClinkrExit.fail(
                error_type="source_file_missing",
                message=f"Source file not found: {source_path}",
                exit_code=2,
            )
        except OSError as exc:
            return ClinkrExit.fail(
                error_type="source_file_unreadable",
                message=f"Failed to read source file {source_path}: {exc}",
                exit_code=2,
            )
        source_file = source_path

    branch = resolve_branch_name(ctx, request.branch)
    if isinstance(branch, ClinkrCommandError):
        return ClinkrExit.fail(
            error_type=branch.error_type,
            message=branch.message,
            exit_code=2,
        )

    gateway = get_branch_memory_gateway(ctx)

    try:
        commit = gateway.put(branch, request.path, content)
    except InvalidBranchNameError as exc:
        return ClinkrExit.fail(
            error_type="invalid_branch_name",
            message=str(exc),
            exit_code=2,
        )
    except InvalidMemoryPathError as exc:
        return ClinkrExit.fail(
            error_type="invalid_memory_path",
            message=str(exc),
            exit_code=2,
        )
    except subprocess.CalledProcessError as exc:
        details = exc.stderr.strip() or str(exc)
        return ClinkrExit.fail(
            error_type="git_failure",
            message=f"Failed to write branch memory: {details}",
            exit_code=2,
        )

    return ClinkrExit.ok(
        PutBranchMemoryResult(
            branch=branch,
            path=request.path,
            ref_name=ref_name_for_branch(branch),
            commit=commit,
            source_file=source_file,
        )
    )
