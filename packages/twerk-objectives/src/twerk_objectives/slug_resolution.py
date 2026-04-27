"""Shared slug resolver for objective operations.

When a user omits the SLUG argument on a objective operation we try to
auto-resolve exactly one slug from the current branch's snapshot. The rules
are shared between ``objective show`` and ``objective branches`` and
preserved byte-for-byte so existing scenario assertions keep passing.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import NamedTuple

from twerk_core.git.types import DetachedHead, GitCommandFailure
from twerk_objectives.context import ObjectiveCliContext
from twerk_objectives.discovery import slug_for_key
from twerk_objectives.gateway_access import (
    OBJECTIVE_NAMESPACE,
    resolve_current_objective_branch,
)


class SlugResolution(NamedTuple):
    """The normalized objective slug plus a best-effort current branch."""

    slug: str
    current_branch: str | None


@dataclass(frozen=True)
class NoObjectiveOnBranch:
    """No objective snapshots are stored on ``branch``."""

    branch: str


@dataclass(frozen=True)
class AmbiguousObjective:
    """More than one objective slug is stored on ``branch``."""

    branch: str
    slugs: tuple[str, ...]


SlugResolutionError = NoObjectiveOnBranch | AmbiguousObjective | DetachedHead | GitCommandFailure


def resolve_slug(
    mctx: ObjectiveCliContext,
    requested: str | None,
    *,
    requested_branch: str | None = None,
) -> SlugResolution | SlugResolutionError:
    """Return a ``SlugResolution`` or a domain error.

    When ``requested`` is ``None`` we resolve a branch and require exactly
    one objective slug under ``refs/brmem/ns/objectives/<branch>``. The
    branch defaults to the current HEAD; passing ``requested_branch``
    overrides that and resolves from the named branch instead, so callers
    can drive ``objective show --branch <name>`` from any working branch.

    When ``requested`` is provided we normalize any ``<slug>/<file>``
    addressing and best-effort-resolve the current branch for downstream
    current-branch-aware reads. ``requested_branch`` is ignored in this
    path; callers who need branch-strict file reads should consume it
    directly.
    """
    if requested is None:
        if requested_branch is None:
            match resolve_current_objective_branch(mctx.git_gateway, None):
                case DetachedHead() | GitCommandFailure() as err:
                    return err
                case str() as branch:
                    pass
        else:
            branch = requested_branch

        branch_slugs = tuple(
            sorted(
                {
                    slug_for_key(entry.key)
                    for entry in mctx.brmem_gateway.list_entries(
                        namespace=OBJECTIVE_NAMESPACE, branch=branch
                    )
                }
            )
        )
        if not branch_slugs:
            return NoObjectiveOnBranch(branch=branch)
        if len(branch_slugs) > 1:
            return AmbiguousObjective(branch=branch, slugs=branch_slugs)
        return SlugResolution(slug=branch_slugs[0], current_branch=branch)

    return SlugResolution(
        slug=slug_for_key(requested),
        current_branch=_resolve_current_branch_best_effort(mctx),
    )


def _resolve_current_branch_best_effort(mctx: ObjectiveCliContext) -> str | None:
    match resolve_current_objective_branch(mctx.git_gateway, None):
        case DetachedHead() | GitCommandFailure():
            return None
        case str() as branch:
            return branch
