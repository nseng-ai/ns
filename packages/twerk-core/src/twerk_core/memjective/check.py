"""Emit fact-bundle evidence for a memjective slug for downstream LM analysis."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated, Any, Literal

import click

from twerk_core.clinkr.context import load_typed_context
from twerk_core.clinkr.exit import ClinkrExit
from twerk_core.clinkr.operation import clinkr_operation
from twerk_core.console import get_console, make_table
from twerk_core.gh.types import PRState
from twerk_core.git.types import DetachedHead, GitCommandFailure
from twerk_core.memjective.context import MemjectiveCliContext
from twerk_core.memjective.evidence import (
    BranchEvidence,
    BranchIncorporationState,
    EvidenceBundle,
    RootEvidence,
    classify_branch_incorporation_state,
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
class MemjectiveCheckRequest:
    slug: Annotated[
        str | None,
        click.Argument(["slug"], type=click.STRING, required=False, default=None),
    ] = None


@dataclass(frozen=True)
class CheckRoot:
    namespace: str
    branch: str
    path: str
    exists: bool
    tree_sha: str | None


@dataclass(frozen=True)
class CheckStateView:
    namespace: str
    branch: str
    key: str
    status: Literal["absent", "loaded", "invalid"]
    error: str | None
    entries: tuple[dict[str, Any], ...]


@dataclass(frozen=True)
class CheckSource:
    namespace: str
    branch: str
    path: str
    stale: bool
    tree_sha: str | None


@dataclass(frozen=True)
class CheckPR:
    lookup_status: Literal["found", "missing", "error"]
    number: int | None
    state: PRState | None
    title: str | None
    url: str | None
    head_ref_name: str | None
    base_ref_name: str | None
    merged_at: str | None
    merge_commit_oid: str | None
    error_stderr: str | None


@dataclass(frozen=True)
class CheckBranch:
    source: CheckSource
    pr: CheckPR
    matching_stored_entry_ids: tuple[str, ...]
    incorporation_state: BranchIncorporationState


@dataclass(frozen=True)
class CheckDiagnostic:
    kind: str
    payload: dict[str, Any]


@dataclass(frozen=True)
class CheckSummary:
    open: int
    tracked: int
    merged_pending_incorporation: int
    merged_incorporated: int
    closed_needs_decision: int
    closed_skipped: int
    lookup_error: int


@dataclass(frozen=True)
class CheckNextStep:
    command: str
    reason: str


@dataclass(frozen=True)
class MemjectiveCheckResult:
    slug: str
    root: CheckRoot
    state: CheckStateView
    branches: tuple[CheckBranch, ...]
    diagnostics: tuple[CheckDiagnostic, ...]
    summary: CheckSummary
    next_steps: tuple[CheckNextStep, ...]

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "slug": self.slug,
            "root": {
                "namespace": self.root.namespace,
                "branch": self.root.branch,
                "path": self.root.path,
                "exists": self.root.exists,
                "tree_sha": self.root.tree_sha,
            },
            "state": {
                "namespace": self.state.namespace,
                "branch": self.state.branch,
                "key": self.state.key,
                "status": self.state.status,
                "error": self.state.error,
                "entries": [dict(entry) for entry in self.state.entries],
            },
            "branches": [
                {
                    "source": {
                        "namespace": branch.source.namespace,
                        "branch": branch.source.branch,
                        "path": branch.source.path,
                        "stale": branch.source.stale,
                        "tree_sha": branch.source.tree_sha,
                    },
                    "pr": {
                        "lookup_status": branch.pr.lookup_status,
                        "number": branch.pr.number,
                        "state": branch.pr.state,
                        "title": branch.pr.title,
                        "url": branch.pr.url,
                        "head_ref_name": branch.pr.head_ref_name,
                        "base_ref_name": branch.pr.base_ref_name,
                        "merged_at": branch.pr.merged_at,
                        "merge_commit_oid": branch.pr.merge_commit_oid,
                        "error_stderr": branch.pr.error_stderr,
                    },
                    "matching_stored_entry_ids": list(branch.matching_stored_entry_ids),
                    "incorporation_state": branch.incorporation_state,
                }
                for branch in self.branches
            ],
            "diagnostics": [{"kind": d.kind, **d.payload} for d in self.diagnostics],
            "summary": {
                "open": self.summary.open,
                "tracked": self.summary.tracked,
                "merged_pending_incorporation": self.summary.merged_pending_incorporation,
                "merged_incorporated": self.summary.merged_incorporated,
                "closed_needs_decision": self.summary.closed_needs_decision,
                "closed_skipped": self.summary.closed_skipped,
                "lookup_error": self.summary.lookup_error,
            },
            "next_steps": [
                {"command": step.command, "reason": step.reason} for step in self.next_steps
            ],
        }


def _adapt_root(root: RootEvidence) -> CheckRoot:
    return CheckRoot(
        namespace=root.namespace,
        branch=root.branch,
        path=root.path,
        exists=root.exists,
        tree_sha=root.tree_sha,
    )


def _adapt_branch(
    branch: BranchEvidence,
    state: MemjectiveState | StateAbsent | StateInvalid,
) -> CheckBranch:
    source = CheckSource(
        namespace=branch.source.namespace,
        branch=branch.source.branch,
        path=branch.source.path,
        stale=branch.source.stale,
        tree_sha=branch.source.tree_sha,
    )
    pr = CheckPR(
        lookup_status=branch.pr.lookup_status,
        number=branch.pr.number,
        state=branch.pr.state,
        title=branch.pr.title,
        url=branch.pr.url,
        head_ref_name=branch.pr.head_ref_name,
        base_ref_name=branch.pr.base_ref_name,
        merged_at=branch.pr.merged_at,
        merge_commit_oid=branch.pr.merge_commit_oid,
        error_stderr=branch.pr.error_stderr,
    )
    return CheckBranch(
        source=source,
        pr=pr,
        matching_stored_entry_ids=branch.matching_stored_entry_ids,
        incorporation_state=classify_branch_incorporation_state(branch, state),
    )


def _build_summary(branches: tuple[CheckBranch, ...]) -> CheckSummary:
    counts: dict[BranchIncorporationState, int] = {
        "open": 0,
        "tracked": 0,
        "merged_pending_incorporation": 0,
        "merged_incorporated": 0,
        "closed_needs_decision": 0,
        "closed_skipped": 0,
        "lookup_error": 0,
    }
    for branch in branches:
        counts[branch.incorporation_state] += 1
    return CheckSummary(
        open=counts["open"],
        tracked=counts["tracked"],
        merged_pending_incorporation=counts["merged_pending_incorporation"],
        merged_incorporated=counts["merged_incorporated"],
        closed_needs_decision=counts["closed_needs_decision"],
        closed_skipped=counts["closed_skipped"],
        lookup_error=counts["lookup_error"],
    )


def _build_next_steps(
    *,
    slug: str,
    state: MemjectiveState | StateAbsent | StateInvalid,
    summary: CheckSummary,
) -> tuple[CheckNextStep, ...]:
    steps: list[CheckNextStep] = []

    # 1. State absent or invalid → seed the state file; skip pending/decision hints.
    if isinstance(state, StateAbsent):
        steps.append(
            CheckNextStep(
                command=f"memjective exec init {slug}",
                reason="No machine-readable state recorded yet",
            )
        )
        if summary.lookup_error > 0:
            steps.append(_lookup_error_step(slug=slug, count=summary.lookup_error))
        return tuple(steps)
    if isinstance(state, StateInvalid):
        steps.append(
            CheckNextStep(
                command=f"memjective exec init {slug}",
                reason=f"State file is invalid: {state.reason}",
            )
        )
        if summary.lookup_error > 0:
            steps.append(_lookup_error_step(slug=slug, count=summary.lookup_error))
        return tuple(steps)

    # 2. merged_pending_incorporation > 0 → reconcile.
    if summary.merged_pending_incorporation > 0:
        steps.append(
            CheckNextStep(
                command=f"dev-memjective-reconcile {slug}",
                reason=(
                    f"{summary.merged_pending_incorporation} merged "
                    f"{'PR is' if summary.merged_pending_incorporation == 1 else 'PRs are'} "
                    f"not yet incorporated into root docs"
                ),
            )
        )

    # 3. closed_needs_decision > 0 → compute-pending-entries (coalesces with #2).
    needs_pending_lookup = (
        summary.merged_pending_incorporation > 0 or summary.closed_needs_decision > 0
    )
    if needs_pending_lookup:
        if summary.closed_needs_decision > 0:
            reason = (
                f"{summary.closed_needs_decision} closed-unmerged "
                f"{'PR needs' if summary.closed_needs_decision == 1 else 'PRs need'} "
                f"a skip decision"
            )
        else:
            reason = "Inspect pending entries for scripting / LM consumption"
        steps.append(
            CheckNextStep(
                command=f"memjective exec compute-pending-entries {slug} --format json",
                reason=reason,
            )
        )

    # 4. lookup_error > 0 → user-action hint (no command target).
    if summary.lookup_error > 0:
        steps.append(_lookup_error_step(slug=slug, count=summary.lookup_error))

    return tuple(steps)


def _lookup_error_step(*, slug: str, count: int) -> CheckNextStep:
    return CheckNextStep(
        command=f"memjective check {slug}",
        reason=(
            f"Resolve gh authentication and rerun ({count} "
            f"{'branch' if count == 1 else 'branches'} hit a PR lookup error)"
        ),
    )


def _build_state_view(
    slug: str,
    state: MemjectiveState | StateAbsent | StateInvalid,
) -> CheckStateView:
    key = state_key(slug)
    match state:
        case StateAbsent():
            return CheckStateView(
                namespace=STATE_NAMESPACE,
                branch=STATE_BRANCH,
                key=key,
                status="absent",
                error=None,
                entries=(),
            )
        case StateInvalid(reason=reason):
            return CheckStateView(
                namespace=STATE_NAMESPACE,
                branch=STATE_BRANCH,
                key=key,
                status="invalid",
                error=reason,
                entries=(),
            )
        case MemjectiveState(entries=entries):
            return CheckStateView(
                namespace=STATE_NAMESPACE,
                branch=STATE_BRANCH,
                key=key,
                status="loaded",
                error=None,
                entries=tuple(entry.raw for entry in entries),
            )


def _build_diagnostics(
    *,
    slug: str,
    root: CheckRoot,
    state: MemjectiveState | StateAbsent | StateInvalid,
    branches: tuple[CheckBranch, ...],
) -> tuple[CheckDiagnostic, ...]:
    diagnostics: list[CheckDiagnostic] = []

    if not root.exists:
        diagnostics.append(
            CheckDiagnostic(
                kind="missing_root_memjective",
                payload={
                    "namespace": root.namespace,
                    "branch": root.branch,
                    "path": slug,
                },
            )
        )

    if isinstance(state, StateInvalid):
        diagnostics.append(
            CheckDiagnostic(
                kind="invalid_state",
                payload={
                    "namespace": STATE_NAMESPACE,
                    "branch": STATE_BRANCH,
                    "key": state_key(slug),
                    "reason": state.reason,
                },
            )
        )

    for branch in branches:
        if branch.pr.lookup_status == "error":
            diagnostics.append(
                CheckDiagnostic(
                    kind="pr_lookup_error",
                    payload={
                        "branch": branch.source.branch,
                        "stderr": branch.pr.error_stderr or "",
                    },
                )
            )

    if isinstance(state, MemjectiveState):
        matched_ids: set[str] = set()
        for branch in branches:
            matched_ids.update(branch.matching_stored_entry_ids)
        for entry in state.entries:
            if entry.id not in matched_ids:
                diagnostics.append(
                    CheckDiagnostic(
                        kind="stored_entry_without_visible_source",
                        payload={"entry_id": entry.id},
                    )
                )

    pr_number_branches: dict[int, list[str]] = {}
    for branch in branches:
        if branch.pr.lookup_status == "found" and branch.pr.number is not None:
            pr_number_branches.setdefault(branch.pr.number, []).append(branch.source.branch)
    for pr_number in sorted(pr_number_branches):
        branch_names = pr_number_branches[pr_number]
        if len(branch_names) >= 2:
            diagnostics.append(
                CheckDiagnostic(
                    kind="branch_pr_identity_conflict",
                    payload={
                        "pr_number": pr_number,
                        "branches": sorted(branch_names),
                    },
                )
            )

    return tuple(diagnostics)


def _summarize_diagnostic(d: CheckDiagnostic) -> str:
    match d.kind:
        case "missing_root_memjective":
            return f"missing root memjective at memjectives/master:{d.payload['path']}"
        case "invalid_state":
            return f"state.json invalid: {d.payload['reason']}"
        case "pr_lookup_error":
            return f"gh error on {d.payload['branch']}: {d.payload['stderr']}"
        case "stored_entry_without_visible_source":
            return f"stored entry {d.payload['entry_id']} has no visible source"
        case "branch_pr_identity_conflict":
            joined = ", ".join(d.payload["branches"])
            return f"PR #{d.payload['pr_number']} claimed by branches: {joined}"
    return d.kind


_INCORPORATION_LABELS: dict[BranchIncorporationState, str] = {
    "open": "open",
    "tracked": "tracked",
    "merged_pending_incorporation": "merged-pending",
    "merged_incorporated": "merged-done",
    "closed_needs_decision": "closed-todo",
    "closed_skipped": "closed-skipped",
    "lookup_error": "lookup-error",
}


def _summary_line(summary: CheckSummary) -> str:
    parts: list[tuple[str, int]] = [
        ("open", summary.open),
        ("tracked", summary.tracked),
        ("merged-pending", summary.merged_pending_incorporation),
        ("merged-done", summary.merged_incorporated),
        ("closed-todo", summary.closed_needs_decision),
        ("closed-skipped", summary.closed_skipped),
        ("lookup-error", summary.lookup_error),
    ]
    rendered = [f"{count} {label}" for label, count in parts if count > 0]
    if not rendered:
        return "summary: (no branches)"
    return "summary: " + ", ".join(rendered)


def render_memjective_check(result: MemjectiveCheckResult) -> None:
    click.echo(f"slug: {result.slug}")
    root_status = "exists" if result.root.exists else "missing"
    click.echo(
        f"root: {result.root.namespace}/{result.root.branch}:{result.root.path} ({root_status})"
    )
    state_line = (
        f"state: {result.state.namespace}/{result.state.branch}:{result.state.key} "
        f"({result.state.status}"
    )
    if result.state.error is not None:
        state_line += f", error: {result.state.error}"
    state_line += ")"
    click.echo(state_line)
    click.echo(f"stored entries: {len(result.state.entries)}")
    click.echo(_summary_line(result.summary))

    if result.branches:
        click.echo("branches:")
        table = make_table()
        table.add_column("BRANCH", style="cyan", no_wrap=True)
        table.add_column("LOOKUP", no_wrap=True)
        table.add_column("PR", no_wrap=True, justify="right")
        table.add_column("MATCHES", no_wrap=True)
        table.add_column("INCORPORATION", no_wrap=True)
        table.add_column("TITLE", overflow="ellipsis", ratio=1)
        for branch in result.branches:
            pr_cell = f"#{branch.pr.number}" if branch.pr.number is not None else "-"
            title_cell = branch.pr.title if branch.pr.title is not None else "-"
            matches_cell = (
                ",".join(branch.matching_stored_entry_ids)
                if branch.matching_stored_entry_ids
                else "-"
            )
            table.add_row(
                branch.source.branch,
                branch.pr.lookup_status,
                pr_cell,
                matches_cell,
                _INCORPORATION_LABELS[branch.incorporation_state],
                title_cell,
            )
        get_console().print(table)
    else:
        click.echo("branches: (none)")

    if result.diagnostics:
        click.echo("diagnostics:")
        for d in result.diagnostics:
            click.echo(f"  - {d.kind}: {_summarize_diagnostic(d)}")
    else:
        click.echo("diagnostics: (none)")

    if result.next_steps:
        click.echo("next steps:")
        for step in result.next_steps:
            click.echo(f"  $ {step.command}")
            click.echo(f"    ({step.reason})")
    else:
        click.echo("next steps: (caught up)")


def _project_check(bundle: EvidenceBundle) -> MemjectiveCheckResult:
    root = _adapt_root(bundle.root)
    branches = tuple(_adapt_branch(b, bundle.state) for b in bundle.branches)
    state_view = _build_state_view(bundle.slug, bundle.state)
    diagnostics = _build_diagnostics(
        slug=bundle.slug,
        root=root,
        state=bundle.state,
        branches=branches,
    )
    summary = _build_summary(branches)
    next_steps = _build_next_steps(slug=bundle.slug, state=bundle.state, summary=summary)
    return MemjectiveCheckResult(
        slug=bundle.slug,
        root=root,
        state=state_view,
        branches=branches,
        diagnostics=diagnostics,
        summary=summary,
        next_steps=next_steps,
    )


@clinkr_operation(
    name="check",
    help=(
        "Emit fact-bundle evidence for a memjective slug: root presence, "
        "stored state, branch + PR observations, and typed diagnostics. "
        "Read-only; never returns negative — use diagnostics to detect issues."
    ),
    human_renderer=render_memjective_check,
)
def run_check_memjective(
    ctx: click.Context,
    request: MemjectiveCheckRequest,
) -> ClinkrExit[MemjectiveCheckResult]:
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
    return ClinkrExit.ok(_project_check(bundle))
