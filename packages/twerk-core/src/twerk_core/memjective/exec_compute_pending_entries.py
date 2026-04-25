"""Bucketize a memjective slug's evidence into action-oriented entries."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated, Any, Literal

import click

from twerk_core.clinkr.context import load_typed_context
from twerk_core.clinkr.exit import ClinkrExit
from twerk_core.clinkr.operation import clinkr_operation
from twerk_core.console import get_console, make_table
from twerk_core.git.types import DetachedHead, GitCommandFailure
from twerk_core.memjective.context import MemjectiveCliContext
from twerk_core.memjective.evidence import (
    BranchEvidence,
    EvidenceBundle,
    compute_evidence,
)
from twerk_core.memjective.slug_resolution import (
    AmbiguousMemjective,
    NoMemjectiveOnBranch,
    SlugResolution,
    resolve_slug,
)
from twerk_core.memjective.state import (
    STATE_BRANCH,
    STATE_NAMESPACE,
    MemjectiveState,
    StateAbsent,
    StateInvalid,
    state_key,
)


@dataclass(frozen=True)
class ExecComputePendingEntriesRequest:
    slug: Annotated[
        str | None,
        click.Argument(["slug"], type=click.STRING, required=False, default=None),
    ] = None


@dataclass(frozen=True)
class SnapshotProvenance:
    namespace: str
    branch: str
    path: str
    tree_sha: str | None


@dataclass(frozen=True)
class CandidateEntry:
    """The identity an LM should record once it incorporates a pending entry."""

    id: str
    kind: Literal["pull_request", "branch"]
    pr_number: int | None


@dataclass(frozen=True)
class PendingEntry:
    id: str
    origin: Literal["computed"]
    action: Literal["incorporate"]
    reason: str
    candidate_entry: CandidateEntry
    recommended_reads: tuple[SnapshotProvenance, ...]


@dataclass(frozen=True)
class BlockedEntry:
    id: str
    origin: Literal["computed"]
    action: Literal["decide_skip"]
    reason: str


@dataclass(frozen=True)
class IgnoredEntry:
    id: str
    origin: Literal["computed"]
    reason: str


@dataclass(frozen=True)
class ErrorItem:
    kind: str
    payload: dict[str, Any]


@dataclass(frozen=True)
class ComputePendingEntriesResult:
    slug: str
    root: SnapshotProvenance
    pending_entries: tuple[PendingEntry, ...]
    blocked_entries: tuple[BlockedEntry, ...]
    ignored_entries: tuple[IgnoredEntry, ...]
    errors: tuple[ErrorItem, ...]

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "slug": self.slug,
            "root": {
                "namespace": self.root.namespace,
                "branch": self.root.branch,
                "path": self.root.path,
                "tree_sha": self.root.tree_sha,
            },
            "pending_entries": [_pending_to_dict(p) for p in self.pending_entries],
            "blocked_entries": [
                {
                    "id": b.id,
                    "origin": b.origin,
                    "action": b.action,
                    "reason": b.reason,
                }
                for b in self.blocked_entries
            ],
            "ignored_entries": [
                {"id": i.id, "origin": i.origin, "reason": i.reason} for i in self.ignored_entries
            ],
            "errors": [{"kind": e.kind, **e.payload} for e in self.errors],
        }


def _pending_to_dict(entry: PendingEntry) -> dict[str, Any]:
    return {
        "id": entry.id,
        "origin": entry.origin,
        "action": entry.action,
        "reason": entry.reason,
        "candidate_entry": {
            "id": entry.candidate_entry.id,
            "kind": entry.candidate_entry.kind,
            "pr_number": entry.candidate_entry.pr_number,
        },
        "recommended_reads": [
            {
                "namespace": read.namespace,
                "branch": read.branch,
                "path": read.path,
                "tree_sha": read.tree_sha,
            }
            for read in entry.recommended_reads
        ],
    }


def render_compute_pending_entries(result: ComputePendingEntriesResult) -> None:
    click.echo(f"slug: {result.slug}")
    click.echo(
        f"root: {result.root.namespace}/{result.root.branch}:{result.root.path} "
        f"(tree_sha: {result.root.tree_sha or '-'})"
    )
    if result.pending_entries:
        click.echo(f"pending entries ({len(result.pending_entries)}):")
        table = make_table()
        table.add_column("ID", style="cyan", no_wrap=True)
        table.add_column("ACTION", no_wrap=True)
        table.add_column("REASON", overflow="ellipsis", ratio=1)
        for entry in result.pending_entries:
            table.add_row(entry.id, entry.action, entry.reason)
        get_console().print(table)
    else:
        click.echo("pending entries: (none)")

    if result.blocked_entries:
        click.echo(f"blocked entries ({len(result.blocked_entries)}):")
        for entry in result.blocked_entries:
            click.echo(f"  - {entry.id}: {entry.reason}")
    if result.ignored_entries:
        click.echo(f"ignored entries ({len(result.ignored_entries)}):")
        for entry in result.ignored_entries:
            click.echo(f"  - {entry.id}: {entry.reason}")
    if result.errors:
        click.echo("errors:")
        for err in result.errors:
            click.echo(f"  - {err.kind}: {err.payload}")


def _find_skipped_entry_id(
    branch: BranchEvidence,
    state: MemjectiveState | StateAbsent | StateInvalid,
) -> str | None:
    if not isinstance(state, MemjectiveState):
        return None
    matching = set(branch.matching_stored_entry_ids)
    for entry in state.entries:
        if entry.id in matching and entry.raw.get("resolution") == "skipped":
            return entry.id
    return None


@dataclass(frozen=True)
class _Buckets:
    pending: tuple[PendingEntry, ...]
    blocked: tuple[BlockedEntry, ...]
    ignored: tuple[IgnoredEntry, ...]
    errors: tuple[ErrorItem, ...]


def pending_entry_ids(bundle: EvidenceBundle) -> frozenset[str]:
    """The set of entry ids the bucketizer would surface as pending right now.

    Shared with ``exec_record_entry`` so the writer's ``no_pending_match``
    rule and this command project from the same source of truth.
    """
    return frozenset(p.id for p in _bucketize(bundle).pending)


def _bucketize(bundle: EvidenceBundle) -> _Buckets:
    pending: list[PendingEntry] = []
    blocked: list[BlockedEntry] = []
    ignored: list[IgnoredEntry] = []
    errors: list[ErrorItem] = []

    if not bundle.root.exists:
        errors.append(
            ErrorItem(
                kind="missing_root_memjective",
                payload={
                    "namespace": bundle.root.namespace,
                    "branch": bundle.root.branch,
                    "path": bundle.root.path,
                },
            )
        )

    if isinstance(bundle.state, StateInvalid):
        errors.append(
            ErrorItem(
                kind="invalid_state",
                payload={
                    "namespace": STATE_NAMESPACE,
                    "branch": STATE_BRANCH,
                    "key": state_key(bundle.slug),
                    "reason": bundle.state.reason,
                },
            )
        )

    pr_number_to_branches: dict[int, list[str]] = {}
    for branch in bundle.branches:
        if branch.pr.lookup_status == "found" and branch.pr.number is not None:
            pr_number_to_branches.setdefault(branch.pr.number, []).append(branch.source.branch)

    for branch in bundle.branches:
        _classify_branch(
            branch,
            state=bundle.state,
            pending=pending,
            blocked=blocked,
            ignored=ignored,
            errors=errors,
        )

    for pr_number in sorted(pr_number_to_branches):
        branch_names = pr_number_to_branches[pr_number]
        if len(branch_names) >= 2:
            errors.append(
                ErrorItem(
                    kind="branch_pr_identity_conflict",
                    payload={
                        "pr_number": pr_number,
                        "branches": sorted(branch_names),
                    },
                )
            )

    return _Buckets(
        pending=tuple(pending),
        blocked=tuple(blocked),
        ignored=tuple(ignored),
        errors=tuple(errors),
    )


def _classify_branch(
    branch: BranchEvidence,
    *,
    state: MemjectiveState | StateAbsent | StateInvalid,
    pending: list[PendingEntry],
    blocked: list[BlockedEntry],
    ignored: list[IgnoredEntry],
    errors: list[ErrorItem],
) -> None:
    pr = branch.pr

    if pr.lookup_status == "error":
        errors.append(
            ErrorItem(
                kind="pr_lookup_error",
                payload={
                    "branch": branch.source.branch,
                    "stderr": pr.error_stderr or "",
                },
            )
        )
        return

    if pr.lookup_status == "missing":
        ignored.append(
            IgnoredEntry(
                id=f"branch-{branch.source.branch}",
                origin="computed",
                reason="branch has no associated PR",
            )
        )
        return

    # lookup_status == "found"
    pr_number = pr.number
    pr_id = f"pr-{pr_number}" if pr_number is not None else f"branch-{branch.source.branch}"

    if pr.state == "OPEN":
        ignored.append(
            IgnoredEntry(
                id=pr_id,
                origin="computed",
                reason="PR is still open",
            )
        )
        return

    if pr.state == "MERGED":
        if branch.matching_stored_entry_ids:
            return
        if branch.source.tree_sha is None:
            errors.append(
                ErrorItem(
                    kind="missing_brmem_snapshot_for_merged_pr",
                    payload={
                        "branch": branch.source.branch,
                        "pr_number": pr_number,
                    },
                )
            )
            return
        assert pr_number is not None
        candidate = CandidateEntry(id=pr_id, kind="pull_request", pr_number=pr_number)
        provenance = SnapshotProvenance(
            namespace=branch.source.namespace,
            branch=branch.source.branch,
            path=branch.source.path,
            tree_sha=branch.source.tree_sha,
        )
        pending.append(
            PendingEntry(
                id=pr_id,
                origin="computed",
                action="incorporate",
                reason="PR merged; not yet incorporated into root snapshot",
                candidate_entry=candidate,
                recommended_reads=(provenance,),
            )
        )
        return

    if pr.state == "CLOSED":
        if _find_skipped_entry_id(branch, state) is not None:
            return
        blocked.append(
            BlockedEntry(
                id=pr_id,
                origin="computed",
                action="decide_skip",
                reason="PR closed without merging; record a 'skipped' entry to suppress",
            )
        )
        return


@clinkr_operation(
    name="compute-pending-entries",
    help=(
        "Bucketize a memjective slug's evidence into pending / blocked / ignored "
        "entries and structured errors. Read-only; the writer is `record-entry`."
    ),
    human_renderer=render_compute_pending_entries,
)
def run_exec_compute_pending_entries(
    ctx: click.Context,
    request: ExecComputePendingEntriesRequest,
) -> ClinkrExit[ComputePendingEntriesResult]:
    mctx = load_typed_context(ctx, MemjectiveCliContext)

    match resolve_slug(mctx, request.slug):
        case GitCommandFailure() as failure:
            return ClinkrExit.failure(error_type="git_failed", message=failure.message)
        case DetachedHead():
            return ClinkrExit.failure(
                error_type="detached_head",
                message="Detached HEAD: brmem requires a checked-out branch.",
            )
        case NoMemjectiveOnBranch(branch=branch):
            return ClinkrExit.failure(
                error_type="no_memjective_on_branch",
                message=f"No memjective on branch {branch!r}.",
            )
        case AmbiguousMemjective(branch=branch, slugs=slugs):
            names = ", ".join(slugs)
            return ClinkrExit.failure(
                error_type="ambiguous_memjective",
                message=f"Multiple memjectives on branch {branch!r}: {names}. Specify a SLUG.",
            )
        case SlugResolution(slug=slug):
            pass

    bundle = compute_evidence(
        slug=slug,
        brmem_gateway=mctx.brmem_gateway,
        git_gateway=mctx.git_gateway,
        pr_gateway=mctx.pr_gateway,
    )

    buckets = _bucketize(bundle)

    return ClinkrExit.ok(
        ComputePendingEntriesResult(
            slug=bundle.slug,
            root=SnapshotProvenance(
                namespace=bundle.root.namespace,
                branch=bundle.root.branch,
                path=bundle.root.path,
                tree_sha=bundle.root.tree_sha,
            ),
            pending_entries=buckets.pending,
            blocked_entries=buckets.blocked,
            ignored_entries=buckets.ignored,
            errors=buckets.errors,
        )
    )
