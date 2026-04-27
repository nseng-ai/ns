"""``memjective exec digest`` — JSON facts for ``dev-memjective-digest``.

Pushes the deterministic counting and tree-walking the
``dev-memjective-digest`` skill used to drive by hand into a single Click
operation. The skill keeps only the two real judgment calls (Thesis
distillation + Key findings selection) and the locked Markdown output
contract; this command supplies every other fact it renders.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Annotated, Any

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
from twerk_core.memjective.exec.checkboxes import (
    count_checkboxes,
    extract_section,
)
from twerk_core.memjective.gateway_access import MEMJECTIVE_NAMESPACE
from twerk_core.memjective.slug_resolution import (
    AmbiguousMemjective,
    NoMemjectiveOnBranch,
    SlugResolution,
    resolve_slug,
)

_STOPWORDS = frozenset(
    {
        "a",
        "an",
        "and",
        "the",
        "to",
        "of",
        "in",
        "on",
        "for",
        "with",
        "from",
        "into",
        "by",
        "as",
        "is",
        "be",
        "or",
        "no",
        "not",
        "first",
        "next",
        "then",
        "out",
        "via",
    }
)


@dataclass(frozen=True)
class MemjectiveDigestRequest:
    slug: Annotated[
        str | None,
        click.Argument(["slug"], type=click.STRING, required=False, default=None),
    ] = None
    no_drift: bool = False


@dataclass(frozen=True)
class _BranchSnapshot:
    branch: str
    body_md: str
    roadmap_md: str
    notes_md: str
    body_last_touched: str | None
    roadmap_checked: int
    roadmap_total: int
    slices_checked: int
    slices_total: int


@dataclass(frozen=True)
class _Slice:
    num: int
    title: str
    checked_count: int
    total_count: int

    @property
    def fully_checked(self) -> bool:
        return self.total_count > 0 and self.checked_count == self.total_count


@dataclass(frozen=True)
class MemjectiveDigestResult(JsonSerializable):
    slug: str
    metadata_lines: tuple[tuple[str, str], ...]
    description_md: str
    out_of_scope_md: str
    slices: tuple[dict[str, Any], ...]
    tree: tuple[dict[str, Any], ...]
    notes_by_branch: tuple[tuple[str, str], ...]
    warnings: tuple[str, ...]

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "slug": self.slug,
            "metadata": dict(self.metadata_lines),
            "thesis_inputs": {
                "description_md": self.description_md,
                "out_of_scope_md": self.out_of_scope_md,
            },
            "slices": [dict(item) for item in self.slices],
            "tree": [dict(item) for item in self.tree],
            "findings_inputs": {"notes_by_branch": dict(self.notes_by_branch)},
            "warnings": list(self.warnings),
        }


@clinkr_operation(
    name="digest",
    help=(
        "Emit structured digest facts for `dev-memjective-digest`. Reads "
        "the master seed, every branch snapshot, the PRs attached to each "
        "branch, per-file body.md timestamps, and (unless --no-drift) "
        "open PRs whose titles match unchecked slice keywords. SLUG "
        "auto-resolves from the current branch when exactly one memjective "
        "is attached."
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

    master_snapshot = _read_snapshot(gateway, git, slug, MASTER_BRANCH)
    branch_snapshots = tuple(_read_snapshot(gateway, git, slug, b) for b in branch_names)
    branch_alive = {b: git.branch_exists(b) for b in branch_names}

    if not master_snapshot.slices_total:
        warnings.append(
            "roadmap_missing_on_master: master `roadmap.md` has no `## Slice` headings; "
            "slice rows omitted."
        )

    most_progressed = _pick_most_progressed(branch_snapshots, branch_alive)
    pr_results = {b: pr_gateway.get_pr_for_branch(b) for b in branch_names}

    open_pr_count = sum(
        1 for r in pr_results.values() if isinstance(r, PRSummary) and r.state == "OPEN"
    )
    merged_pr_count = sum(
        1 for r in pr_results.values() if isinstance(r, PRSummary) and r.state == "MERGED"
    )
    deleted_with_merged = sum(
        1
        for b, r in pr_results.items()
        if isinstance(r, PRSummary) and r.state == "MERGED" and not branch_alive[b]
    )

    metadata_lines = _compose_metadata_lines(
        master=master_snapshot,
        branches=branch_snapshots,
        most_progressed=most_progressed,
        branch_alive=branch_alive,
        open_pr_count=open_pr_count,
        merged_pr_count=merged_pr_count,
        deleted_with_merged=deleted_with_merged,
    )

    master_slices = _parse_roadmap_slices(master_snapshot.roadmap_md)
    branches_slices = {b.branch: _parse_roadmap_slices(b.roadmap_md) for b in branch_snapshots}

    slices_payload = _compose_slices(master_slices, branches_slices, most_progressed)

    tree_payload = tuple(
        _compose_tree_entry(
            b,
            branch_alive[b.branch],
            pr_results[b.branch],
            git.branch_head_iso(b.branch) if branch_alive[b.branch] else None,
        )
        for b in branch_snapshots
    )

    if not request.no_drift:
        drift_warnings = _detect_drift(
            pr_gateway,
            unchecked_slice_titles=tuple(
                slice_.title for slice_ in master_slices if not slice_.fully_checked
            ),
            known_branches=set(branch_names),
        )
        warnings.extend(drift_warnings)

    notes_by_branch = tuple((b.branch, b.notes_md) for b in branch_snapshots if b.notes_md.strip())
    if master_snapshot.notes_md.strip():
        notes_by_branch = ((MASTER_BRANCH, master_snapshot.notes_md), *notes_by_branch)

    return ClinkrExit.ok(
        MemjectiveDigestResult(
            slug=slug,
            metadata_lines=metadata_lines,
            description_md=extract_section(master_snapshot.body_md, "Description"),
            out_of_scope_md=extract_section(master_snapshot.body_md, "Out of scope"),
            slices=slices_payload,
            tree=tree_payload,
            notes_by_branch=notes_by_branch,
            warnings=tuple(warnings),
        )
    )


def _read_snapshot(
    gateway: BranchMemoryGateway,
    git: GitGateway,
    slug: str,
    branch: str,
) -> _BranchSnapshot:
    body_md = gateway.get(MEMJECTIVE_NAMESPACE, body_key(slug), branch) or ""
    roadmap_md = gateway.get(MEMJECTIVE_NAMESPACE, roadmap_key(slug), branch) or ""
    notes_md = gateway.get(MEMJECTIVE_NAMESPACE, notes_key(slug), branch) or ""
    snapshot_ref = snapshot_ref_name(MEMJECTIVE_NAMESPACE, branch)
    body_last_touched = git.file_last_touched_iso(snapshot_ref, f"{slug}/{BODY_FILE}")
    roadmap_checked, roadmap_total = count_checkboxes(roadmap_md)
    slices = _parse_roadmap_slices(roadmap_md)
    slices_checked = sum(1 for s in slices if s.fully_checked)
    slices_total = len(slices)
    return _BranchSnapshot(
        branch=branch,
        body_md=body_md,
        roadmap_md=roadmap_md,
        notes_md=notes_md,
        body_last_touched=body_last_touched,
        roadmap_checked=roadmap_checked,
        roadmap_total=roadmap_total,
        slices_checked=slices_checked,
        slices_total=slices_total,
    )


_SLICE_PREFIX_RE = re.compile(r"^Slice\s+\d+\s*[—\-:]\s*", re.IGNORECASE)


def _parse_roadmap_slices(md: str) -> tuple[_Slice, ...]:
    """Split ``md`` into ordered slices keyed by ``##`` headings.

    Every level-2 heading after the first ``# Roadmap`` (or anywhere when
    no top-level heading exists) is treated as a slice. Sub-headings of
    deeper level belong to the enclosing slice. Each slice owns the
    checkboxes that appear under it until the next ``##`` heading. The
    title is the heading text with any ``Slice N — `` prefix stripped so
    the digest table reads cleanly.
    """
    slices: list[_Slice] = []
    current_title: str | None = None
    current_lines: list[str] = []
    for raw_line in md.splitlines():
        stripped = raw_line.strip()
        if stripped.startswith("## "):
            if current_title is not None:
                checked, total = count_checkboxes("\n".join(current_lines))
                slices.append(
                    _Slice(
                        num=len(slices) + 1,
                        title=current_title,
                        checked_count=checked,
                        total_count=total,
                    )
                )
            heading = stripped[3:].strip()
            current_title = _SLICE_PREFIX_RE.sub("", heading).strip() or heading
            current_lines = []
            continue
        if current_title is not None:
            current_lines.append(raw_line)

    if current_title is not None:
        checked, total = count_checkboxes("\n".join(current_lines))
        slices.append(
            _Slice(
                num=len(slices) + 1,
                title=current_title,
                checked_count=checked,
                total_count=total,
            )
        )

    return tuple(slices)


def _pick_most_progressed(
    branches: tuple[_BranchSnapshot, ...],
    branch_alive: dict[str, bool],
) -> _BranchSnapshot | None:
    """Return the live branch with the most fully-checked slices.

    Tiebreak: latest ``body.md`` last-touched timestamp (lexical ISO-8601
    sort, so ``None`` falls to the back). Returns ``None`` when no live
    branches carry a snapshot.
    """
    live = [b for b in branches if branch_alive.get(b.branch, False)]
    if not live:
        return None
    return max(
        live,
        key=lambda b: (b.slices_checked, b.body_last_touched or ""),
    )


def _compose_metadata_lines(
    *,
    master: _BranchSnapshot,
    branches: tuple[_BranchSnapshot, ...],
    most_progressed: _BranchSnapshot | None,
    branch_alive: dict[str, bool],
    open_pr_count: int,
    merged_pr_count: int,
    deleted_with_merged: int,
) -> tuple[tuple[str, str], ...]:
    body_status = _extract_body_status(master.body_md) or "unknown"

    status_line = f"{body_status} · {open_pr_count} PRs open, {merged_pr_count} merged"

    branch_slices_checked = most_progressed.slices_checked if most_progressed is not None else 0
    roadmap_line = (
        f"{branch_slices_checked} / {master.slices_total} slices checked on branches "
        f"· {master.slices_checked} / {master.slices_total} on master"
    )

    cc_master_md = extract_section(master.body_md, "Completion Criteria")
    cc_master_checked, cc_master_total = count_checkboxes(cc_master_md)
    if most_progressed is not None:
        cc_branch_md = extract_section(most_progressed.body_md, "Completion Criteria")
        cc_branch_checked, _ = count_checkboxes(cc_branch_md)
    else:
        cc_branch_checked = 0
    completion_criteria_line = (
        f"{cc_branch_checked} / {cc_master_total} met on branches · "
        f"{cc_master_checked} / {cc_master_total} on master"
    )

    live_count = sum(1 for b in branches if branch_alive.get(b.branch, False))
    if most_progressed is None:
        live_branches_line = "0 active — no branch snapshots"
    else:
        suffix = ""
        if deleted_with_merged:
            suffix = f" (+{deleted_with_merged} merged & deleted)"
        live_branches_line = (
            f"{live_count} active{suffix} — most-progressed: "
            f"`{most_progressed.branch}` (updated {most_progressed.body_last_touched or 'unknown'})"
        )

    if merged_pr_count and master.slices_checked < merged_pr_count:
        readiness = f"reconcile pending — {merged_pr_count} merged PRs not yet folded in"
    elif most_progressed is not None and most_progressed.slices_checked > master.slices_checked:
        ahead = most_progressed.slices_checked - master.slices_checked
        readiness = f"{ahead} slices ahead on branches, but reconcile is a no-op until PRs merge"
    else:
        readiness = "in sync with branch snapshots"
    master_canonical_line = f"last touched {master.body_last_touched or 'unknown'}; {readiness}"

    return (
        ("status_line", status_line),
        ("roadmap_line", roadmap_line),
        ("completion_criteria_line", completion_criteria_line),
        ("live_branches_line", live_branches_line),
        ("master_canonical_line", master_canonical_line),
    )


_STATUS_LINE_RE = re.compile(r"^\s*status\s*:\s*(.+?)\s*$", re.IGNORECASE | re.MULTILINE)


def _extract_body_status(body_md: str) -> str | None:
    match = _STATUS_LINE_RE.search(body_md)
    if match is None:
        return None
    return match.group(1).strip() or None


def _compose_slices(
    master_slices: tuple[_Slice, ...],
    branches_slices: dict[str, tuple[_Slice, ...]],
    most_progressed: _BranchSnapshot | None,
) -> tuple[dict[str, Any], ...]:
    """Render per-slice payload from master ordering plus per-branch overlays."""
    rows: list[dict[str, Any]] = []
    for slice_ in master_slices:
        per_branch_checked: dict[str, bool] = {}
        for branch, branch_slices in branches_slices.items():
            match = next(
                (s for s in branch_slices if _slice_titles_match(s.title, slice_.title)),
                None,
            )
            per_branch_checked[branch] = bool(match and match.fully_checked)

        rows.append(
            {
                "num": slice_.num,
                "title": slice_.title,
                "checked_on_master": slice_.fully_checked,
                "checked_on_most_progressed": (
                    most_progressed is not None
                    and per_branch_checked.get(most_progressed.branch, False)
                ),
                "checked_by_branch": per_branch_checked,
            }
        )
    return tuple(rows)


def _slice_titles_match(left: str, right: str) -> bool:
    """Loose match for slice titles across snapshots.

    Branches sometimes mutate slice wording mid-flight; we treat two
    titles as the same slice when their normalized lowercase forms agree.
    """
    return _normalize(left) == _normalize(right)


_NORMALIZE_RE = re.compile(r"\s+")


def _normalize(text: str) -> str:
    return _NORMALIZE_RE.sub(" ", text.strip().lower())


def _compose_tree_entry(
    snapshot: _BranchSnapshot,
    alive: bool,
    pr_result: PRSummary | PRLookupError,
    branch_head_iso: str | None,
) -> dict[str, Any]:
    deleted = not alive
    memj_state = _classify_memj_state(
        alive=alive,
        snapshot_iso=snapshot.body_last_touched,
        branch_head_iso=branch_head_iso,
    )
    if isinstance(pr_result, PRSummary):
        return {
            "branch": snapshot.branch,
            "deleted": deleted,
            "pr_number": pr_result.number,
            "pr_state": pr_result.state,
            "pr_title": pr_result.title,
            "pr_url": pr_result.url,
            "body_last_touched": snapshot.body_last_touched,
            "branch_head_iso": branch_head_iso,
            "memj_state": memj_state,
        }
    return {
        "branch": snapshot.branch,
        "deleted": deleted,
        "pr_number": None,
        "pr_state": None,
        "pr_title": None,
        "pr_url": None,
        "body_last_touched": snapshot.body_last_touched,
        "branch_head_iso": branch_head_iso,
        "memj_state": memj_state,
        "pr_error": pr_result.stderr if pr_result.returncode != 1 else None,
    }


def _classify_memj_state(
    *,
    alive: bool,
    snapshot_iso: str | None,
    branch_head_iso: str | None,
) -> str:
    """Classify a snapshot as ``"fresh"`` or ``"stale"``.

    A deleted branch (post-merge) is fresh by definition: its history is
    frozen, so the snapshot can no longer drift. For live branches, compare
    ISO-8601 committer timestamps lexically — stale only when both
    timestamps are known and the branch HEAD is strictly newer than the
    snapshot's last write.
    """
    if not alive:
        return "fresh"
    if snapshot_iso is None or branch_head_iso is None:
        return "fresh"
    if branch_head_iso > snapshot_iso:
        return "stale"
    return "fresh"


def _detect_drift(
    pr_gateway: PRGateway,
    *,
    unchecked_slice_titles: tuple[str, ...],
    known_branches: set[str],
) -> list[str]:
    """Return advisory warnings for open PRs that look unclaimed.

    Each unclaimed PR (open, title overlaps an unchecked slice, branch not
    already in the snapshot tree) becomes one ``unclaimed_pr:`` warning. The
    digest skill renders these under the trailing ``> ⚠`` block — they are
    heuristic and never feed the deterministic per-slice rows.
    """
    if not unchecked_slice_titles:
        return []
    keywords = _drift_query_keywords(unchecked_slice_titles)
    if not keywords:
        return []
    query = " ".join(keywords)
    result = pr_gateway.search_open_prs(query)
    if isinstance(result, PRLookupError):
        return [f"drift_check_skipped: {result.stderr or 'gh pr list failed'}"]
    return [
        (
            f"unclaimed_pr: PR #{pr.number} {pr.title!r} on branch "
            f"{pr.head_ref_name!r} matches an unchecked slice but has no "
            f"snapshot. {pr.url} — run dev-memjective-claim if it belongs "
            f"to this memjective."
        )
        for pr in result
        if pr.head_ref_name not in known_branches
    ]


def _drift_query_keywords(titles: tuple[str, ...]) -> list[str]:
    """Pick distinctive search terms from unchecked slice titles.

    Splits each title into alphanumeric words, strips short stopwords, and
    keeps the first two distinctive terms per title — enough signal to
    drive ``gh pr list --search`` without exceeding GitHub's query length.
    """
    words: list[str] = []
    seen: set[str] = set()
    for title in titles:
        per_title = 0
        for raw in re.findall(r"[A-Za-z][A-Za-z0-9_-]+", title):
            token = raw.lower()
            if len(token) <= 2 or token in _STOPWORDS or token in seen:
                continue
            seen.add(token)
            words.append(token)
            per_title += 1
            if per_title == 2:
                break
    return words
