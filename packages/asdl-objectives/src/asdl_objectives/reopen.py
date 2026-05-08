"""``objective reopen`` — move an archived objective back to the active namespace."""

from __future__ import annotations

from typing import Annotated, NamedTuple

import click

from asdl_core.clinkr.context import load_typed_context
from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_objectives.context import ObjectiveCliContext
from asdl_objectives.discovery import body_key, closed_key, slug_for_key
from asdl_objectives.gateway_access import OBJECTIVE_ARCHIVE_NAMESPACE, OBJECTIVE_NAMESPACE
from asdl_objectives.trunk_resolution import resolve_trunk
from brmem.gateway import BranchMemoryGateway
from brmem.ref_layout import EntryRef


class _EntryIdentity(NamedTuple):
    branch: str
    key: str


class ObjectiveReopenRequest(ClinkrModel):
    slug: Annotated[
        str,
        click.Argument(["slug"], type=click.STRING),
    ]


class ObjectiveReopenResult(ClinkrModel):
    slug: str
    trunk_branch: str
    state: str
    already_open: bool
    reopened_entries: int
    branches_touched: int


def render_objective_reopen(result: ObjectiveReopenResult) -> None:
    if result.already_open:
        click.echo(f"{result.slug} is already open.")
    else:
        click.echo(
            f"Reopened {result.slug} on {result.trunk_branch} "
            f"(reopened_entries={result.reopened_entries}, "
            f"branches_touched={result.branches_touched})."
        )


@clinkr_operation(
    name="reopen",
    help=(
        "Reopen an objective by moving archived refs back into the active namespace "
        "and dropping the archived `.closed` marker. Idempotent: reopening an "
        "already-open objective is a no-op."
    ),
    human_renderer=render_objective_reopen,
)
def run_reopen_objective(
    ctx: click.Context,
    request: ObjectiveReopenRequest,
) -> ClinkrExit[ObjectiveReopenResult]:
    mctx = load_typed_context(ctx, ObjectiveCliContext)
    gateway = mctx.brmem_gateway
    trunk = resolve_trunk(mctx.git_gateway).trunk

    active_entries = _entries_for_slug(
        gateway.list_entries(namespace=OBJECTIVE_NAMESPACE),
        request.slug,
    )
    archived_entries = _entries_for_slug(
        gateway.list_entries(namespace=OBJECTIVE_ARCHIVE_NAMESPACE),
        request.slug,
    )

    if not archived_entries:
        active_body_present = (
            gateway.check(OBJECTIVE_NAMESPACE, body_key(request.slug), trunk) is not None
        )
        Ensure.true(
            active_body_present,
            error_type="unknown_slug",
            message=f"No active or archived objective found for slug {request.slug!r}.",
        )
        return ClinkrExit.ok(
            ObjectiveReopenResult(
                slug=request.slug,
                trunk_branch=trunk,
                state="open",
                already_open=True,
                reopened_entries=len(active_entries),
                branches_touched=_branch_count(active_entries),
            )
        )

    archived_payload = _content_map(gateway, OBJECTIVE_ARCHIVE_NAMESPACE, archived_entries)
    archived_payload.pop(_EntryIdentity(trunk, closed_key(request.slug)), None)
    Ensure.true(
        _EntryIdentity(trunk, body_key(request.slug)) in archived_payload,
        error_type="unknown_slug",
        message=(
            f"No archived canonical objective body found for slug {request.slug!r} on {trunk!r}."
        ),
    )

    if active_entries:
        active_payload = _content_map(gateway, OBJECTIVE_NAMESPACE, active_entries)
        active_payload.pop(_EntryIdentity(trunk, closed_key(request.slug)), None)
        Ensure.true(
            active_payload == archived_payload,
            error_type="reopen_conflict",
            message=(
                f"Active and archived refs both contain {request.slug!r}; active content differs "
                "from the archive, so reopen cannot safely clean up archived refs."
            ),
        )
    else:
        for identity, content in sorted(archived_payload.items()):
            gateway.put(OBJECTIVE_NAMESPACE, identity.key, identity.branch, content)
        copied_entries = _entries_for_slug(
            gateway.list_entries(namespace=OBJECTIVE_NAMESPACE),
            request.slug,
        )
        copied_payload = _content_map(gateway, OBJECTIVE_NAMESPACE, copied_entries)
        Ensure.true(
            copied_payload == archived_payload,
            error_type="reopen_verification_failed",
            message=(
                f"Active verification failed while reopening {request.slug!r}; "
                "archive refs were kept."
            ),
        )

    _delete_entries(gateway, OBJECTIVE_ARCHIVE_NAMESPACE, archived_entries)

    return ClinkrExit.ok(
        ObjectiveReopenResult(
            slug=request.slug,
            trunk_branch=trunk,
            state="open",
            already_open=False,
            reopened_entries=len(archived_payload),
            branches_touched=len({identity.branch for identity in archived_payload}),
        )
    )


def _entries_for_slug(entries: list[EntryRef], slug: str) -> tuple[EntryRef, ...]:
    return tuple(entry for entry in entries if slug_for_key(entry.key) == slug)


def _content_map(
    gateway: BranchMemoryGateway,
    namespace: str,
    entries: tuple[EntryRef, ...],
) -> dict[_EntryIdentity, str]:
    result: dict[_EntryIdentity, str] = {}
    for entry in entries:
        content = gateway.get(namespace, entry.key, entry.branch)
        Ensure.true(
            content is not None,
            error_type="missing_entry_content",
            message=f"Entry {entry.ref_name!r} disappeared while preparing archive move.",
        )
        result[_EntryIdentity(entry.branch, entry.key)] = content or ""
    return result


def _delete_entries(
    gateway: BranchMemoryGateway,
    namespace: str,
    entries: tuple[EntryRef, ...],
) -> None:
    for entry in entries:
        gateway.delete(namespace, entry.key, entry.branch)


def _branch_count(entries: tuple[EntryRef, ...]) -> int:
    return len({entry.branch for entry in entries})
