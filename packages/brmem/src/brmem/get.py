"""Read content from a branch-memory entry."""

from __future__ import annotations

from typing import Annotated

import click

from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from brmem.gateway import (
    EntryRef,
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


class GetRequest(ClinkrModel):
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
    at: str | None = None


class GetResult(ClinkrModel):
    namespace: str | None
    key: str
    branch: str
    content: str
    ref_name: str
    target: str
    at: str | None = None


def render_get(result: GetResult) -> None:
    click.echo(result.content, nl=not result.content.endswith("\n"))


@clinkr_operation(
    name="get",
    help="Read content from a branch-memory entry.",
    human_renderer=render_get,
)
def run_get(
    ctx: click.Context,
    request: GetRequest,
) -> ClinkrExit[GetResult]:
    branch = resolve_current_brmem_branch(ctx, request.branch)

    failure = first_failure(
        (
            "invalid_namespace",
            None if request.namespace is None else check_namespace(request.namespace),
        ),
        ("invalid_key", check_key(request.key)),
        ("invalid_branch_name", check_branch_name(branch)),
    )
    error_type, message = failure or ("", "")
    Ensure.true(
        failure is None,
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
    target = request.at if request.at is not None else entry_ref.ref_name
    inspect_locator = (
        f"{request.at}:{entry_ref.key}" if request.at is not None else entry_ref.ref_name
    )
    content = gateway.get(
        entry_ref.namespace,
        entry_ref.key,
        entry_ref.branch,
        at=request.at,
    )

    namespace_label = entry_ref.namespace if entry_ref.namespace is not None else "(base)"
    content = Ensure.not_none(
        content,
        error_type="branch_memory_missing",
        message=(
            f"No content for key {request.key} in namespace {namespace_label} "
            f"on branch {entry_ref.branch} at {target}. "
            f"Inspect with: git show {inspect_locator}"
        ),
    )

    return ClinkrExit.ok(
        GetResult(
            namespace=entry_ref.namespace,
            key=entry_ref.key,
            branch=entry_ref.branch,
            content=content,
            ref_name=entry_ref.ref_name,
            target=target,
            at=request.at,
        )
    )
