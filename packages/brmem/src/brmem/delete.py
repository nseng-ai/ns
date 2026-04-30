"""Remove a single branch-memory entry."""

from __future__ import annotations

import subprocess
from dataclasses import dataclass
from typing import Annotated

import click

from brmem.gateway import (
    EntryRef,
    KeyNotFoundError,
    check_branch_name,
    check_namespace,
    ref_name_for_entry,
)
from brmem.gateway_access import (
    get_branch_memory_gateway,
    resolve_current_brmem_branch,
)
from brmem.key_validation import check_key
from brmem.validation import first_failure
from twerk_core.clinkr.dataclass_json import JsonSerializable
from twerk_core.clinkr.exit import ClinkrExit
from twerk_core.clinkr.operation import clinkr_operation


@dataclass(frozen=True)
class DeleteRequest:
    key: Annotated[
        str,
        click.Argument(["key"], type=click.STRING),
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
    branch: str | None = None


@dataclass(frozen=True)
class DeleteResult(JsonSerializable):
    namespace: str | None
    key: str
    branch: str
    ref_name: str
    commit: str


def render_delete(result: DeleteResult) -> None:
    namespace_label = result.namespace if result.namespace is not None else "base"
    click.echo(
        "\n".join(
            [
                f"Deleted {result.key} from {namespace_label} on branch {result.branch}.",
                f"Ref: {result.ref_name}",
                f"Commit: {result.commit}",
            ]
        )
    )


@clinkr_operation(
    name="delete",
    help="Remove a single branch-memory entry.",
    human_renderer=render_delete,
)
def run_delete(
    ctx: click.Context,
    request: DeleteRequest,
) -> ClinkrExit[DeleteResult]:
    branch = resolve_current_brmem_branch(ctx, request.branch)

    failure = first_failure(
        (
            "invalid_namespace",
            None if request.namespace is None else check_namespace(request.namespace),
        ),
        ("invalid_key", check_key(request.key)),
        ("invalid_branch_name", check_branch_name(branch)),
    )
    if failure is not None:
        error_type, message = failure
        raise ClinkrExit.failure(error_type=error_type, message=message)

    entry_ref = EntryRef(
        namespace=request.namespace,
        key=request.key,
        branch=branch,
        ref_name=ref_name_for_entry(request.namespace, request.key, branch),
    )

    gateway = get_branch_memory_gateway(ctx)

    try:
        commit = gateway.delete(
            entry_ref.namespace,
            entry_ref.key,
            entry_ref.branch,
        )
    except KeyNotFoundError as exc:
        namespace_label = entry_ref.namespace if entry_ref.namespace is not None else "(base)"
        raise ClinkrExit.failure(
            error_type="key_not_found",
            message=(
                f"No entry to delete: key={entry_ref.key} namespace={namespace_label} "
                f"branch={entry_ref.branch} at {entry_ref.ref_name}. "
                f"Underlying error: {exc}"
            ),
        ) from exc
    except subprocess.CalledProcessError as exc:
        details = (exc.stderr or "").strip() or str(exc)
        raise ClinkrExit.failure(
            error_type="git_failure",
            message=f"Failed to delete branch memory: {details}",
        ) from exc

    return ClinkrExit.ok(
        DeleteResult(
            namespace=entry_ref.namespace,
            key=entry_ref.key,
            branch=entry_ref.branch,
            ref_name=entry_ref.ref_name,
            commit=commit,
        )
    )
