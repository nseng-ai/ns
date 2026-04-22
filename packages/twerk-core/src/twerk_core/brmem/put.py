"""Write content to a branch-memory entry."""

from __future__ import annotations

import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Annotated, Any

import click

from twerk_core.brmem.gateway import BRMEM_CONTENT_PATH
from twerk_core.brmem.gateway_access import get_branch_memory_gateway, resolve_branch_name
from twerk_core.brmem.validation import validate_entry_ref
from twerk_core.clinkr.command import ClinkrCommandError
from twerk_core.clinkr.exit import ClinkrExit
from twerk_core.clinkr.operation import clinkr_operation


@dataclass(frozen=True)
class PutRequest:
    key: Annotated[
        str,
        click.Argument(
            ["key"],
            type=click.STRING,
        ),
    ]
    namespace: Annotated[
        str,
        click.Option(
            ["--namespace"],
            required=True,
            type=click.STRING,
            help="Entry namespace (e.g. 'workbr', 'memjectives').",
        ),
    ]
    stdin: bool = False
    file: str | None = None
    branch: str | None = None


@dataclass(frozen=True)
class PutResult:
    namespace: str
    key: str
    branch: str
    ref_name: str
    commit: str
    source_file: str

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "namespace": self.namespace,
            "key": self.key,
            "branch": self.branch,
            "ref_name": self.ref_name,
            "commit": self.commit,
            "source_file": self.source_file,
        }


def render_put(result: PutResult) -> None:
    source = "stdin" if result.source_file == "<stdin>" else result.source_file
    click.echo(
        "\n".join(
            [
                (
                    f"Stored {result.key} from {source} for "
                    f"{result.namespace} on branch {result.branch}."
                ),
                f"Ref: {result.ref_name}",
                f"Commit: {result.commit}",
                f"Inspect: git show {result.ref_name}:{BRMEM_CONTENT_PATH}",
            ]
        )
    )


@clinkr_operation(
    name="put",
    help="Write content to a branch-memory entry.",
    human_renderer=render_put,
)
def run_put(
    ctx: click.Context,
    request: PutRequest,
) -> ClinkrExit[PutResult]:
    if request.stdin and ctx.parent is not None and ctx.parent.info_name == "json":
        return ClinkrExit.failure(
            error_type="stdin_unsupported_in_json_mode",
            message=(
                "brmem put --stdin is only supported in the human CLI; JSON mode already "
                "uses stdin for the request body."
            ),
        )

    if request.stdin and request.file is not None:
        return ClinkrExit.failure(
            error_type="stdin_and_file_conflict",
            message="--stdin and --file are mutually exclusive.",
        )

    if request.stdin:
        content = sys.stdin.read()
        source_file = "<stdin>"
    else:
        source_path = request.file if request.file is not None else _default_source(request.key)
        if source_path is None:
            return ClinkrExit.failure(
                error_type="source_file_missing",
                message=(
                    f"Cannot infer a default --file for key {request.key!r}; "
                    "provide --file or --stdin."
                ),
            )
        try:
            content = Path(source_path).read_text(encoding="utf-8")
        except FileNotFoundError:
            return ClinkrExit.failure(
                error_type="source_file_missing",
                message=f"Source file not found: {source_path}",
            )
        except OSError as exc:
            return ClinkrExit.failure(
                error_type="source_file_unreadable",
                message=f"Failed to read source file {source_path}: {exc}",
            )
        source_file = source_path

    branch = resolve_branch_name(ctx, request.branch)
    if isinstance(branch, ClinkrCommandError):
        return ClinkrExit.failure(error_type=branch.error_type, message=branch.message)

    entry_ref = validate_entry_ref(request.namespace, request.key, branch)
    if isinstance(entry_ref, ClinkrCommandError):
        return ClinkrExit.failure(error_type=entry_ref.error_type, message=entry_ref.message)

    gateway = get_branch_memory_gateway(ctx)

    try:
        commit = gateway.put(
            entry_ref.namespace,
            entry_ref.key,
            entry_ref.branch,
            content,
        )
    except subprocess.CalledProcessError as exc:
        details = exc.stderr.strip() or str(exc)
        return ClinkrExit.failure(
            error_type="git_failure",
            message=f"Failed to write branch memory: {details}",
        )

    return ClinkrExit.ok(
        PutResult(
            namespace=entry_ref.namespace,
            key=entry_ref.key,
            branch=entry_ref.branch,
            ref_name=entry_ref.ref_name,
            commit=commit,
            source_file=source_file,
        )
    )


def _default_source(key: str) -> str | None:
    basename = PurePosixPath(key).name
    if not basename:
        return None
    return basename
