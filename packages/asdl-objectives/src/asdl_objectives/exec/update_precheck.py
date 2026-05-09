"""``objective exec update-precheck`` — one-shot preflight for ``objective-update``.

Collapses the deterministic round-trips at the top of the
``objective-update`` skill (preflight, slug resolution, freshness probe, old
SHA capture, trunk..HEAD enumeration) into a single JSON envelope. The skill
keeps file content load, per-commit triage, the LLM judgment, and the
rewrite/persist steps; this operation just hands it the facts.
"""

from __future__ import annotations

from pathlib import Path
from typing import Annotated

import click

from asdl_core.clinkr.context import load_typed_context
from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.failure import ClinkrFailure
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_core.git.types import DetachedHead, GitCommandFailure
from asdl_objectives.absorbed_marker import load_absorbed_marker
from asdl_objectives.context import ObjectiveCliContext
from asdl_objectives.discovery import (
    body_key,
    notes_key,
    roadmap_key,
    slug_for_key,
)
from asdl_objectives.freshness import (
    ObjectiveSnapshotState,
    classify_obj_state,
)
from asdl_objectives.gateway_access import OBJECTIVE_NAMESPACE
from asdl_objectives.patch_facts import load_branch_patch_facts
from asdl_objectives.slug_resolution import (
    AmbiguousObjective,
    NoObjectiveOnBranch,
    SlugResolution,
    resolve_slug,
)
from asdl_objectives.trunk_resolution import resolve_trunk
from brmem.gateway import BranchMemoryGateway


class ObjectiveUpdatePrecheckRequest(ClinkrModel):
    slug: Annotated[
        str | None,
        click.Argument(["slug"], type=click.STRING, required=False, default=None),
    ] = None


class FilePrecheck(ClinkrModel):
    """Presence + diagnostic SHAs for a single objective file."""

    key: str
    present: bool
    head_sha: str | None
    head_date: str | None
    blob_sha: str | None
    size_bytes: int | None


class BranchCommit(ClinkrModel):
    """One ``trunk..HEAD`` commit, newest-first."""

    sha: str
    author_iso: str
    subject: str
    patch_id: str | None


class ObjectiveUpdatePrecheckResult(ClinkrModel):
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

    current_branch_result = git.get_current_branch(Path.cwd())
    match current_branch_result:
        case GitCommandFailure() as failure:
            raise ClinkrFailure(error_type="git_failed", message=failure.message)
        case DetachedHead():
            raise ClinkrFailure(
                error_type="detached_head",
                message="Detached HEAD: objective-update requires a checked-out branch.",
            )
        case str() as current_branch:
            pass

    Ensure.true(
        current_branch != git.get_trunk_branch(),
        error_type="on_trunk_branch",
        message=(
            "objective-update runs on branch snapshots only. "
            "Use objective-reconcile <slug> to update canonical state."
        ),
    )

    head_result = Ensure.ideal_state(git.branch_head_oid(current_branch))

    if request.slug is None:
        slug_result = resolve_slug(mctx, None, requested_branch=current_branch)
        match slug_result:
            case GitCommandFailure() as failure:
                raise ClinkrFailure(error_type="git_failed", message=failure.message)
            case DetachedHead():
                raise ClinkrFailure(
                    error_type="detached_head",
                    message="Detached HEAD: objective-update requires a checked-out branch.",
                )
            case NoObjectiveOnBranch() as missing:
                raise ClinkrFailure(
                    error_type="no_objective_on_branch",
                    message=(
                        f"No objective on branch {missing.branch!r}. "
                        "Run `objective-attach <slug>` on this branch first."
                    ),
                )
            case AmbiguousObjective() as ambiguity:
                names = ", ".join(ambiguity.slugs)
                raise ClinkrFailure(
                    error_type="ambiguous_objective",
                    message=(
                        f"Multiple objectives on branch {ambiguity.branch!r}: {names}. "
                        "Specify a SLUG."
                    ),
                )
            case SlugResolution() as resolution:
                slug = resolution.slug
    else:
        slug = slug_for_key(request.slug)
        branch_entries = gateway.list_entries(namespace=OBJECTIVE_NAMESPACE, branch=current_branch)
        Ensure.truthy(
            [e for e in branch_entries if e.key.startswith(f"{slug}/")],
            error_type="slug_not_attached",
            message=(
                f"Objective {slug!r} is not attached to branch {current_branch!r}. "
                f"Run `objective-attach {slug}` on this branch first."
            ),
        )

    body = _file_precheck(gateway, body_key(slug), current_branch)
    roadmap = _file_precheck(gateway, roadmap_key(slug), current_branch)
    notes = _file_precheck(gateway, notes_key(slug), current_branch)

    trunk = resolve_trunk(git).trunk

    facts = Ensure.ideal_state(
        load_branch_patch_facts(git, f"{trunk}..HEAD", require_patch_ids=False)
    )
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
