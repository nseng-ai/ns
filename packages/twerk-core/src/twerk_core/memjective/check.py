"""Read-only reconciliation-state dashboard for a memjective."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Annotated, Any, Literal

import click

from twerk_core.clinkr.context import load_typed_context
from twerk_core.clinkr.exit import ClinkrExit
from twerk_core.clinkr.operation import clinkr_operation
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
    MEMJECTIVE_STATE_NAMESPACE,
    MemjectiveStateEntry,
    MemjectiveStateLoad,
    MemjectiveStateLoadStatus,
    load_memjective_state,
)
from twerk_core.memjective.tree_model import (
    MemjectiveTreeBranch,
    build_memjective_tree_model,
)

CheckRecommendedAction = Literal["incorporate", "decide_skip", "wait", "none"]
CheckErrorKind = Literal["state_parse_error", "pr_lookup_error"]

ItemBucketKey = Literal[
    "merged_pending_incorporation",
    "merged_incorporated",
    "stale_incorporation_entries",
    "closed_needs_skip_decision",
    "closed_skipped",
    "tracked_not_eligible",
]

ITEM_BUCKET_KEYS: tuple[ItemBucketKey, ...] = (
    "merged_pending_incorporation",
    "merged_incorporated",
    "stale_incorporation_entries",
    "closed_needs_skip_decision",
    "closed_skipped",
    "tracked_not_eligible",
)

ATTENTION_ITEM_BUCKETS: frozenset[ItemBucketKey] = frozenset(
    {
        "merged_pending_incorporation",
        "stale_incorporation_entries",
        "closed_needs_skip_decision",
    }
)


@dataclass(frozen=True)
class MemjectiveCheckRequest:
    slug: Annotated[
        str | None,
        click.Argument(["slug"], type=click.STRING, required=False, default=None),
    ] = None


@dataclass(frozen=True)
class MemjectiveCheckRoot:
    namespace: str
    branch: str
    path: str
    exists: bool

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "namespace": self.namespace,
            "branch": self.branch,
            "path": self.path,
            "exists": self.exists,
        }


@dataclass(frozen=True)
class MemjectiveCheckState:
    namespace: str
    branch: str
    key: str
    status: MemjectiveStateLoadStatus
    entry_count: int
    error: str | None

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "namespace": self.namespace,
            "branch": self.branch,
            "key": self.key,
            "status": self.status,
            "entry_count": self.entry_count,
            "error": self.error,
        }


@dataclass(frozen=True)
class MemjectiveCheckSource:
    namespace: str
    branch: str
    path: str
    stale: bool

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "namespace": self.namespace,
            "branch": self.branch,
            "path": self.path,
            "stale": self.stale,
        }


@dataclass(frozen=True)
class MemjectiveCheckPullRequest:
    number: int | None
    state: PRState | None
    title: str | None
    url: str | None
    head_ref_name: str | None
    base_ref_name: str | None
    error_stderr: str | None

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "number": self.number,
            "state": self.state,
            "title": self.title,
            "url": self.url,
            "head_ref_name": self.head_ref_name,
            "base_ref_name": self.base_ref_name,
            "error_stderr": self.error_stderr,
        }


@dataclass(frozen=True)
class MemjectiveCheckItem:
    id: str
    source: MemjectiveCheckSource
    pr: MemjectiveCheckPullRequest
    recommended_action: CheckRecommendedAction
    reason: str
    stored_entry: MemjectiveStateEntry | None

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "source": self.source.to_json_dict(),
            "pr": self.pr.to_json_dict(),
            "recommended_action": self.recommended_action,
            "reason": self.reason,
            "stored_entry": None if self.stored_entry is None else self.stored_entry.to_json_dict(),
        }


@dataclass(frozen=True)
class MemjectiveCheckError:
    kind: CheckErrorKind
    message: str
    item: MemjectiveCheckItem | None = None

    def to_json_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "kind": self.kind,
            "message": self.message,
        }
        if self.item is not None:
            payload["item"] = self.item.to_json_dict()
        return payload


@dataclass(frozen=True)
class MemjectiveCheckBuckets:
    items: Mapping[ItemBucketKey, tuple[MemjectiveCheckItem, ...]]
    lookup_or_state_errors: tuple[MemjectiveCheckError, ...]

    def to_json_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            key: [item.to_json_dict() for item in self.items[key]] for key in ITEM_BUCKET_KEYS
        }
        payload["lookup_or_state_errors"] = [
            error.to_json_dict() for error in self.lookup_or_state_errors
        ]
        return payload

    @property
    def needs_attention_count(self) -> int:
        return sum(len(self.items[key]) for key in ATTENTION_ITEM_BUCKETS) + len(
            self.lookup_or_state_errors
        )


@dataclass(frozen=True)
class MemjectiveCheckResult:
    slug: str
    root: MemjectiveCheckRoot
    state: MemjectiveCheckState
    stored_entries: tuple[MemjectiveStateEntry, ...]
    buckets: MemjectiveCheckBuckets

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "slug": self.slug,
            "root": self.root.to_json_dict(),
            "state": self.state.to_json_dict(),
            "stored_entries": [entry.to_json_dict() for entry in self.stored_entries],
            "buckets": self.buckets.to_json_dict(),
        }


def render_memjective_check(result: MemjectiveCheckResult) -> None:
    click.echo(f"slug: {result.slug}")
    click.echo(
        "root: "
        f"{'present' if result.root.exists else 'absent'} "
        f"({result.root.namespace}/{result.root.branch}/{result.root.path})"
    )
    click.echo(
        "state: "
        f"{result.state.status} "
        f"({result.state.namespace}/{result.state.branch}/{result.state.key}, "
        f"{result.state.entry_count} entries)"
    )

    if result.buckets.needs_attention_count == 0:
        click.echo("status: caught up")
    else:
        click.echo("status: action needed")

    _render_items(
        "merged pending incorporation",
        result.buckets.items["merged_pending_incorporation"],
    )
    _render_items(
        "stale incorporation entries",
        result.buckets.items["stale_incorporation_entries"],
    )
    _render_items(
        "closed PRs needing skip decision",
        result.buckets.items["closed_needs_skip_decision"],
    )
    _render_items("merged incorporated", result.buckets.items["merged_incorporated"])
    _render_items("closed skipped", result.buckets.items["closed_skipped"])
    _render_items("tracked but not eligible", result.buckets.items["tracked_not_eligible"])
    _render_errors(result.buckets.lookup_or_state_errors)


def _render_items(header: str, items: tuple[MemjectiveCheckItem, ...]) -> None:
    if not items:
        return
    click.echo(f"{header}:")
    for item in items:
        click.echo(f"  - {_item_label(item)} [{item.recommended_action}]")


def _render_errors(errors: tuple[MemjectiveCheckError, ...]) -> None:
    if not errors:
        return
    click.echo("lookup/state errors:")
    for error in errors:
        if error.item is None:
            click.echo(f"  - {error.kind}: {error.message}")
            continue
        click.echo(f"  - {error.kind}: {_item_label(error.item)}: {error.message}")


def _item_label(item: MemjectiveCheckItem) -> str:
    branch = item.source.branch
    if item.pr.number is None:
        return f"{branch}: {item.reason}"
    title = item.pr.title if item.pr.title is not None else "(untitled PR)"
    return f"{branch}: #{item.pr.number} {title}"


@clinkr_operation(
    name="check",
    help=(
        "Check reconciliation state for a memjective. Reports merged PRs "
        "needing incorporation, closed PRs needing skip decisions, stored "
        "state, visible open/local branches, and lookup errors."
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

    tree_model = build_memjective_tree_model(
        slug=slug,
        brmem_gateway=mctx.brmem_gateway,
        git_gateway=mctx.git_gateway,
        pr_gateway=mctx.pr_gateway,
    )
    state_load = load_memjective_state(mctx.brmem_gateway, slug=slug)

    result = _build_check_result(
        slug=slug,
        seed_present=tree_model.seed_present,
        branches=tree_model.branches,
        state_load=state_load,
    )
    if not tree_model.seed_present and not tree_model.branches and state_load.status == "absent":
        return ClinkrExit.negative(
            result,
            message=f"No memjective found for slug {slug!r}.",
        )
    return ClinkrExit.ok(result)


def _build_check_result(
    *,
    slug: str,
    seed_present: bool,
    branches: tuple[MemjectiveTreeBranch, ...],
    state_load: MemjectiveStateLoad,
) -> MemjectiveCheckResult:
    root = MemjectiveCheckRoot(
        namespace=MEMJECTIVE_NAMESPACE,
        branch=MASTER_BRANCH,
        path=slug,
        exists=seed_present,
    )
    state = MemjectiveCheckState(
        namespace=MEMJECTIVE_STATE_NAMESPACE,
        branch=MASTER_BRANCH,
        key=state_load.key,
        status=state_load.status,
        entry_count=len(state_load.state.entries),
        error=state_load.error,
    )
    entries_by_id = {entry.id: entry for entry in state_load.state.entries}
    items = tuple(_item_from_branch(slug, branch, entries_by_id) for branch in branches)
    buckets = _build_buckets(items, state_load)

    return MemjectiveCheckResult(
        slug=slug,
        root=root,
        state=state,
        stored_entries=state_load.state.entries,
        buckets=buckets,
    )


def _item_from_branch(
    slug: str,
    branch: MemjectiveTreeBranch,
    entries_by_id: dict[str, MemjectiveStateEntry],
) -> MemjectiveCheckItem:
    item_id = _candidate_entry_id(branch)
    branch_entry_id = f"branch-{branch.branch}"
    stored_entry = entries_by_id.get(item_id) or entries_by_id.get(branch_entry_id)
    pr = MemjectiveCheckPullRequest(
        number=branch.pr.number,
        state=branch.pr.state,
        title=branch.pr.title,
        url=branch.pr.url,
        head_ref_name=branch.pr.head_ref_name,
        base_ref_name=branch.pr.base_ref_name,
        error_stderr=branch.pr.error_stderr,
    )
    recommended_action, reason = _recommend_action(branch, stored_entry)
    return MemjectiveCheckItem(
        id=item_id,
        source=MemjectiveCheckSource(
            namespace=MEMJECTIVE_NAMESPACE,
            branch=branch.branch,
            path=slug,
            stale=branch.stale,
        ),
        pr=pr,
        recommended_action=recommended_action,
        reason=reason,
        stored_entry=stored_entry,
    )


def _candidate_entry_id(branch: MemjectiveTreeBranch) -> str:
    if branch.pr.number is not None:
        return f"pr-{branch.pr.number}"
    return f"branch-{branch.branch}"


def _recommend_action(
    branch: MemjectiveTreeBranch,
    stored_entry: MemjectiveStateEntry | None,
) -> tuple[CheckRecommendedAction, str]:
    resolution_status = None if stored_entry is None else stored_entry.resolution_status
    if branch.pr.action == "merged":
        if resolution_status == "incorporated":
            return "none", "PR is merged and already has an incorporation entry"
        return "incorporate", "PR is merged and has no incorporation entry"
    if branch.pr.action == "closed":
        if resolution_status == "skipped":
            return "none", "PR is closed unmerged and already has a skip entry"
        return "decide_skip", "PR is closed unmerged and needs a skip decision"
    if branch.pr.action == "open":
        return "wait", "PR is still open and is not eligible for root incorporation"
    if branch.pr.action == "no_pr":
        return "wait", "branch has no PR and is not eligible for root incorporation"
    return "none", "PR lookup failed"


def _build_buckets(
    items: tuple[MemjectiveCheckItem, ...],
    state_load: MemjectiveStateLoad,
) -> MemjectiveCheckBuckets:
    merged_pending: list[MemjectiveCheckItem] = []
    merged_incorporated: list[MemjectiveCheckItem] = []
    stale_incorporations: list[MemjectiveCheckItem] = []
    closed_needs_skip: list[MemjectiveCheckItem] = []
    closed_skipped: list[MemjectiveCheckItem] = []
    tracked_not_eligible: list[MemjectiveCheckItem] = []
    errors: list[MemjectiveCheckError] = []

    if state_load.status == "invalid":
        errors.append(
            MemjectiveCheckError(
                kind="state_parse_error",
                message=state_load.error or "state could not be parsed",
            )
        )

    for item in items:
        if item.pr.error_stderr is not None:
            errors.append(
                MemjectiveCheckError(
                    kind="pr_lookup_error",
                    message=item.pr.error_stderr,
                    item=item,
                )
            )
            continue
        if item.pr.state == "MERGED":
            if (
                item.stored_entry is not None
                and item.stored_entry.resolution_status == "incorporated"
            ):
                if _recorded_pr_differs(item):
                    stale_incorporations.append(item)
                else:
                    merged_incorporated.append(item)
            else:
                merged_pending.append(item)
            continue
        if item.pr.state == "CLOSED":
            if item.stored_entry is not None and item.stored_entry.resolution_status == "skipped":
                closed_skipped.append(item)
            else:
                closed_needs_skip.append(item)
            continue
        tracked_not_eligible.append(item)

    item_buckets: dict[ItemBucketKey, tuple[MemjectiveCheckItem, ...]] = {
        "merged_pending_incorporation": tuple(merged_pending),
        "merged_incorporated": tuple(merged_incorporated),
        "stale_incorporation_entries": tuple(stale_incorporations),
        "closed_needs_skip_decision": tuple(closed_needs_skip),
        "closed_skipped": tuple(closed_skipped),
        "tracked_not_eligible": tuple(tracked_not_eligible),
    }
    return MemjectiveCheckBuckets(
        items=item_buckets,
        lookup_or_state_errors=tuple(errors),
    )


def _recorded_pr_differs(item: MemjectiveCheckItem) -> bool:
    if item.stored_entry is None:
        return False
    stored_pr = item.stored_entry.pr_payload
    if stored_pr is None:
        return False

    current_fields: dict[str, Any] = {
        "number": item.pr.number,
        "state": item.pr.state,
        "title": item.pr.title,
        "url": item.pr.url,
        "head_ref_name": item.pr.head_ref_name,
        "base_ref_name": item.pr.base_ref_name,
    }
    for key, current_value in current_fields.items():
        if key in stored_pr and stored_pr[key] != current_value:
            return True
    return False
