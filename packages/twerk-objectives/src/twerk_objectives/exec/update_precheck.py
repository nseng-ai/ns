"""``objective exec update-precheck`` — one-shot preflight for ``objective-update``.

Collapses the deterministic round-trips at the top of the
``objective-update`` skill (preflight, slug resolution, freshness probe, old
SHA capture, trunk..HEAD enumeration) into a single JSON envelope. The skill
keeps file content load, per-commit triage, the LLM judgment, and the
rewrite/persist steps; this operation just hands it the facts.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Annotated

import click

from brmem.gateway import BranchMemoryGateway
from twerk_core.clinkr.context import load_typed_context
from twerk_core.clinkr.dataclass_json import JsonSerializable
from twerk_core.clinkr.exit import ClinkrExit
from twerk_core.clinkr.operation import clinkr_operation
from twerk_core.git.types import (
    DetachedHead,
    GitCommandFailure,
)
from twerk_objectives.absorbed_marker import load_absorbed_marker
from twerk_objectives.context import ObjectiveCliContext
from twerk_objectives.discovery import (
    MASTER_BRANCH,
    body_key,
    notes_key,
    roadmap_key,
    slug_for_key,
)
from twerk_objectives.freshness import (
    ObjectiveSnapshotState,
    classify_obj_state,
)
from twerk_objectives.gateway_access import OBJECTIVE_NAMESPACE
from twerk_objectives.patch_facts import load_branch_patch_facts
from twerk_objectives.slug_resolution import (
    AmbiguousObjective,
    NoObjectiveOnBranch,
    SlugResolution,
    resolve_slug,
)
from twerk_objectives.trunk_resolution import resolve_trunk


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
    """One ``trunk..HEAD`` commit, newest-first."""

    sha: str
    author_iso: str
    subject: str
    patch_id: str | None


@dataclass(frozen=True)
class ObjectiveUpdatePrecheckResult(JsonSerializable):
    slug: str
    branch: str
    branch_head_sha: str
    body: FilePrecheck
    roadmap: FilePrecheck
    notes: FilePrecheck
    branch_commits: tuple[BranchCommit, ...]
    snapshot_absorbed_patch_ids: tuple[str, ...]
    absorbed_marker_diagnostics: tuple[str, ...]
    absorbed_patch_ids: tuple[str, ...]
    freshness: ObjectiveSnapshotState
    in_sync: bool


@clinkr_operation(
    name="update-precheck",
    help=(
        "Emit raw preflight facts for `objective-update`. Resolves the "
        "current branch, validates the SLUG is attached, probes head SHAs for "
        "body/roadmap/notes, and lists `trunk..HEAD` commits — all in one "
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

    head_result = git.branch_head_oid(current_branch)
    if isinstance(head_result, GitCommandFailure):
        return ClinkrExit.failure(error_type="git_failed", message=head_result.message)

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

    trunk = resolve_trunk(git).trunk

    facts = load_branch_patch_facts(git, f"{trunk}..HEAD", require_patch_ids=False)
    if isinstance(facts, GitCommandFailure):
        return ClinkrExit.failure(error_type="git_failed", message=facts.message)
    pid_by_sha = facts.pid_by_sha
    branch_commits = tuple(
        BranchCommit(
            sha=c.sha,
            author_iso=c.author_iso,
            subject=c.subject,
            patch_id=pid_by_sha.get(c.sha) if pid_by_sha is not None else None,
        )
        for c in facts.commits
    )

    marker = load_absorbed_marker(gateway, slug=slug, branch=current_branch)
    effective_pids = marker.patch_ids if marker.ok else None
    freshness = classify_obj_state(
        alive=True,
        branch_commit_pids=facts.commit_patch_ids,
        absorbed_pids=effective_pids,
    )
    absorbed_pids = tuple(sorted(effective_pids or ()))
    in_sync = freshness == "fresh"

    return ClinkrExit.ok(
        ObjectiveUpdatePrecheckResult(
            slug=slug,
            branch=current_branch,
            branch_head_sha=head_result,
            body=body,
            roadmap=roadmap,
            notes=notes,
            branch_commits=branch_commits,
            snapshot_absorbed_patch_ids=tuple(sorted(marker.patch_ids)),
            absorbed_marker_diagnostics=tuple(
                f"line {d.line}: {d.message}" for d in marker.diagnostics
            ),
            absorbed_patch_ids=absorbed_pids,
            freshness=freshness,
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
