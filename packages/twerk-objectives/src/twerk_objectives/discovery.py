"""Repo-wide objective discovery.

Group every ``refs/brmem/ns/objectives/<encoded-branch>:<slug>/<filename>``
entry by slug, tracking canonical-record presence separately from branch
snapshots and marking snapshot branches that no longer exist as local
refs. A objective is a directory of files (``body.md`` plus optional
``roadmap.md`` / ``notes.md``), so the slug is the key prefix up to the
last ``/``.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from brmem.gateway import BranchMemoryGateway, EntryRef
from twerk_objectives.gateway_access import OBJECTIVE_NAMESPACE

# Canonical objective storage lives on the repo's trunk branch (whatever
# ``git symbolic-ref refs/remotes/origin/HEAD`` resolves to: typically
# ``master`` on legacy repos, ``main`` on greenfield ones). Production
# callers must resolve the trunk through ``GitGateway.get_trunk_branch()``
# (already plumbed onto :class:`ObjectiveCliContext.git_gateway` via
# :func:`twerk_core.git.real_git_gateway.resolve_trunk_branch`) rather than
# reading the constant below. ``FALLBACK_TRUNK_BRANCH`` is a last-resort
# default for code paths that have no gateway in scope and no other way to
# resolve trunk (e.g. context construction outside a git repo). Comparing
# branches against this literal in production code is a smell. See
# "Authority Boundaries" / "Canonical Storage Branch" in
# ``packages/twerk-objectives/AGENTS.md``.
FALLBACK_TRUNK_BRANCH = "main"

BODY_FILE = "body.md"
ROADMAP_FILE = "roadmap.md"
NOTES_FILE = "notes.md"
ABSORBED_PATCHES_FILE = ".absorbed.jsonl"


@dataclass(frozen=True)
class BranchPresence:
    """A branch that carries a objective snapshot."""

    branch: str
    deleted: bool


@dataclass(frozen=True)
class ObjectiveRepoEntry:
    """A single objective slug as it exists across the repo."""

    slug: str
    files: tuple[str, ...]
    canonical_present: bool
    branches: tuple[BranchPresence, ...]

    @property
    def live_branch_count(self) -> int:
        return sum(1 for bp in self.branches if not bp.deleted)

    @property
    def deleted_branch_count(self) -> int:
        return sum(1 for bp in self.branches if bp.deleted)


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


def absorbed_patches_key(slug: str) -> str:
    """Return the brmem key for the machine-owned absorbed-patches marker."""
    return f"{slug}/{ABSORBED_PATCHES_FILE}"


def discover_objectives(
    gateway: BranchMemoryGateway,
    *,
    trunk_branch: str,
    is_branch_alive: Callable[[str], bool] | None = None,
) -> tuple[ObjectiveRepoEntry, ...]:
    """List every objective slug in the repo, grouped across branches."""
    entries = gateway.list_entries(namespace=OBJECTIVE_NAMESPACE)
    return group_objective_entries(
        entries,
        trunk_branch=trunk_branch,
        is_branch_alive=is_branch_alive,
    )


def group_objective_entries(
    entries: list[EntryRef] | tuple[EntryRef, ...],
    *,
    trunk_branch: str,
    is_branch_alive: Callable[[str], bool] | None = None,
) -> tuple[ObjectiveRepoEntry, ...]:
    """Group ``entries`` (already filtered to the objectives namespace) by slug.

    ``trunk_branch`` is the canonical-storage branch for this repo (typically
    ``master`` or ``main``); branches matching it are treated as canonical
    rather than as a snapshot.
    """
    by_slug: dict[str, list[EntryRef]] = {}
    for entry in entries:
        by_slug.setdefault(slug_for_key(entry.key), []).append(entry)

    result: list[ObjectiveRepoEntry] = []
    for slug in sorted(by_slug):
        slug_entries = by_slug[slug]
        canonical_present = any(e.branch == trunk_branch for e in slug_entries)
        branch_names = sorted({e.branch for e in slug_entries if e.branch != trunk_branch})
        presences = tuple(
            BranchPresence(
                branch=branch,
                deleted=is_branch_alive is not None and not is_branch_alive(branch),
            )
            for branch in branch_names
        )
        files = tuple(sorted({_filename_for_key(e.key, slug) for e in slug_entries}))
        result.append(
            ObjectiveRepoEntry(
                slug=slug,
                files=files,
                canonical_present=canonical_present,
                branches=presences,
            )
        )
    return tuple(result)


def _filename_for_key(key: str, slug: str) -> str:
    prefix = f"{slug}/"
    if key.startswith(prefix):
        return key[len(prefix) :]
    return key
