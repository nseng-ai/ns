"""Write content to a branch-memory entry."""

from __future__ import annotations

import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Annotated

import click

from twerk_core.brmem.content_limits import (
    check_entry_not_binary,
    check_entry_size,
)
from twerk_core.brmem.gateway import (
    EntryRef,
    check_branch_name,
    check_namespace,
    ref_name_for_entry,
)
from twerk_core.brmem.gateway_access import (
    get_branch_memory_gateway,
    resolve_current_brmem_branch,
)
from twerk_core.brmem.key_validation import check_key
from twerk_core.brmem.validation import first_failure
from twerk_core.clinkr.context import is_machine_mode
from twerk_core.clinkr.dataclass_json import JsonSerializable
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
        str | None,
        click.Option(
            ["--namespace"],
            type=click.STRING,
            default=None,
            help=("Entry namespace (e.g. 'objectives'). Omit for ad-hoc base entries."),
        ),
    ] = None
    stdin: bool = False
    file: str | None = None
    branch: str | None = None
    force: Annotated[
        bool,
        click.Option(
            ["-f", "--force"],
            is_flag=True,
            default=False,
            help="Bypass the 1 MiB size cap and binary-content check.",
        ),
    ] = False


@dataclass(frozen=True)
class PutResult(JsonSerializable):
    namespace: str | None
    key: str
    branch: str
    ref_name: str
    commit: str
    source_file: str


def render_put(result: PutResult) -> None:
    source = "stdin" if result.source_file == "<stdin>" else result.source_file
    namespace_label = result.namespace if result.namespace is not None else "base"
    click.echo(
        "\n".join(
            [
                (
                    f"Stored {result.key} from {source} for "
                    f"{namespace_label} on branch {result.branch}."
                ),
                f"Ref: {result.ref_name}",
                f"Commit: {result.commit}",
                f"Inspect: git show {result.ref_name}",
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
    if request.stdin and is_machine_mode(ctx):
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
        raw = sys.stdin.buffer.read()
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
            raw = Path(source_path).read_bytes()
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

    if not request.force:
        if (size_msg := check_entry_size(raw)) is not None:
            return ClinkrExit.failure(
                error_type="entry_too_large",
                message=f"{source_file} {size_msg}. Pass -f / --force to override.",
            )
        if (binary_msg := check_entry_not_binary(raw)) is not None:
            return ClinkrExit.failure(
                error_type="entry_appears_binary",
                message=f"{source_file} {binary_msg}. Pass -f / --force to override.",
            )

    try:
        content = raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        return ClinkrExit.failure(
            error_type="entry_not_utf8",
            message=f"{source_file} is not valid UTF-8: {exc}",
        )

    match resolve_current_brmem_branch(ctx, request.branch):
        case ClinkrExit() as exit_:
            return exit_
        case str() as branch:
            pass

    validation_failure = first_failure(
        (
            "invalid_namespace",
            None if request.namespace is None else check_namespace(request.namespace),
        ),
        ("invalid_key", check_key(request.key)),
        ("invalid_branch_name", check_branch_name(branch)),
    )
    if validation_failure is not None:
        error_type, message = validation_failure
        return ClinkrExit.failure(error_type=error_type, message=message)

    entry_ref = EntryRef(
        namespace=request.namespace,
        key=request.key,
        branch=branch,
        ref_name=ref_name_for_entry(request.namespace, request.key, branch),
    )

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
