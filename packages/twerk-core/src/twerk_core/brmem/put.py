"""Write content to an artifact path inside a branch-memory entry."""

from __future__ import annotations

import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Annotated, Any

import click

from twerk_core.brmem.gateway_access import get_branch_memory_gateway, resolve_branch_name
from twerk_core.brmem.validation import validate_entry_artifact_request
from twerk_core.clinkr.command import ClinkrCommandError
from twerk_core.clinkr.operation import clinkr_operation


@dataclass(frozen=True)
class PutArtifactRequest:
    path: Annotated[
        str,
        click.Argument(
            ["path"],
            type=click.STRING,
        ),
    ]
    namespace: Annotated[
        str,
        click.Option(
            ["--namespace"],
            required=True,
            type=click.STRING,
            help="Entry namespace (e.g. 'workbr', 'objectives').",
        ),
    ]
    key: Annotated[
        str,
        click.Option(
            ["--key"],
            required=True,
            type=click.STRING,
            help="Entry key inside the namespace.",
        ),
    ]
    stdin: bool = False
    file: str | None = None
    branch: str | None = None


@dataclass(frozen=True)
class PutArtifactResult:
    namespace: str
    key: str
    branch: str
    path: str
    ref_name: str
    commit: str
    source_file: str

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "namespace": self.namespace,
            "key": self.key,
            "branch": self.branch,
            "path": self.path,
            "ref_name": self.ref_name,
            "commit": self.commit,
            "source_file": self.source_file,
        }


def render_put_artifact(result: PutArtifactResult) -> None:
    source = "stdin" if result.source_file == "<stdin>" else result.source_file
    click.echo(
        "\n".join(
            [
                (
                    f"Stored {result.path} from {source} for "
                    f"{result.namespace}/{result.key} on branch {result.branch}."
                ),
                f"Ref: {result.ref_name}",
                f"Commit: {result.commit}",
                f"Inspect: git show {result.ref_name}:{result.path}",
            ]
        )
    )


@clinkr_operation(
    name="put",
    help="Write content to an artifact path inside a branch-memory entry.",
    human_renderer=render_put_artifact,
)
def run_put_artifact(
    ctx: click.Context,
    request: PutArtifactRequest,
) -> PutArtifactResult | ClinkrCommandError:
    if request.stdin and ctx.parent is not None and ctx.parent.info_name == "json":
        return ClinkrCommandError(
            error_type="stdin_unsupported_in_json_mode",
            message=(
                "brmem put --stdin is only supported in the human CLI; JSON mode already "
                "uses stdin for the request body."
            ),
        )

    if request.stdin and request.file is not None:
        return ClinkrCommandError(
            error_type="stdin_and_file_conflict",
            message="--stdin and --file are mutually exclusive.",
        )

    if request.stdin:
        content = sys.stdin.read()
        source_file = "<stdin>"
    else:
        source_path = request.file if request.file is not None else request.path
        try:
            content = Path(source_path).read_text(encoding="utf-8")
        except FileNotFoundError:
            return ClinkrCommandError(
                error_type="source_file_missing",
                message=f"Source file not found: {source_path}",
            )
        except OSError as exc:
            return ClinkrCommandError(
                error_type="source_file_unreadable",
                message=f"Failed to read source file {source_path}: {exc}",
            )
        source_file = source_path

    branch = resolve_branch_name(ctx, request.branch)
    if isinstance(branch, ClinkrCommandError):
        return branch

    entry_ref = validate_entry_artifact_request(
        request.namespace,
        request.key,
        branch,
        request.path,
    )
    if isinstance(entry_ref, ClinkrCommandError):
        return entry_ref

    gateway = get_branch_memory_gateway(ctx)

    try:
        commit = gateway.put_artifact(
            entry_ref.namespace,
            entry_ref.key,
            entry_ref.branch,
            request.path,
            content,
        )
    except subprocess.CalledProcessError as exc:
        details = exc.stderr.strip() or str(exc)
        return ClinkrCommandError(
            error_type="git_failure",
            message=f"Failed to write branch memory: {details}",
        )

    return PutArtifactResult(
        namespace=entry_ref.namespace,
        key=entry_ref.key,
        branch=entry_ref.branch,
        path=request.path,
        ref_name=entry_ref.ref_name,
        commit=commit,
        source_file=source_file,
    )
