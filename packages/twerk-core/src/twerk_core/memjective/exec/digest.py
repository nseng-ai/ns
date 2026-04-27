"""``memjective exec digest`` — raw facts for ``dev-memjective-digest``.

Harvests the structured facts the ``dev-memjective-digest`` skill needs
to render its locked Markdown output: per-branch raw snapshots, git
timestamps, PR state, and a list of unclaimed-PR candidates. The skill
owns every judgment that requires reading prose — slice extraction,
status parsing, completion-criteria counts, semantic drift matching.
This operation never parses Markdown.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated

import click

from twerk_core.brmem.gateway import (
    BranchMemoryGateway,
    snapshot_ref_name,
)
from twerk_core.clinkr.context import load_typed_context
from twerk_core.clinkr.dataclass_json import JsonSerializable
from twerk_core.clinkr.exit import ClinkrExit
from twerk_core.clinkr.operation import clinkr_operation
from twerk_core.gh.pr_gateway import PRGateway
from twerk_core.gh.types import PRLookupError, PRSummary
from twerk_core.git.git_gateway import GitGateway
from twerk_core.git.types import DetachedHead, GitCommandFailure
from twerk_core.memjective.context import MemjectiveCliContext
from twerk_core.memjective.discovery import (
    BODY_FILE,
    MASTER_BRANCH,
    body_key,
    notes_key,
    roadmap_key,
)
from twerk_core.memjective.gateway_access import MEMJECTIVE_NAMESPACE
from twerk_core.memjective.slug_resolution import (
    AmbiguousMemjective,
    NoMemjectiveOnBranch,
    SlugResolution,
    resolve_slug,
)


@dataclass(frozen=True)
class MemjectiveDigestRequest:
    slug: Annotated[
        str | None,
        click.Argument(["slug"], type=click.STRING, required=False, default=None),
    ] = None
    no_drift: bool = False


@dataclass(frozen=True)
class MasterSnapshot(JsonSerializable):
    body_md: str
    roadmap_md: str
    notes_md: str
    body_last_touched: str | None


@dataclass(frozen=True)
class BranchSnapshot(JsonSerializable):
    branch: str
    deleted: bool
    body_md: str
    roadmap_md: str
    notes_md: str
    body_last_touched: str | None
    branch_head_iso: str | None
    memj_state: str
    pr_number: int | None
    pr_state: str | None
    pr_title: str | None
    pr_url: str | None
    pr_error: str | None


@dataclass(frozen=True)
class UnclaimedPRCandidate(JsonSerializable):
    number: int
    title: str
    url: str
    head_ref: str


@dataclass(frozen=True)
class MemjectiveDigestResult(JsonSerializable):
    slug: str
    master: MasterSnapshot
    branches: tuple[BranchSnapshot, ...]
    unclaimed_pr_candidates: tuple[UnclaimedPRCandidate, ...]
    warnings: tuple[str, ...]


@clinkr_operation(
    name="digest",
    help=(
        "Emit raw digest facts for `dev-memjective-digest`. Reads the "
        "master seed, every branch snapshot, and the PRs attached to each "
        "branch. Returns body/roadmap/notes Markdown unparsed — the skill "
        "owns slice extraction, status parsing, and any semantic judgment. "
        "Unless --no-drift, also lists open PRs not attached to any "
        "snapshot in the tree (the skill matches them to unchecked "
        "slices). SLUG auto-resolves from the current branch when exactly "
        "one memjective is attached."
    ),
)
def run_digest_memjective(
    ctx: click.Context,
    request: MemjectiveDigestRequest,
) -> ClinkrExit[MemjectiveDigestResult]:
    mctx = load_typed_context(ctx, MemjectiveCliContext)
    gateway = mctx.brmem_gateway
    git = mctx.git_gateway
    pr_gateway = mctx.pr_gateway

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

    all_entries = gateway.list_entries(namespace=MEMJECTIVE_NAMESPACE)
    slug_entries = [e for e in all_entries if e.key.startswith(f"{slug}/")]
    if not slug_entries:
        return ClinkrExit.failure(
            error_type="slug_not_seeded",
            message=(
                f"No memjective found for slug {slug!r}. "
                "Run `dev-memjective-create` to seed it on master."
            ),
        )
    seed_present = any(e.branch == MASTER_BRANCH for e in slug_entries)
    if not seed_present:
        return ClinkrExit.failure(
            error_type="slug_not_seeded",
            message=(
                f"Memjective {slug!r} has branch snapshots but no master seed. "
                "Run `dev-memjective-create` (or reconcile) to seed master."
            ),
        )

    branch_names = sorted({e.branch for e in slug_entries if e.branch != MASTER_BRANCH})
    warnings: list[str] = []

    master_snapshot = _read_master_snapshot(gateway, git, slug)
    branch_alive = {b: git.branch_exists(b) for b in branch_names}
    pr_results = {b: pr_gateway.get_pr_for_branch(b) for b in branch_names}
    branch_snapshots = tuple(
        _read_branch_snapshot(
            gateway,
            git,
            slug,
            branch,
            alive=branch_alive[branch],
            pr_result=pr_results[branch],
        )
        for branch in branch_names
    )

    unclaimed: tuple[UnclaimedPRCandidate, ...] = ()
    if not request.no_drift:
        unclaimed_or_warning = _collect_unclaimed_pr_candidates(
            pr_gateway,
            known_branches=set(branch_names),
        )
        if isinstance(unclaimed_or_warning, str):
            warnings.append(unclaimed_or_warning)
        else:
            unclaimed = unclaimed_or_warning

    return ClinkrExit.ok(
        MemjectiveDigestResult(
            slug=slug,
            master=master_snapshot,
            branches=branch_snapshots,
            unclaimed_pr_candidates=unclaimed,
            warnings=tuple(warnings),
        )
    )


def _read_master_snapshot(
    gateway: BranchMemoryGateway,
    git: GitGateway,
    slug: str,
) -> MasterSnapshot:
    body_md = gateway.get(MEMJECTIVE_NAMESPACE, body_key(slug), MASTER_BRANCH) or ""
    roadmap_md = gateway.get(MEMJECTIVE_NAMESPACE, roadmap_key(slug), MASTER_BRANCH) or ""
    notes_md = gateway.get(MEMJECTIVE_NAMESPACE, notes_key(slug), MASTER_BRANCH) or ""
    snapshot_ref = snapshot_ref_name(MEMJECTIVE_NAMESPACE, MASTER_BRANCH)
    body_last_touched = git.file_last_touched_iso(snapshot_ref, f"{slug}/{BODY_FILE}")
    return MasterSnapshot(
        body_md=body_md,
        roadmap_md=roadmap_md,
        notes_md=notes_md,
        body_last_touched=body_last_touched,
    )


def _read_branch_snapshot(
    gateway: BranchMemoryGateway,
    git: GitGateway,
    slug: str,
    branch: str,
    *,
    alive: bool,
    pr_result: PRSummary | PRLookupError,
) -> BranchSnapshot:
    body_md = gateway.get(MEMJECTIVE_NAMESPACE, body_key(slug), branch) or ""
    roadmap_md = gateway.get(MEMJECTIVE_NAMESPACE, roadmap_key(slug), branch) or ""
    notes_md = gateway.get(MEMJECTIVE_NAMESPACE, notes_key(slug), branch) or ""
    snapshot_ref = snapshot_ref_name(MEMJECTIVE_NAMESPACE, branch)
    body_last_touched = git.file_last_touched_iso(snapshot_ref, f"{slug}/{BODY_FILE}")
    branch_head_iso = git.branch_head_iso(branch) if alive else None
    memj_state = _classify_memj_state(
        alive=alive,
        snapshot_iso=body_last_touched,
        branch_head_iso=branch_head_iso,
    )
    pr_number, pr_state, pr_title, pr_url, pr_error = _pr_fields(pr_result)
    return BranchSnapshot(
        branch=branch,
        deleted=not alive,
        body_md=body_md,
        roadmap_md=roadmap_md,
        notes_md=notes_md,
        body_last_touched=body_last_touched,
        branch_head_iso=branch_head_iso,
        memj_state=memj_state,
        pr_number=pr_number,
        pr_state=pr_state,
        pr_title=pr_title,
        pr_url=pr_url,
        pr_error=pr_error,
    )


def _pr_fields(
    pr_result: PRSummary | PRLookupError,
) -> tuple[int | None, str | None, str | None, str | None, str | None]:
    if isinstance(pr_result, PRSummary):
        return pr_result.number, pr_result.state, pr_result.title, pr_result.url, None
    # returncode == 1 is "no PR found" — expected for branches without one;
    # other codes are real failures worth surfacing.
    error = pr_result.stderr if pr_result.returncode != 1 else None
    return None, None, None, None, error


def _classify_memj_state(
    *,
    alive: bool,
    snapshot_iso: str | None,
    branch_head_iso: str | None,
) -> str:
    """Classify a snapshot as ``"fresh"`` or ``"stale"``.

    A deleted branch (post-merge) is fresh by definition: its history is
    frozen, so the snapshot can no longer drift. For live branches,
    compare ISO-8601 committer timestamps lexically — stale only when
    both timestamps are known and the branch HEAD is strictly newer than
    the snapshot's last write.
    """
    if not alive:
        return "fresh"
    if snapshot_iso is None or branch_head_iso is None:
        return "fresh"
    if branch_head_iso > snapshot_iso:
        return "stale"
    return "fresh"


def _collect_unclaimed_pr_candidates(
    pr_gateway: PRGateway,
    *,
    known_branches: set[str],
) -> tuple[UnclaimedPRCandidate, ...] | str:
    """Return open PRs whose head_ref is not in this memjective's tree.

    Returns a ``drift_check_skipped:`` warning string on gateway failure;
    the caller routes either branch into the result.
    """
    result = pr_gateway.search_open_prs("")
    if isinstance(result, PRLookupError):
        return f"drift_check_skipped: {result.stderr or 'gh pr list failed'}"
    return tuple(
        UnclaimedPRCandidate(
            number=pr.number,
            title=pr.title,
            url=pr.url,
            head_ref=pr.head_ref_name,
        )
        for pr in result
        if pr.head_ref_name not in known_branches
    )
