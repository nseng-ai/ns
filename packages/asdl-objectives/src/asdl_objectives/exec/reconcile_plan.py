"""``objective exec reconcile-plan`` — gather raw evidence for ``objective-reconcile``.

Pulls the deterministic mechanics of ``objective-reconcile`` out of skill
prose into Python: slug set resolution, canonical presence checks, branch
snapshot enumeration, PR state classification, inclusion gating, old SHA
capture, and raw Markdown retrieval. The agent then performs the
conservative semantic rewrite over the raw Markdown using
``skills/objective/references/mutation-contract.md`` and writes proposed
file rewrites to disk; ``objective exec reconcile-apply`` consumes the
resulting plan-file and performs the serial canonical writes.

The CLI does **not** parse Markdown structure, summarize prose, or extract
checkboxes. Markdown is opaque text here; the agent owns rewriting. See
"Markdown prose is not schema" in the canonicalization plan.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated, Any, Literal

import click

from asdl_core.clinkr.context import load_typed_context
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrJsonSchemaModel, ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_core.gh.pr_gateway import PRGateway
from asdl_core.gh.types import PRLookupError, PRState, PRSummary
from asdl_objectives.context import ObjectiveCliContext
from asdl_objectives.discovery import (
    BODY_FILE,
    NOTES_FILE,
    ROADMAP_FILE,
    body_key,
    notes_key,
    roadmap_key,
    slug_for_key,
)
from asdl_objectives.gateway_access import OBJECTIVE_NAMESPACE
from asdl_objectives.trunk_resolution import resolve_trunk
from brmem.gateway import BranchMemoryGateway, EntryDiagnostic

PLAN_SCHEMA = "reconcile-plan/v1"

# Reasons a branch snapshot is excluded from canonical evidence.
SkipReason = Literal["open", "closed_unmerged", "no_pr", "lookup_error"]


class ReconcilePlanRequest(ClinkrModel):
    """Optional comma-separated slug list narrowing the sweep."""

    slugs: Annotated[
        str | None,
        click.Argument(["slugs"], type=click.STRING, required=False, default=None),
    ] = None


class CanonicalFile(ClinkrModel):
    """Canonical file presence + raw Markdown + capture-time SHAs.

    Two SHAs are captured at plan time:

    - ``expected_old_blob_sha`` — the per-file content blob SHA. Apply
      verifies this still matches before overwriting; it is invariant
      under "another file in the same snapshot got rewritten", which
      matters because canonical objective files share one snapshot ref.
    - ``expected_old_head_sha`` — the snapshot commit SHA at plan time.
      Used to construct the recovery hint (``brmem get ... --at <sha>``)
      so the operator can roll back to the pre-apply state.
    """

    file: str
    key: str
    present: bool
    expected_old_blob_sha: str | None
    expected_old_head_sha: str | None
    content: str


class BranchSnapshotPr(ClinkrModel):
    number: int | None
    state: PRState | None
    title: str | None
    url: str | None
    error: str | None


class IncludedSnapshot(ClinkrModel):
    """Branch snapshot folded in as eligible (merged-PR-backed) evidence."""

    branch: str
    pr: BranchSnapshotPr
    files: tuple[CanonicalFile, ...]


class SkippedSnapshot(ClinkrModel):
    branch: str
    reason: SkipReason
    pr: BranchSnapshotPr


class SlugPlanItem(ClinkrModel):
    """Per-slug section of the reconcile plan envelope."""

    slug: str
    canonical_present: bool
    canonical_files: tuple[CanonicalFile, ...]
    included_snapshots: tuple[IncludedSnapshot, ...]
    skipped_snapshots: tuple[SkippedSnapshot, ...]
    conflicts: tuple[str, ...]
    gaps: tuple[str, ...]


class ReconcilePlanResult(ClinkrJsonSchemaModel):
    canonical_branch: str
    requested_slugs: tuple[str, ...]
    slugs: tuple[SlugPlanItem, ...]


def _slug_plan_to_json(item: SlugPlanItem) -> dict[str, Any]:
    return {
        "slug": item.slug,
        "canonical_present": item.canonical_present,
        "canonical_files": [_canonical_file_to_json(f) for f in item.canonical_files],
        "included_snapshots": [
            {
                "branch": s.branch,
                "pr": _pr_to_json(s.pr),
                "files": [_canonical_file_to_json(f) for f in s.files],
            }
            for s in item.included_snapshots
        ],
        "skipped_snapshots": [
            {
                "branch": s.branch,
                "reason": s.reason,
                "pr": _pr_to_json(s.pr),
            }
            for s in item.skipped_snapshots
        ],
        "conflicts": list(item.conflicts),
        "gaps": list(item.gaps),
    }


def _canonical_file_to_json(f: CanonicalFile) -> dict[str, Any]:
    return {
        "file": f.file,
        "key": f.key,
        "present": f.present,
        "expected_old_blob_sha": f.expected_old_blob_sha,
        "expected_old_head_sha": f.expected_old_head_sha,
        "content": f.content,
    }


def _pr_to_json(pr: BranchSnapshotPr) -> dict[str, Any]:
    return {
        "number": pr.number,
        "state": pr.state,
        "title": pr.title,
        "url": pr.url,
        "error": pr.error,
    }


def render_reconcile_plan(result: ReconcilePlanResult) -> None:
    if not result.slugs:
        click.echo(f"no canonical objectives on {result.canonical_branch}")
        return
    click.echo(f"reconcile plan ({result.json_schema}): {len(result.slugs)} slug(s)")
    for item in result.slugs:
        click.echo(f"- {item.slug}")
        if not item.canonical_present:
            click.echo("  (no canonical body — slug skipped)")
            continue
        click.echo(
            f"  canonical files: {len(item.canonical_files)}, "
            f"included snapshots: {len(item.included_snapshots)}, "
            f"skipped: {len(item.skipped_snapshots)}, "
            f"gaps: {len(item.gaps)}, conflicts: {len(item.conflicts)}"
        )


@clinkr_operation(
    name="reconcile-plan",
    help=(
        "Emit a JSON envelope of raw evidence for `objective-reconcile`. "
        "The CLI resolves the slug set (sweep by default; comma-separated "
        "list narrows), captures canonical SHAs, enumerates branch "
        "snapshots, classifies their associated PRs, and embeds the raw "
        "Markdown for canonical and merged-PR-backed snapshot files. The "
        "agent does the conservative semantic rewrite; the CLI does no "
        "Markdown parsing, summarization, or rewriting."
    ),
    human_renderer=render_reconcile_plan,
)
def run_reconcile_plan_objective(
    ctx: click.Context,
    request: ReconcilePlanRequest,
) -> ClinkrExit[ReconcilePlanResult]:
    mctx = load_typed_context(ctx, ObjectiveCliContext)
    return ClinkrExit.ok(build_reconcile_plan(mctx, request.slugs))


def build_reconcile_plan(
    mctx: ObjectiveCliContext,
    raw_slugs: str | None,
) -> ReconcilePlanResult:
    gateway = mctx.brmem_gateway
    pr_gateway = mctx.pr_gateway
    trunk = resolve_trunk(mctx.git_gateway).trunk

    requested_slugs = _parse_slug_argument(raw_slugs)

    all_entries = gateway.list_entries(namespace=OBJECTIVE_NAMESPACE)
    canonical_slugs = sorted({slug_for_key(e.key) for e in all_entries if e.branch == trunk})

    if requested_slugs is None:
        target_slugs = tuple(canonical_slugs)
    else:
        target_slugs = requested_slugs

    if not target_slugs:
        return ReconcilePlanResult(
            json_schema=PLAN_SCHEMA,
            canonical_branch=trunk,
            requested_slugs=requested_slugs or (),
            slugs=(),
        )

    canonical_set = set(canonical_slugs)
    items: list[SlugPlanItem] = []
    for slug in target_slugs:
        items.append(
            _build_slug_plan(
                gateway=gateway,
                pr_gateway=pr_gateway,
                slug=slug,
                canonical_set=canonical_set,
                all_entries_keys=all_entries,
                trunk=trunk,
            )
        )

    return ReconcilePlanResult(
        json_schema=PLAN_SCHEMA,
        canonical_branch=trunk,
        requested_slugs=requested_slugs or (),
        slugs=tuple(items),
    )


def _parse_slug_argument(raw: str | None) -> tuple[str, ...] | None:
    """Return ``None`` for sweep-by-default, else deduplicated requested slugs.

    The order of the operator-supplied slugs is preserved (stable). Empty
    entries (e.g. trailing commas) are dropped.
    """
    if raw is None:
        return None
    seen: set[str] = set()
    ordered: list[str] = []
    for raw_slug in raw.split(","):
        slug = raw_slug.strip()
        if not slug:
            continue
        normalized = slug_for_key(slug)
        if normalized in seen:
            continue
        seen.add(normalized)
        ordered.append(normalized)
    return tuple(ordered)


def _build_slug_plan(
    *,
    gateway: BranchMemoryGateway,
    pr_gateway: PRGateway,
    slug: str,
    canonical_set: set[str],
    all_entries_keys: list[Any],
    trunk: str,
) -> SlugPlanItem:
    if slug not in canonical_set:
        # Operator-supplied unknown slug — record gap, emit nothing else.
        return SlugPlanItem(
            slug=slug,
            canonical_present=False,
            canonical_files=(),
            included_snapshots=(),
            skipped_snapshots=(),
            conflicts=(),
            gaps=(
                f"slug {slug!r} requested but no canonical body.md on "
                f"{trunk}; use objective-create first",
            ),
        )

    canonical_files = _read_canonical_files(gateway, slug, trunk=trunk)
    body_present = any(f.file == BODY_FILE and f.present for f in canonical_files)

    conflicts: list[str] = []
    gaps: list[str] = []
    if not body_present:
        # Sweep enumeration anomaly: slug appeared in the canonical set but
        # body.md is gone. Surface as a conflict and skip evidence-gathering.
        conflicts.append(f"canonical body.md missing for slug {slug!r} on {trunk}")
        return SlugPlanItem(
            slug=slug,
            canonical_present=True,
            canonical_files=canonical_files,
            included_snapshots=(),
            skipped_snapshots=(),
            conflicts=tuple(conflicts),
            gaps=tuple(gaps),
        )

    branch_names = sorted(
        {
            entry.branch
            for entry in all_entries_keys
            if entry.branch != trunk and slug_for_key(entry.key) == slug
        }
    )

    included: list[IncludedSnapshot] = []
    skipped: list[SkippedSnapshot] = []
    for branch in branch_names:
        snap = _classify_snapshot(
            gateway=gateway,
            pr_gateway=pr_gateway,
            slug=slug,
            branch=branch,
        )
        if snap.included is not None:
            included.append(snap.included)
        else:
            assert snap.skipped is not None
            skipped.append(snap.skipped)

    if not included:
        gaps.append(f"no merged PR-backed branch snapshots carry slug {slug!r}")

    return SlugPlanItem(
        slug=slug,
        canonical_present=True,
        canonical_files=canonical_files,
        included_snapshots=tuple(included),
        skipped_snapshots=tuple(skipped),
        conflicts=tuple(conflicts),
        gaps=tuple(gaps),
    )


def _read_canonical_files(
    gateway: BranchMemoryGateway,
    slug: str,
    *,
    trunk: str,
) -> tuple[CanonicalFile, ...]:
    """Read raw Markdown + capture SHA for every canonical file under ``slug``.

    Always emits one ``CanonicalFile`` per content file (body, roadmap, notes)
    so apply can iterate by file in a stable order. Missing files surface as
    ``present=False`` with empty content and ``expected_old_sha=None``.
    """
    files: list[CanonicalFile] = []
    for filename, key in (
        (BODY_FILE, body_key(slug)),
        (ROADMAP_FILE, roadmap_key(slug)),
        (NOTES_FILE, notes_key(slug)),
    ):
        diagnostic = gateway.check(OBJECTIVE_NAMESPACE, key, trunk)
        if diagnostic is None:
            files.append(
                CanonicalFile(
                    file=filename,
                    key=key,
                    present=False,
                    expected_old_blob_sha=None,
                    expected_old_head_sha=None,
                    content="",
                )
            )
            continue
        content = gateway.get(OBJECTIVE_NAMESPACE, key, trunk) or ""
        files.append(
            CanonicalFile(
                file=filename,
                key=key,
                present=True,
                expected_old_blob_sha=diagnostic.blob_sha,
                expected_old_head_sha=diagnostic.head_sha,
                content=content,
            )
        )
    return tuple(files)


@dataclass(frozen=True)
class _SnapshotClassification:
    included: IncludedSnapshot | None
    skipped: SkippedSnapshot | None


def _classify_snapshot(
    *,
    gateway: BranchMemoryGateway,
    pr_gateway: PRGateway,
    slug: str,
    branch: str,
) -> _SnapshotClassification:
    """Classify one branch snapshot via its associated PR.

    Inclusion rule (locked by spec): only branches whose PR is ``MERGED`` are
    eligible evidence. ``OPEN``, ``CLOSED`` (unmerged), no-PR, and PR-lookup-
    error snapshots are skipped with a stable reason.
    """
    pr_result = pr_gateway.get_pr_for_branch(branch)
    if isinstance(pr_result, PRLookupError):
        if pr_result.returncode == 1:
            # Standard "no PR found" exit code: classify as no_pr, not error.
            return _SnapshotClassification(
                included=None,
                skipped=SkippedSnapshot(
                    branch=branch,
                    reason="no_pr",
                    pr=BranchSnapshotPr(
                        number=None,
                        state=None,
                        title=None,
                        url=None,
                        error=None,
                    ),
                ),
            )
        return _SnapshotClassification(
            included=None,
            skipped=SkippedSnapshot(
                branch=branch,
                reason="lookup_error",
                pr=BranchSnapshotPr(
                    number=None,
                    state=None,
                    title=None,
                    url=None,
                    error=pr_result.stderr or None,
                ),
            ),
        )

    pr_meta = _summary_to_branch_pr(pr_result)
    if pr_result.state == "MERGED":
        files = _read_branch_files(gateway, slug, branch)
        return _SnapshotClassification(
            included=IncludedSnapshot(branch=branch, pr=pr_meta, files=files),
            skipped=None,
        )

    skip_reason: SkipReason = "open" if pr_result.state == "OPEN" else "closed_unmerged"
    return _SnapshotClassification(
        included=None,
        skipped=SkippedSnapshot(branch=branch, reason=skip_reason, pr=pr_meta),
    )


def _summary_to_branch_pr(pr: PRSummary) -> BranchSnapshotPr:
    return BranchSnapshotPr(
        number=pr.number,
        state=pr.state,
        title=pr.title,
        url=pr.url,
        error=None,
    )


def _read_branch_files(
    gateway: BranchMemoryGateway,
    slug: str,
    branch: str,
) -> tuple[CanonicalFile, ...]:
    """Read raw Markdown for every file present on a branch snapshot.

    Branch SHAs are recorded informationally on the included snapshot but
    never used for the canonical pre-write check — only the canonical
    file's ``expected_old_blob_sha`` gates the write in apply.
    """
    files: list[CanonicalFile] = []
    for filename, key in (
        (BODY_FILE, body_key(slug)),
        (ROADMAP_FILE, roadmap_key(slug)),
        (NOTES_FILE, notes_key(slug)),
    ):
        diagnostic: EntryDiagnostic | None = gateway.check(OBJECTIVE_NAMESPACE, key, branch)
        if diagnostic is None:
            continue
        content = gateway.get(OBJECTIVE_NAMESPACE, key, branch) or ""
        files.append(
            CanonicalFile(
                file=filename,
                key=key,
                present=True,
                expected_old_blob_sha=diagnostic.blob_sha,
                expected_old_head_sha=diagnostic.head_sha,
                content=content,
            )
        )
    return tuple(files)
