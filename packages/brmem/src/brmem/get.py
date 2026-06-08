"""Read content from a Branch Memory Entry."""

from __future__ import annotations

from pathlib import Path
from typing import Annotated

import click

from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from brmem.context import load_brmem_context
from brmem.key_validation import check_key
from brmem.ref_layout import (
    EntryRef,
    check_branch_name,
    check_namespace,
    namespace_value_label,
    normalize_namespace_option,
    ref_name_for_entry,
)
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
            help=("Namespace (e.g. 'notes'). Omit for ad-hoc base Entries."),
        ),
    ] = None
    branch: str | None = None
    at: str | None = None


class GetResult(ClinkrModel):
    namespace: str
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
    help="Read content from a Branch Memory Entry.",
    human_renderer=render_get,
)
def run_get(
    ctx: click.Context,
    request: GetRequest,
) -> ClinkrExit[GetResult]:
    brmem_context = load_brmem_context(ctx)
    branch = (
        request.branch
        if request.branch is not None
        else Ensure.ideal_state(brmem_context.git_gateway.get_current_branch(Path.cwd()))
    )

    namespace = normalize_namespace_option(request.namespace)

    failure = first_failure(
        ("invalid_namespace", check_namespace(namespace)),
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
        namespace=namespace,
        key=request.key,
        branch=branch,
        ref_name=ref_name_for_entry(namespace, request.key, branch),
    )

    target = request.at if request.at is not None else entry_ref.ref_name
    inspect_locator = (
        f"{request.at}:{entry_ref.key}" if request.at is not None else entry_ref.ref_name
    )
    content = brmem_context.brmem_gateway.get(
        entry_ref.namespace,
        entry_ref.key,
        entry_ref.branch,
        at=request.at,
    )

    namespace_label = namespace_value_label(entry_ref.namespace)
    content = Ensure.not_none(
        content,
        error_type="branch_memory_missing",
        message=(
            f"No content for Entry Key {request.key} in Namespace {namespace_label} "
            f"on Branch {entry_ref.branch} at {target}. "
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
