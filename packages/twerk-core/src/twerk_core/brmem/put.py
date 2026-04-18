"""Write a file into branch memory."""

from __future__ import annotations

import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Annotated, Any

import click

from twerk_core.brmem.gateway import InvalidBranchNameError, InvalidMemoryPathError
from twerk_core.brmem.gateway_access import get_branch_memory_gateway
from twerk_core.clinkr.command import ClinkrCommandError
from twerk_core.clinkr.operation import clinkr_operation


@dataclass(frozen=True)
class PutBranchMemoryRequest:
    branch: str
    path: str
    source_file: Annotated[
        str,
        click.Option(
            ["--file"],
            required=True,
            type=click.Path(dir_okay=False, readable=True),
        ),
    ]


@dataclass(frozen=True)
class PutBranchMemoryResult:
    branch: str
    path: str
    commit: str

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "branch": self.branch,
            "path": self.path,
            "commit": self.commit,
        }


def render_put_branch_memory(result: PutBranchMemoryResult) -> None:
    click.echo(f"Wrote {result.path} to brmem for {result.branch} at {result.commit}.")


@clinkr_operation(
    name="put",
    help="Write a file into branch memory.",
    human_renderer=render_put_branch_memory,
)
def run_put_branch_memory(
    ctx: click.Context,
    request: PutBranchMemoryRequest,
) -> PutBranchMemoryResult | ClinkrCommandError:
    try:
        content = Path(request.source_file).read_text(encoding="utf-8")
    except FileNotFoundError:
        return ClinkrCommandError(
            error_type="source_file_missing",
            message=f"Source file not found: {request.source_file}",
        )
    except OSError as exc:
        return ClinkrCommandError(
            error_type="source_file_unreadable",
            message=f"Failed to read source file {request.source_file}: {exc}",
        )

    gateway = get_branch_memory_gateway(ctx)

    try:
        commit = gateway.put(request.branch, request.path, content)
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
        branch=request.branch,
        path=request.path,
        commit=commit,
    )
