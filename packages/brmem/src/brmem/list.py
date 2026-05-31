"""List Branch Memory Entries."""

from __future__ import annotations

from pathlib import Path

import click

from asdl_core.clinkr.context import load_typed_context
from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from brmem.context import BrmemCliContext
from brmem.key_validation import check_key
from brmem.ref_layout import (
    BASE_NAMESPACE,
    EntryRef,
    check_branch_name,
    check_namespace,
    namespace_display_label,
    normalize_namespace_option,
)
from brmem.validation import first_failure

_ALL_NAMESPACES_SCOPE = "all"


class ListEntriesRequest(ClinkrModel):
    namespace: str | None = None
    key: str | None = None
    branch: str | None = None
    base: bool = False
    all_branches: bool = False


class ListEntriesResult(ClinkrModel):
    namespace_scope: str
    key: str | None
    branch: str
    base: bool
    all_branches: bool
    entries: list[EntryRef]


def render_list_entries(result: ListEntriesResult) -> None:
    for entry in result.entries:
        click.echo(
            f"{namespace_display_label(entry.namespace)} | "
            f"Entry Key {entry.key} | Branch {entry.branch}"
        )


@clinkr_operation(
    name="list",
    help=(
        "List Branch Memory Entries. Defaults to the current branch; "
        "pass --branch to override or --all-branches to include every branch. "
        "--namespace and --key further filter. Pass --base to restrict to ad-hoc base Entries."
    ),
    human_renderer=render_list_entries,
)
def run_list_entries(
    ctx: click.Context,
    request: ListEntriesRequest,
) -> ClinkrExit[ListEntriesResult]:
    brmem_context = load_typed_context(ctx, BrmemCliContext)

    Ensure.true(
        not (request.base and request.namespace is not None),
        error_type="base_and_namespace_conflict",
        message="--base and --namespace are mutually exclusive.",
    )
    Ensure.true(
        not (request.branch is not None and request.all_branches),
        error_type="branch_and_all_branches_conflict",
        message="--branch and --all-branches are mutually exclusive.",
    )

    all_namespaces = not request.base and request.namespace is None
    scope_namespace = _scope_namespace(request)
    validation_failure = first_failure(
        (
            "invalid_namespace",
            None if all_namespaces else check_namespace(scope_namespace),
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

    branch = None
    if not request.all_branches:
        branch = (
            request.branch
            if request.branch is not None
            else Ensure.ideal_state(brmem_context.git_gateway.get_current_branch(Path.cwd()))
        )

    if all_namespaces:
        entries = brmem_context.brmem_gateway.list_all_entries(
            key=request.key,
            branch=branch,
        )
        namespace_scope = _ALL_NAMESPACES_SCOPE
    else:
        entries = brmem_context.brmem_gateway.list_entries(
            namespace=scope_namespace,
            key=request.key,
            branch=branch,
        )
        namespace_scope = scope_namespace

    return ClinkrExit.ok(
        ListEntriesResult(
            namespace_scope=namespace_scope,
            key=request.key,
            branch=branch,
            base=request.base,
            all_branches=request.all_branches,
            entries=entries,
        )
    )


def _scope_namespace(request: ListEntriesRequest) -> str:
    if request.base:
        return BASE_NAMESPACE
    return normalize_namespace_option(request.namespace)
