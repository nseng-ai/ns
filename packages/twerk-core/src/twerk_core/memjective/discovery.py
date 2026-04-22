"""Repo-wide memjective discovery.

Group every ``refs/brmem/memjectives/<encoded-branch>/<slug>/body.md`` entry
by slug, tracking master-seed presence separately from branch snapshots and
marking snapshot branches that no longer exist as local refs.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from twerk_core.brmem.gateway import BranchMemoryGateway, EntryRef
from twerk_core.memjective.gateway_access import MEMJECTIVE_NAMESPACE

MASTER_BRANCH = "master"
_BODY_SUFFIX = "/body.md"


@dataclass(frozen=True)
class BranchPresence:
    """A branch that carries a memjective snapshot."""

    branch: str
    stale: bool


@dataclass(frozen=True)
class MemjectiveRepoEntry:
    """A single memjective slug as it exists across the repo."""

    slug: str
    key: str
    seed_present: bool
    branches: tuple[BranchPresence, ...]

    @property
    def live_branch_count(self) -> int:
        return sum(1 for bp in self.branches if not bp.stale)

    @property
    def stale_branch_count(self) -> int:
        return sum(1 for bp in self.branches if bp.stale)


def slug_for_key(key: str) -> str:
    """Return the user-facing slug for a brmem key (strips a trailing ``/body.md``)."""
    if key.endswith(_BODY_SUFFIX):
        return key[: -len(_BODY_SUFFIX)]
    return key


def key_for_slug(slug: str) -> str:
    """Return the canonical brmem key for ``slug`` (adds ``/body.md`` when missing)."""
    if slug.endswith(_BODY_SUFFIX):
        return slug
    return f"{slug}{_BODY_SUFFIX}"


def discover_memjectives(
    gateway: BranchMemoryGateway,
    *,
    is_branch_alive: Callable[[str], bool] | None = None,
) -> tuple[MemjectiveRepoEntry, ...]:
    """List every memjective slug in the repo, grouped across branches."""
    entries = gateway.list_entries(namespace=MEMJECTIVE_NAMESPACE)
    return group_memjective_entries(entries, is_branch_alive=is_branch_alive)


def group_memjective_entries(
    entries: list[EntryRef] | tuple[EntryRef, ...],
    *,
    is_branch_alive: Callable[[str], bool] | None = None,
) -> tuple[MemjectiveRepoEntry, ...]:
    """Group ``entries`` (already filtered to the memjectives namespace) by slug."""
    by_key: dict[str, list[EntryRef]] = {}
    for entry in entries:
        by_key.setdefault(entry.key, []).append(entry)

    result: list[MemjectiveRepoEntry] = []
    for key in sorted(by_key):
        key_entries = by_key[key]
        seed_present = any(e.branch == MASTER_BRANCH for e in key_entries)
        branch_names = sorted({e.branch for e in key_entries if e.branch != MASTER_BRANCH})
        presences = tuple(
            BranchPresence(
                branch=branch,
                stale=is_branch_alive is not None and not is_branch_alive(branch),
            )
            for branch in branch_names
        )
        result.append(
            MemjectiveRepoEntry(
                slug=slug_for_key(key),
                key=key,
                seed_present=seed_present,
                branches=presences,
            )
        )
    return tuple(result)
