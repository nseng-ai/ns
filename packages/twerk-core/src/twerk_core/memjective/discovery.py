"""Repo-wide memjective discovery.

Group every ``refs/brmem/ns/memjectives/<encoded-branch>/<slug>/<filename>``
entry by slug, tracking master-seed presence separately from branch
snapshots and marking snapshot branches that no longer exist as local
refs. A memjective is a directory of files (``body.md`` plus optional
``roadmap.md`` / ``notes.md``), so the slug is the key prefix up to the
last ``/``.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from twerk_core.brmem.gateway import BranchMemoryGateway, EntryRef
from twerk_core.memjective.gateway_access import MEMJECTIVE_NAMESPACE

MASTER_BRANCH = "master"

BODY_FILE = "body.md"
ROADMAP_FILE = "roadmap.md"
NOTES_FILE = "notes.md"


@dataclass(frozen=True)
class BranchPresence:
    """A branch that carries a memjective snapshot."""

    branch: str
    stale: bool


@dataclass(frozen=True)
class MemjectiveRepoEntry:
    """A single memjective slug as it exists across the repo."""

    slug: str
    files: tuple[str, ...]
    seed_present: bool
    branches: tuple[BranchPresence, ...]

    @property
    def live_branch_count(self) -> int:
        return sum(1 for bp in self.branches if not bp.stale)

    @property
    def stale_branch_count(self) -> int:
        return sum(1 for bp in self.branches if bp.stale)


def slug_for_key(key: str) -> str:
    """Return the user-facing slug for a brmem key.

    The slug is everything before the last ``/`` in the key. Keys without a
    ``/`` are returned unchanged (legacy safety).
    """
    if "/" not in key:
        return key
    return key.rsplit("/", 1)[0]


def body_key(slug: str) -> str:
    """Return the brmem key for the ``body.md`` file of ``slug``."""
    return f"{slug}/{BODY_FILE}"


def roadmap_key(slug: str) -> str:
    """Return the brmem key for the ``roadmap.md`` file of ``slug``."""
    return f"{slug}/{ROADMAP_FILE}"


def notes_key(slug: str) -> str:
    """Return the brmem key for the ``notes.md`` file of ``slug``."""
    return f"{slug}/{NOTES_FILE}"


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
    by_slug: dict[str, list[EntryRef]] = {}
    for entry in entries:
        by_slug.setdefault(slug_for_key(entry.key), []).append(entry)

    result: list[MemjectiveRepoEntry] = []
    for slug in sorted(by_slug):
        slug_entries = by_slug[slug]
        seed_present = any(e.branch == MASTER_BRANCH for e in slug_entries)
        branch_names = sorted({e.branch for e in slug_entries if e.branch != MASTER_BRANCH})
        presences = tuple(
            BranchPresence(
                branch=branch,
                stale=is_branch_alive is not None and not is_branch_alive(branch),
            )
            for branch in branch_names
        )
        files = tuple(sorted({_filename_for_key(e.key, slug) for e in slug_entries}))
        result.append(
            MemjectiveRepoEntry(
                slug=slug,
                files=files,
                seed_present=seed_present,
                branches=presences,
            )
        )
    return tuple(result)


def _filename_for_key(key: str, slug: str) -> str:
    prefix = f"{slug}/"
    if key.startswith(prefix):
        return key[len(prefix) :]
    return key
