"""Write content to a Branch Memory Entry."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path, PurePosixPath
from typing import Annotated

import click

from asdl_core.clinkr.context import is_machine_mode
from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.failure import ClinkrFailure
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from brmem.content_limits import (
    check_entry_not_binary,
    check_entry_size,
)
from brmem.gateway_access import (
    get_branch_memory_gateway,
    resolve_current_brmem_branch,
)
from brmem.key_validation import check_key
from brmem.ref_layout import (
    EntryRef,
    check_branch_name,
    check_namespace,
    ref_name_for_entry,
)
from brmem.validation import first_failure


class PutRequest(ClinkrModel):
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
            help=("Namespace (e.g. 'notes'). Omit for ad-hoc base Entries."),
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


class PutResult(ClinkrModel):
    namespace: str | None
    key: str
    branch: str
    ref_name: str
    commit: str
    source_file: str


def render_put(result: PutResult) -> None:
    source = "stdin" if result.source_file == "<stdin>" else result.source_file
    scope = f"Namespace {result.namespace}" if result.namespace is not None else "Base"
    click.echo(
        "\n".join(
            [
                (
                    f"Stored Entry Key {result.key} from {source} in {scope} "
                    f"on Branch {result.branch}."
                ),
                f"Ref: {result.ref_name}",
                f"Commit: {result.commit}",
                f"Inspect: git show {result.ref_name}",
            ]
        )
    )


@clinkr_operation(
    name="put",
    help="Write content to a Branch Memory Entry.",
    human_renderer=render_put,
)
def run_put(
    ctx: click.Context,
    request: PutRequest,
) -> ClinkrExit[PutResult]:
    Ensure.true(
        not (request.stdin and is_machine_mode(ctx)),
        error_type="stdin_unsupported_in_json_mode",
        message=(
            "brmem put --stdin is only supported in the human CLI; JSON mode already "
            "uses stdin for the request body."
        ),
    )

    Ensure.true(
        not (request.stdin and request.file is not None),
        error_type="stdin_and_file_conflict",
        message="--stdin and --file are mutually exclusive.",
    )

    if request.stdin:
        raw = sys.stdin.buffer.read()
        source_file = "<stdin>"
    else:
        source_path = Ensure.not_none(
            request.file if request.file is not None else _default_source(request.key),
            error_type="source_file_missing",
            message=(
                f"Cannot infer a default --file for Entry Key {request.key!r}; "
                "provide --file or --stdin."
            ),
        )
        try:
            raw = Path(source_path).read_bytes()
        except FileNotFoundError as exc:
            raise ClinkrFailure(
                error_type="source_file_missing",
                message=f"Source file not found: {source_path}",
            ) from exc
        except OSError as exc:
            raise ClinkrFailure(
                error_type="source_file_unreadable",
                message=f"Failed to read source file {source_path}: {exc}",
            ) from exc
        source_file = source_path

    if not request.force:
        size_msg = check_entry_size(raw)
        Ensure.true(
            size_msg is None,
            error_type="entry_too_large",
            message=f"{source_file} {size_msg}. Pass -f / --force to override.",
        )
        binary_msg = check_entry_not_binary(raw)
        Ensure.true(
            binary_msg is None,
            error_type="entry_appears_binary",
            message=f"{source_file} {binary_msg}. Pass -f / --force to override.",
        )

    try:
        content = raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ClinkrFailure(
            error_type="entry_not_utf8",
            message=f"{source_file} is not valid UTF-8: {exc}",
        ) from exc

    branch = resolve_current_brmem_branch(ctx, request.branch)

    validation_failure = first_failure(
        (
            "invalid_namespace",
            None if request.namespace is None else check_namespace(request.namespace),
        ),
        ("invalid_key", check_key(request.key)),
        ("invalid_branch_name", check_branch_name(branch)),
    )
    error_type, message = validation_failure or ("", "")
    Ensure.true(
        validation_failure is None,
        error_type=error_type,
        message=message,
    )

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
        raise ClinkrFailure(
            error_type="git_failure",
            message=f"Failed to write Branch Memory: {details}",
        ) from exc

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
