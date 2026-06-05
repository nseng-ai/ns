"""Shared inventory helpers for directed handoff artifacts."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal

from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.git.git_gateway import GitGateway
from brmem.gateway import BranchMemoryGateway
from brmem.key_validation import check_key
from brmem.ref_layout import EntryRef

HANDOFF_NAMESPACE = "handoff"
_HANDOFF_KEY_SUFFIX = ".md"

BranchState = Literal["active", "deleted"]


class HandoffSummary(ClinkrModel):
    branch: str
    branch_state: BranchState
    slug: str
    key: str
    entry_locator: str
    updated_at: str


def collect_handoff_summaries(
    entries: list[EntryRef],
    brmem_gateway: BranchMemoryGateway,
    git_gateway: GitGateway,
    *,
    include_deleted: bool = True,
) -> list[HandoffSummary]:
    handoffs: list[tuple[HandoffSummary, datetime]] = []
    branch_states: dict[str, BranchState] = {}
    seen: set[tuple[str, str]] = set()

    for entry in entries:
        if entry.namespace != HANDOFF_NAMESPACE or not is_handoff_key(entry.key):
            continue

        identity = (entry.branch, entry.key)
        if identity in seen:
            continue
        seen.add(identity)

        branch_state = _branch_state(entry.branch, git_gateway, branch_states)
        if branch_state == "deleted" and not include_deleted:
            continue

        slug = handoff_slug_from_key(entry.key)
        updated_at = brmem_gateway.get_entry_updated_at(entry.namespace, entry.key, entry.branch)
        if updated_at is None:
            Ensure.fail(
                error_type="handoff_updated_at_unavailable",
                message=(
                    f"Cannot determine updated timestamp for handoff {slug!r} "
                    f"on branch {entry.branch!r}."
                ),
            )

        updated_dt = _parse_updated_at_or_fail(updated_at, slug=slug, branch=entry.branch)
        handoffs.append(
            (
                HandoffSummary(
                    branch=entry.branch,
                    branch_state=branch_state,
                    slug=slug,
                    key=entry.key,
                    entry_locator=entry.entry_locator,
                    updated_at=updated_at,
                ),
                updated_dt,
            )
        )

    handoffs.sort(key=lambda item: item[0].slug)
    handoffs.sort(key=lambda item: item[1], reverse=True)
    handoffs.sort(key=lambda item: item[0].branch)
    return [handoff for handoff, _updated_at in handoffs]


def _branch_state(
    branch: str,
    git_gateway: GitGateway,
    branch_states: dict[str, BranchState],
) -> BranchState:
    existing_state = branch_states.get(branch)
    if existing_state is not None:
        return existing_state

    state: BranchState = "active" if git_gateway.branch_exists(branch) else "deleted"
    branch_states[branch] = state
    return state


def _parse_updated_at_or_fail(updated_at: str, *, slug: str, branch: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(updated_at.replace("Z", "+00:00"))
    except ValueError:
        Ensure.fail(
            error_type="handoff_updated_at_unavailable",
            message=(
                f"Cannot determine updated timestamp for handoff {slug!r} on branch {branch!r}: "
                f"gateway returned invalid timestamp {updated_at!r}."
            ),
        )
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def is_handoff_key(key: str) -> bool:
    return (
        key.endswith(_HANDOFF_KEY_SUFFIX)
        and "/" not in key
        and len(key) > len(_HANDOFF_KEY_SUFFIX)
        and check_key(key) is None
    )


def handoff_slug_from_key(key: str) -> str:
    return key[: -len(_HANDOFF_KEY_SUFFIX)]
