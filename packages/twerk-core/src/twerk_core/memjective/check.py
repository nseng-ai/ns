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
from twerk_core.memjective.discovery import MASTER_BRANCH
from twerk_core.memjective.gateway_access import MEMJECTIVE_NAMESPACE
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
    load_state,
    state_key,
)
from twerk_core.memjective.tree_model import (
    BranchPrAction,
    MemjectiveTreeBranch,
    build_memjective_tree_model,
)

_ACTION_TO_LOOKUP_STATUS: dict[BranchPrAction, Literal["found", "missing", "error"]] = {
    "open": "found",
    "merged": "found",
    "closed": "found",
    "no_pr": "missing",
    "error": "error",
}


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


@dataclass(frozen=True)
class CheckPR:
    lookup_status: Literal["found", "missing", "error"]
    number: int | None
    state: PRState | None
    title: str | None
    url: str | None
    head_ref_name: str | None
    base_ref_name: str | None
    error_stderr: str | None


@dataclass(frozen=True)
class CheckBranch:
    source: CheckSource
    pr: CheckPR
    matching_stored_entry_ids: tuple[str, ...]


@dataclass(frozen=True)
class CheckDiagnostic:
    kind: str
    payload: dict[str, Any]


@dataclass(frozen=True)
class MemjectiveCheckResult:
    slug: str
    root: CheckRoot
    state: CheckStateView
    branches: tuple[CheckBranch, ...]
    diagnostics: tuple[CheckDiagnostic, ...]

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "slug": self.slug,
            "root": {
                "namespace": self.root.namespace,
                "branch": self.root.branch,
                "path": self.root.path,
                "exists": self.root.exists,
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
                    },
                    "pr": {
                        "lookup_status": branch.pr.lookup_status,
                        "number": branch.pr.number,
                        "state": branch.pr.state,
                        "title": branch.pr.title,
                        "url": branch.pr.url,
                        "head_ref_name": branch.pr.head_ref_name,
                        "base_ref_name": branch.pr.base_ref_name,
                        "error_stderr": branch.pr.error_stderr,
                    },
                    "matching_stored_entry_ids": list(branch.matching_stored_entry_ids),
                }
                for branch in self.branches
            ],
            "diagnostics": [{"kind": d.kind, **d.payload} for d in self.diagnostics],
        }


def _build_check_branch(
    tree_branch: MemjectiveTreeBranch,
    *,
    slug: str,
    state: MemjectiveState | StateAbsent | StateInvalid,
) -> CheckBranch:
    lookup_status = _ACTION_TO_LOOKUP_STATUS[tree_branch.pr.action]
    source = CheckSource(
        namespace=MEMJECTIVE_NAMESPACE,
        branch=tree_branch.branch,
        path=slug,
        stale=tree_branch.stale,
    )
    pr = CheckPR(
        lookup_status=lookup_status,
        number=tree_branch.pr.number,
        state=tree_branch.pr.state,
        title=tree_branch.pr.title,
        url=tree_branch.pr.url,
        head_ref_name=tree_branch.pr.head_ref_name,
        base_ref_name=tree_branch.pr.base_ref_name,
        error_stderr=tree_branch.pr.error_stderr,
    )
    matching_ids = _matching_stored_entry_ids(
        branch_name=tree_branch.branch,
        pr_number=tree_branch.pr.number if lookup_status == "found" else None,
        state=state,
    )
    return CheckBranch(source=source, pr=pr, matching_stored_entry_ids=matching_ids)


def _matching_stored_entry_ids(
    *,
    branch_name: str,
    pr_number: int | None,
    state: MemjectiveState | StateAbsent | StateInvalid,
) -> tuple[str, ...]:
    if not isinstance(state, MemjectiveState):
        return ()
    matches: list[str] = []
    branch_id = f"branch-{branch_name}"
    pr_id = f"pr-{pr_number}" if pr_number is not None else None
    for entry in state.entries:
        if pr_id is not None and entry.id == pr_id:
            matches.append(entry.id)
            continue
        if entry.id == branch_id:
            matches.append(entry.id)
    return tuple(matches)


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
                    "namespace": MEMJECTIVE_NAMESPACE,
                    "branch": MASTER_BRANCH,
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

    if result.branches:
        click.echo("branches:")
        table = make_table()
        table.add_column("BRANCH", style="cyan", no_wrap=True)
        table.add_column("LOOKUP", no_wrap=True)
        table.add_column("PR", no_wrap=True, justify="right")
        table.add_column("TITLE", overflow="ellipsis", ratio=1)
        table.add_column("MATCHES", no_wrap=True)
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
                title_cell,
                matches_cell,
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
    gateway = mctx.brmem_gateway
    git = mctx.git_gateway
    pr = mctx.pr_gateway

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

    tree_model = build_memjective_tree_model(
        slug=slug,
        brmem_gateway=gateway,
        git_gateway=git,
        pr_gateway=pr,
    )

    root = CheckRoot(
        namespace=MEMJECTIVE_NAMESPACE,
        branch=MASTER_BRANCH,
        path=slug,
        exists=tree_model.seed_present,
    )

    state = load_state(slug=slug, brmem_gateway=gateway)
    state_view = _build_state_view(slug, state)

    branches = tuple(
        _build_check_branch(tree_branch, slug=slug, state=state)
        for tree_branch in tree_model.branches
    )

    diagnostics = _build_diagnostics(
        slug=slug,
        root=root,
        state=state,
        branches=branches,
    )

    return ClinkrExit.ok(
        MemjectiveCheckResult(
            slug=slug,
            root=root,
            state=state_view,
            branches=branches,
            diagnostics=diagnostics,
        )
    )
