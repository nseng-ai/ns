"""``objective exec update-precheck`` — one-shot preflight for ``objective-update``.

Collapses the deterministic round-trips at the top of the
``objective-update`` skill (preflight, slug resolution, freshness probe, old
SHA capture, master..HEAD enumeration) into a single JSON envelope. The skill
keeps file content load, per-commit triage, the LLM judgment, and the
rewrite/persist steps; this operation just hands it the facts.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path
from typing import Annotated

import click

from brmem.gateway import BranchMemoryGateway
from twerk_core.clinkr.context import load_typed_context
from twerk_core.clinkr.dataclass_json import JsonSerializable
from twerk_core.clinkr.exit import ClinkrExit
from twerk_core.clinkr.operation import clinkr_operation
from twerk_core.git.git_gateway import GitGateway
from twerk_core.git.types import (
    DetachedHead,
    GitCommandFailure,
)
from twerk_core.gt.gateway import GtGateway
from twerk_core.gt.types import GtCommandFailure
from twerk_objectives.context import ObjectiveCliContext
from twerk_objectives.discovery import (
    MASTER_BRANCH,
    body_key,
    notes_key,
    roadmap_key,
    slug_for_key,
)
from twerk_objectives.exec.absorbed import (
    AbsorbedSetUnavailable,
    absorbed_patch_ids_for_branch,
)
from twerk_objectives.gateway_access import OBJECTIVE_NAMESPACE
from twerk_objectives.slug_resolution import (
    AmbiguousObjective,
    NoObjectiveOnBranch,
    SlugResolution,
    resolve_slug,
)


@dataclass(frozen=True)
class ObjectiveUpdatePrecheckRequest:
    slug: Annotated[
        str | None,
        click.Argument(["slug"], type=click.STRING, required=False, default=None),
    ] = None


@dataclass(frozen=True)
class FilePrecheck(JsonSerializable):
    """Presence + diagnostic SHAs for a single objective file."""

    key: str
    present: bool
    head_sha: str | None
    head_date: str | None
    blob_sha: str | None
    size_bytes: int | None


@dataclass(frozen=True)
class BranchCommit(JsonSerializable):
    """One ``master..HEAD`` commit, newest-first."""

    sha: str
    author_iso: str
    subject: str
    patch_id: str | None


@dataclass(frozen=True)
class ObjectiveUpdatePrecheckResult(JsonSerializable):
    slug: str
    branch: str
    body: FilePrecheck
    roadmap: FilePrecheck
    notes: FilePrecheck
    snapshot_max_head_date: str | None
    branch_commits: tuple[BranchCommit, ...]
    branch_max_author_iso: str | None
    absorbed_patch_ids: tuple[str, ...]
    in_sync: bool


@clinkr_operation(
    name="update-precheck",
    help=(
        "Emit raw preflight facts for `objective-update`. Resolves the "
        "current branch, validates the SLUG is attached, probes head SHAs for "
        "body/roadmap/notes, and lists `master..HEAD` commits — all in one "
        "round-trip. Skill consumes the JSON envelope to decide whether to "
        "skip (in_sync) or proceed to evidence triage. SLUG auto-resolves "
        "from the current branch when exactly one objective is attached."
    ),
)
def run_update_precheck_objective(
    ctx: click.Context,
    request: ObjectiveUpdatePrecheckRequest,
) -> ClinkrExit[ObjectiveUpdatePrecheckResult]:
    mctx = load_typed_context(ctx, ObjectiveCliContext)
    gateway = mctx.brmem_gateway
    git = mctx.git_gateway

    match git.get_current_branch(Path.cwd()):
        case DetachedHead():
            return ClinkrExit.failure(
                error_type="detached_head",
                message="Detached HEAD: objective-update requires a checked-out branch.",
            )
        case GitCommandFailure() as failure:
            return ClinkrExit.failure(error_type="git_failed", message=failure.message)
        case str() as current_branch:
            pass

    if current_branch == MASTER_BRANCH:
        return ClinkrExit.failure(
            error_type="on_master_branch",
            message=(
                "objective-update runs on branch snapshots only. "
                "Use objective-reconcile <slug> to update canonical state."
            ),
        )

    if request.slug is None:
        match resolve_slug(mctx, None, requested_branch=current_branch):
            case GitCommandFailure() as failure:
                return ClinkrExit.failure(error_type="git_failed", message=failure.message)
            case DetachedHead():
                return ClinkrExit.failure(
                    error_type="detached_head",
                    message="Detached HEAD: objective-update requires a checked-out branch.",
                )
            case NoObjectiveOnBranch(branch=branch):
                return ClinkrExit.failure(
                    error_type="no_objective_on_branch",
                    message=(
                        f"No objective on branch {branch!r}. "
                        f"Run `objective-claim <slug>` on this branch first."
                    ),
                )
            case AmbiguousObjective(branch=branch, slugs=slugs):
                names = ", ".join(slugs)
                return ClinkrExit.failure(
                    error_type="ambiguous_objective",
                    message=(f"Multiple objectives on branch {branch!r}: {names}. Specify a SLUG."),
                )
            case SlugResolution(slug=resolved_slug):
                slug = resolved_slug
    else:
        slug = slug_for_key(request.slug)
        branch_entries = gateway.list_entries(namespace=OBJECTIVE_NAMESPACE, branch=current_branch)
        if not any(entry.key.startswith(f"{slug}/") for entry in branch_entries):
            return ClinkrExit.failure(
                error_type="slug_not_attached",
                message=(
                    f"Objective {slug!r} is not attached to branch {current_branch!r}. "
                    f"Run `objective-claim {slug}` on this branch first."
                ),
            )

    body = _file_precheck(gateway, body_key(slug), current_branch)
    roadmap = _file_precheck(gateway, roadmap_key(slug), current_branch)
    notes = _file_precheck(gateway, notes_key(slug), current_branch)
    snapshot_max_head_date = _max_iso(
        f.head_date for f in (body, roadmap, notes) if f.head_date is not None
    )

    cwd = Path.cwd()
    trunk = _resolve_trunk(mctx.gt_gateway, cwd)

    log_result = git.log_range(f"{trunk}..HEAD")
    if isinstance(log_result, GitCommandFailure):
        return ClinkrExit.failure(error_type="git_failed", message=log_result.message)

    pid_by_sha = _pid_by_sha(git, f"{trunk}..HEAD")
    branch_commits = tuple(
        BranchCommit(
            sha=c.sha,
            author_iso=c.author_iso,
            subject=c.subject,
            patch_id=pid_by_sha.get(c.sha) if pid_by_sha is not None else None,
        )
        for c in log_result
    )
    branch_max_author_iso = _max_iso(c.author_iso for c in branch_commits)

    absorbed = absorbed_patch_ids_for_branch(git, mctx.gt_gateway, cwd, current_branch, trunk=trunk)
    if isinstance(absorbed, AbsorbedSetUnavailable) or pid_by_sha is None:
        absorbed_pids: tuple[str, ...] = ()
        in_sync = not branch_commits
    else:
        absorbed_pids = tuple(sorted(absorbed))
        if not branch_commits:
            in_sync = True
        else:
            in_sync = all(c.patch_id is not None and c.patch_id in absorbed for c in branch_commits)

    return ClinkrExit.ok(
        ObjectiveUpdatePrecheckResult(
            slug=slug,
            branch=current_branch,
            body=body,
            roadmap=roadmap,
            notes=notes,
            snapshot_max_head_date=snapshot_max_head_date,
            branch_commits=branch_commits,
            branch_max_author_iso=branch_max_author_iso,
            absorbed_patch_ids=absorbed_pids,
            in_sync=in_sync,
        )
    )


def _file_precheck(
    gateway: BranchMemoryGateway,
    key: str,
    branch: str,
) -> FilePrecheck:
    diagnostic = gateway.check(OBJECTIVE_NAMESPACE, key, branch)
    if diagnostic is None:
        return FilePrecheck(
            key=key,
            present=False,
            head_sha=None,
            head_date=None,
            blob_sha=None,
            size_bytes=None,
        )
    return FilePrecheck(
        key=key,
        present=True,
        head_sha=diagnostic.head_sha,
        head_date=diagnostic.head_date,
        blob_sha=diagnostic.blob_sha,
        size_bytes=diagnostic.size_bytes,
    )


def _max_iso(values: Iterable[str]) -> str | None:
    items = list(values)
    if not items:
        return None
    return max(items)


def _resolve_trunk(gt: GtGateway, cwd: Path) -> str:
    """Return graphite's trunk; fall back to ``MASTER_BRANCH`` on failure."""
    result = gt.trunk(cwd)
    if isinstance(result, GtCommandFailure):
        return MASTER_BRANCH
    return result


def _pid_by_sha(git: GitGateway, range_spec: str) -> dict[str, str | None] | None:
    """Map sha -> patch_id for ``range_spec``; ``None`` on git failure."""
    result = git.patch_ids_for_range(range_spec)
    if isinstance(result, GitCommandFailure):
        return None
    return {sha: pid for sha, pid in result}
