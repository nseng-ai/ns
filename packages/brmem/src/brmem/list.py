"""List Branch Memory Entries."""

from __future__ import annotations

import click

from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from brmem.gateway_access import (
    get_branch_memory_gateway,
    resolve_current_brmem_branch,
)
from brmem.key_validation import check_key
from brmem.ref_layout import EntryRef, check_branch_name, check_namespace
from brmem.validation import first_failure


class ListEntriesRequest(ClinkrModel):
    namespace: str | None = None
    key: str | None = None
    branch: str | None = None
    base: bool = False


class ListEntriesResult(ClinkrModel):
    namespace: str | None
    key: str | None
    branch: str | None
    base: bool
    entries: list[EntryRef]


def render_list_entries(result: ListEntriesResult) -> None:
    for entry in result.entries:
        scope = f"Namespace {entry.namespace}" if entry.namespace is not None else "Base"
        click.echo(f"{scope} | Entry Key {entry.key} | Branch {entry.branch}")


@clinkr_operation(
    name="list",
    help=(
        "List Branch Memory Entries. Defaults to the current branch; "
        "pass --branch to override. --namespace and --key further filter. "
        "Pass --base to restrict to ad-hoc base Entries."
    ),
    human_renderer=render_list_entries,
)
def run_list_entries(
    ctx: click.Context,
    request: ListEntriesRequest,
) -> ClinkrExit[ListEntriesResult]:
    Ensure.true(
        not (request.base and request.namespace is not None),
        error_type="base_and_namespace_conflict",
        message="--base and --namespace are mutually exclusive.",
    )

    validation_failure = first_failure(
        (
            "invalid_namespace",
            None if request.namespace is None else check_namespace(request.namespace),
        ),
        ("invalid_key", None if request.key is None else check_key(request.key)),
        (
            "invalid_branch_name",
            None if request.branch is None else check_branch_name(request.branch),
        ),
    )
    error_type, message = validation_failure or ("", "")
    Ensure.true(
        validation_failure is None,
        error_type=error_type,
        message=message,
    )

    branch = resolve_current_brmem_branch(ctx, request.branch)

    gateway = get_branch_memory_gateway(ctx)
    entries = gateway.list_entries(
        namespace=request.namespace,
        key=request.key,
        branch=branch,
    )

    if request.base:
        entries = [e for e in entries if e.namespace is None]

    return ClinkrExit.ok(
        ListEntriesResult(
            namespace=request.namespace,
            key=request.key,
            branch=branch,
            base=request.base,
            entries=entries,
        )
    )
