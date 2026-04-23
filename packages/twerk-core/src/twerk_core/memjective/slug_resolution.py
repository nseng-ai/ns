"""Shared slug resolver for memjective operations.

When a user omits the SLUG argument on a memjective operation we try to
auto-resolve exactly one slug from the current branch's snapshot. The rules
are shared between ``memjective show`` and ``memjective branches`` and
preserved byte-for-byte so existing scenario assertions keep passing.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import NamedTuple

from twerk_core.git.types import DetachedHead, GitCommandFailure
from twerk_core.memjective.context import MemjectiveCliContext
from twerk_core.memjective.discovery import slug_for_key
from twerk_core.memjective.gateway_access import (
    MEMJECTIVE_NAMESPACE,
    resolve_current_memjective_branch,
)


class SlugResolution(NamedTuple):
    """The normalized memjective slug plus a best-effort current branch."""

    slug: str
    current_branch: str | None


@dataclass(frozen=True)
class NoMemjectiveOnBranch:
    """No memjective snapshots are stored on ``branch``."""

    branch: str


@dataclass(frozen=True)
class AmbiguousMemjective:
    """More than one memjective slug is stored on ``branch``."""

    branch: str
    slugs: tuple[str, ...]


SlugResolutionError = NoMemjectiveOnBranch | AmbiguousMemjective | DetachedHead | GitCommandFailure


def resolve_slug(
    mctx: MemjectiveCliContext,
    requested: str | None,
) -> SlugResolution | SlugResolutionError:
    """Return a ``SlugResolution`` or a domain error.

    When ``requested`` is ``None`` we resolve the current branch and require
    exactly one memjective slug under ``refs/brmem/ns/memjectives/<branch>``.
    When ``requested`` is provided we normalize any ``<slug>/<file>``
    addressing and best-effort-resolve the current branch for downstream
    current-branch-aware reads.
    """
    if requested is None:
        match resolve_current_memjective_branch(mctx.git_gateway, None):
            case DetachedHead() | GitCommandFailure() as err:
                return err
            case str() as branch:
                pass

        branch_slugs = tuple(
            sorted(
                {
                    slug_for_key(entry.key)
                    for entry in mctx.brmem_gateway.list_entries(
                        namespace=MEMJECTIVE_NAMESPACE, branch=branch
                    )
                }
            )
        )
        if not branch_slugs:
            return NoMemjectiveOnBranch(branch=branch)
        if len(branch_slugs) > 1:
            return AmbiguousMemjective(branch=branch, slugs=branch_slugs)
        return SlugResolution(slug=branch_slugs[0], current_branch=branch)

    return SlugResolution(
        slug=slug_for_key(requested),
        current_branch=_resolve_current_branch_best_effort(mctx),
    )


def _resolve_current_branch_best_effort(mctx: MemjectiveCliContext) -> str | None:
    match resolve_current_memjective_branch(mctx.git_gateway, None):
        case DetachedHead() | GitCommandFailure():
            return None
        case str() as branch:
            return branch
