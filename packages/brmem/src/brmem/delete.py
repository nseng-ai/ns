"""Remove a single Branch Memory Entry."""

from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Annotated

import click

from asdl_core.clinkr.context import load_typed_context
from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.failure import ClinkrFailure
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from brmem.context import BrmemCliContext
from brmem.gateway import KeyNotFoundError
from brmem.key_validation import check_key
from brmem.ref_layout import (
    EntryRef,
    check_branch_name,
    check_namespace,
    ref_name_for_entry,
)
from brmem.validation import first_failure


class DeleteRequest(ClinkrModel):
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
            help=("Namespace (e.g. 'notes'). Omit for ad-hoc base Entries."),
        ),
    ] = None
    branch: str | None = None


class DeleteResult(ClinkrModel):
    namespace: str | None
    key: str
    branch: str
    ref_name: str
    commit: str


def render_delete(result: DeleteResult) -> None:
    scope = f"Namespace {result.namespace}" if result.namespace is not None else "Base"
    click.echo(
        "\n".join(
            [
                f"Deleted Entry Key {result.key} from {scope} on Branch {result.branch}.",
                f"Ref: {result.ref_name}",
                f"Commit: {result.commit}",
            ]
        )
    )


@clinkr_operation(
    name="delete",
    help="Remove a single Branch Memory Entry.",
    human_renderer=render_delete,
)
def run_delete(
    ctx: click.Context,
    request: DeleteRequest,
) -> ClinkrExit[DeleteResult]:
    brmem_context = load_typed_context(ctx, BrmemCliContext)
    branch = (
        request.branch
        if request.branch is not None
        else Ensure.ideal_state(brmem_context.git_gateway.get_current_branch(Path.cwd()))
    )

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

    try:
        commit = brmem_context.brmem_gateway.delete(
            entry_ref.namespace,
            entry_ref.key,
            entry_ref.branch,
        )
    except KeyNotFoundError as exc:
        namespace_label = entry_ref.namespace if entry_ref.namespace is not None else "(base)"
        raise ClinkrFailure(
            error_type="key_not_found",
            message=(
                f"No Entry to delete: Entry Key={entry_ref.key} "
                f"Namespace={namespace_label} Branch={entry_ref.branch} "
                f"at {entry_ref.ref_name}. "
                f"Underlying error: {exc}"
            ),
        ) from exc
    except subprocess.CalledProcessError as exc:
        details = (exc.stderr or "").strip() or str(exc)
        raise ClinkrFailure(
            error_type="git_failure",
            message=f"Failed to delete Branch Memory: {details}",
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
