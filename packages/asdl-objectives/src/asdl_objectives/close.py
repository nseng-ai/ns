"""``objective close`` — move an objective into the archive namespace."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Annotated, Any, NamedTuple

import click

from asdl_core.clinkr.context import load_typed_context
from asdl_core.clinkr.dataclass_json import JsonSerializable
from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.operation import clinkr_operation
from asdl_objectives.closed_marker import load_closed_marker, serialize_closed_marker
from asdl_objectives.context import ObjectiveCliContext
from asdl_objectives.discovery import body_key, closed_key, slug_for_key
from asdl_objectives.gateway_access import OBJECTIVE_ARCHIVE_NAMESPACE, OBJECTIVE_NAMESPACE
from asdl_objectives.trunk_resolution import resolve_trunk
from brmem.gateway import BranchMemoryGateway, EntryRef


class _EntryIdentity(NamedTuple):
    branch: str
    key: str


@dataclass(frozen=True)
class ObjectiveCloseRequest:
    slug: Annotated[
        str,
        click.Argument(["slug"], type=click.STRING),
    ]
    reason: Annotated[
        str | None,
        click.Option(
            ["--reason"],
            type=click.STRING,
            default=None,
            help="Optional human-readable reason recorded with the closed marker.",
        ),
    ] = None


@dataclass(frozen=True)
class ObjectiveCloseResult(JsonSerializable):
    slug: str
    trunk_branch: str
    state: str
    closed_at: str
    reason: str | None
    already_closed: bool
    archived_entries: int
    branches_touched: int

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "slug": self.slug,
            "trunk_branch": self.trunk_branch,
            "state": self.state,
            "closed_at": self.closed_at,
            "reason": self.reason,
            "already_closed": self.already_closed,
            "archived_entries": self.archived_entries,
            "branches_touched": self.branches_touched,
        }


def render_objective_close(result: ObjectiveCloseResult) -> None:
    if result.already_closed:
        click.echo(f"{result.slug} already closed (closed_at={result.closed_at}).")
    else:
        click.echo(
            f"Closed {result.slug} on {result.trunk_branch} at {result.closed_at} "
            f"(archived_entries={result.archived_entries}, "
            f"branches_touched={result.branches_touched})."
        )


@clinkr_operation(
    name="close",
    help=(
        "Close an objective by moving its active refs into the archive namespace "
        "and writing the canonical `.closed` marker there. Idempotent: "
        "re-closing preserves the archived closed_at."
    ),
    human_renderer=render_objective_close,
)
def run_close_objective(
    ctx: click.Context,
    request: ObjectiveCloseRequest,
) -> ClinkrExit[ObjectiveCloseResult]:
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

    active_body_present = (
        gateway.check(OBJECTIVE_NAMESPACE, body_key(request.slug), trunk) is not None
    )
    archived_body_present = (
        gateway.check(OBJECTIVE_ARCHIVE_NAMESPACE, body_key(request.slug), trunk) is not None
    )
    archived_marker = load_closed_marker(gateway, slug=request.slug, trunk_branch=trunk)

    if not active_body_present:
        if archived_body_present and archived_marker.present:
            archived_closed_at = archived_marker.closed_at
            if archived_closed_at is not None:
                return ClinkrExit.ok(
                    ObjectiveCloseResult(
                        slug=request.slug,
                        trunk_branch=trunk,
                        state="closed",
                        closed_at=archived_closed_at,
                        reason=archived_marker.reason,
                        already_closed=True,
                        archived_entries=len(archived_entries),
                        branches_touched=_branch_count(archived_entries),
                    )
                )
        Ensure.true(
            False,
            error_type="unknown_slug",
            message=(
                f"No canonical objective for slug {request.slug!r} on {trunk!r}. "
                "Run `objective reconcile` to land it before closing."
            ),
        )

    active_payload = _content_map(gateway, OBJECTIVE_NAMESPACE, active_entries)
    active_payload.pop(_EntryIdentity(trunk, closed_key(request.slug)), None)

    if archived_entries:
        Ensure.true(
            archived_marker.present and archived_marker.closed_at is not None,
            error_type="archive_conflict",
            message=(
                f"Archive already contains {request.slug!r} but has no valid trunk .closed marker."
            ),
        )
        marker_content = gateway.get(OBJECTIVE_ARCHIVE_NAMESPACE, closed_key(request.slug), trunk)
        if marker_content is None:
            Ensure.true(
                False,
                error_type="archive_conflict",
                message=(
                    f"Archive already contains {request.slug!r} but is missing "
                    "trunk .closed content."
                ),
            )
            marker_content = ""
        desired_payload = active_payload | {
            _EntryIdentity(trunk, closed_key(request.slug)): marker_content
        }
        archived_payload = _content_map(gateway, OBJECTIVE_ARCHIVE_NAMESPACE, archived_entries)
        Ensure.true(
            archived_payload == desired_payload,
            error_type="archive_conflict",
            message=(
                f"Active and archived refs both contain {request.slug!r}; archive content differs "
                "from the active objective, so close cannot safely clean up active refs."
            ),
        )
        _delete_entries(gateway, OBJECTIVE_NAMESPACE, active_entries)
        return ClinkrExit.ok(
            ObjectiveCloseResult(
                slug=request.slug,
                trunk_branch=trunk,
                state="closed",
                closed_at=archived_marker.closed_at or "",
                reason=archived_marker.reason,
                already_closed=True,
                archived_entries=len(archived_entries),
                branches_touched=_branch_count(archived_entries),
            )
        )

    closed_at = datetime.now(UTC).isoformat()
    marker_content = serialize_closed_marker(closed_at=closed_at, reason=request.reason)
    desired_payload = active_payload | {
        _EntryIdentity(trunk, closed_key(request.slug)): marker_content
    }
    for identity, content in sorted(desired_payload.items()):
        gateway.put(OBJECTIVE_ARCHIVE_NAMESPACE, identity.key, identity.branch, content)

    copied_entries = _entries_for_slug(
        gateway.list_entries(namespace=OBJECTIVE_ARCHIVE_NAMESPACE),
        request.slug,
    )
    copied_payload = _content_map(gateway, OBJECTIVE_ARCHIVE_NAMESPACE, copied_entries)
    Ensure.true(
        copied_payload == desired_payload,
        error_type="archive_verification_failed",
        message=(
            f"Archive verification failed while closing {request.slug!r}; active refs were kept."
        ),
    )

    _delete_entries(gateway, OBJECTIVE_NAMESPACE, active_entries)

    return ClinkrExit.ok(
        ObjectiveCloseResult(
            slug=request.slug,
            trunk_branch=trunk,
            state="closed",
            closed_at=closed_at,
            reason=request.reason,
            already_closed=False,
            archived_entries=len(copied_entries),
            branches_touched=_branch_count(copied_entries),
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
