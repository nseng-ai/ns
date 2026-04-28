"""``objective exec digest`` — render the digest brief for ``objective-digest``.

Tightly coupled to the ``objective-digest`` skill: emits a single
natural-language prompt containing pre-computed facts (metadata table, PR
counts, latest snapshot pick), raw source prose, and the output template the
skill fills. The skill does no JSON parsing, Markdown structure inference, or
jq work.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated

import click

from brmem.gateway import BranchMemoryGateway, snapshot_ref_name
from twerk_core.clinkr.context import load_typed_context
from twerk_core.clinkr.dataclass_json import JsonSerializable
from twerk_core.clinkr.exit import ClinkrExit
from twerk_core.clinkr.operation import clinkr_operation
from twerk_core.gh.types import PRLookupError, PRSummary
from twerk_core.git.git_gateway import GitGateway
from twerk_core.git.types import DetachedHead, GitCommandFailure
from twerk_objectives.context import ObjectiveCliContext
from twerk_objectives.discovery import (
    BODY_FILE,
    MASTER_BRANCH,
    body_key,
    notes_key,
    roadmap_key,
)
from twerk_objectives.gateway_access import OBJECTIVE_NAMESPACE
from twerk_objectives.slug_resolution import (
    AmbiguousObjective,
    NoObjectiveOnBranch,
    SlugResolution,
    resolve_slug,
)


@dataclass(frozen=True)
class ObjectiveDigestRequest:
    slug: Annotated[
        str | None,
        click.Argument(["slug"], type=click.STRING, required=False, default=None),
    ] = None


@dataclass(frozen=True)
class DigestPrompt(JsonSerializable):
    prompt: str


@dataclass(frozen=True)
class _MasterSnapshot:
    body_md: str
    roadmap_md: str
    notes_md: str
    body_last_touched: str | None


@dataclass(frozen=True)
class _BranchSnapshot:
    branch: str
    deleted: bool
    notes_md: str
    body_last_touched: str | None
    pr_number: int | None
    pr_state: str | None
    pr_title: str | None
    pr_url: str | None
    pr_error: str | None


def render_digest_prompt(result: DigestPrompt) -> None:
    click.echo(result.prompt, nl=False)


@clinkr_operation(
    name="digest",
    help=(
        "Render the digest brief for `objective-digest`. The CLI "
        "pre-computes every precise fact (PR counts, latest snapshot, "
        "metadata rows) and embeds raw master body and per-snapshot "
        "notes as prose for the skill to summarize. "
        "SLUG auto-resolves from the current branch when exactly one "
        "objective is attached."
    ),
    human_renderer=render_digest_prompt,
)
def run_digest_objective(
    ctx: click.Context,
    request: ObjectiveDigestRequest,
) -> ClinkrExit[DigestPrompt]:
    mctx = load_typed_context(ctx, ObjectiveCliContext)
    gateway = mctx.brmem_gateway
    git = mctx.git_gateway

    match resolve_slug(mctx, request.slug):
        case GitCommandFailure() as failure:
            return ClinkrExit.failure(error_type="git_failed", message=failure.message)
        case DetachedHead():
            return ClinkrExit.failure(
                error_type="detached_head",
                message="Detached HEAD: brmem requires a checked-out branch.",
            )
        case NoObjectiveOnBranch(branch=branch):
            return ClinkrExit.failure(
                error_type="no_objective_on_branch",
                message=f"No objective on branch {branch!r}.",
            )
        case AmbiguousObjective(branch=branch, slugs=slugs):
            names = ", ".join(slugs)
            return ClinkrExit.failure(
                error_type="ambiguous_objective",
                message=f"Multiple objectives on branch {branch!r}: {names}. Specify a SLUG.",
            )
        case SlugResolution(slug=slug):
            pass

    all_entries = gateway.list_entries(namespace=OBJECTIVE_NAMESPACE)
    slug_entries = [e for e in all_entries if e.key.startswith(f"{slug}/")]
    if not slug_entries:
        return ClinkrExit.failure(
            error_type="slug_not_seeded",
            message=(
                f"No objective found for slug {slug!r}. "
                "Run `objective-create` to seed it on master."
            ),
        )
    seed_present = any(e.branch == MASTER_BRANCH for e in slug_entries)
    if not seed_present:
        return ClinkrExit.failure(
            error_type="slug_not_seeded",
            message=(
                f"Objective {slug!r} has branch snapshots but no master seed. "
                "Run `objective-create` (or reconcile) to seed master."
            ),
        )

    branch_names = sorted({e.branch for e in slug_entries if e.branch != MASTER_BRANCH})
    master = _read_master_snapshot(gateway, git, slug)
    branch_alive = {b: git.branch_exists(b) for b in branch_names}
    pr_results = {b: mctx.pr_gateway.get_pr_for_branch(b) for b in branch_names}
    branches = tuple(
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

    prompt = _build_digest_prompt(slug, master, branches)
    return ClinkrExit.ok(DigestPrompt(prompt=prompt))


def _read_master_snapshot(
    gateway: BranchMemoryGateway,
    git: GitGateway,
    slug: str,
) -> _MasterSnapshot:
    body_md = gateway.get(OBJECTIVE_NAMESPACE, body_key(slug), MASTER_BRANCH) or ""
    roadmap_md = gateway.get(OBJECTIVE_NAMESPACE, roadmap_key(slug), MASTER_BRANCH) or ""
    notes_md = gateway.get(OBJECTIVE_NAMESPACE, notes_key(slug), MASTER_BRANCH) or ""
    snapshot_ref = snapshot_ref_name(OBJECTIVE_NAMESPACE, MASTER_BRANCH)
    body_last_touched = git.file_last_touched_iso(snapshot_ref, f"{slug}/{BODY_FILE}")
    return _MasterSnapshot(
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
) -> _BranchSnapshot:
    notes_md = gateway.get(OBJECTIVE_NAMESPACE, notes_key(slug), branch) or ""
    snapshot_ref = snapshot_ref_name(OBJECTIVE_NAMESPACE, branch)
    body_last_touched = git.file_last_touched_iso(snapshot_ref, f"{slug}/{BODY_FILE}")
    pr_number, pr_state, pr_title, pr_url, pr_error = _pr_fields(pr_result)
    return _BranchSnapshot(
        branch=branch,
        deleted=not alive,
        notes_md=notes_md,
        body_last_touched=body_last_touched,
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
    error = pr_result.stderr if pr_result.returncode != 1 else None
    return None, None, None, None, error


def _build_digest_prompt(
    slug: str,
    master: _MasterSnapshot,
    branches: tuple[_BranchSnapshot, ...],
) -> str:
    snapshots_row = _branch_snapshots_row(branches)
    master_ts = master.body_last_touched or "unknown"

    notes_section = _notes_section(master, branches)

    metadata_table = (
        "|   |   |\n"
        "| --- | --- |\n"
        f"| **Associated PRs**   | {_associated_prs_cell(branches)} |\n"
        f"| **Branch snapshots** | {snapshots_row} |\n"
        f"| **Master canonical** | last touched {master_ts} |"
    )

    merged_prs_block = _merged_prs_block(branches)
    remaining_work_section = _remaining_work_section(master)

    return (
        f"You are producing the final Markdown digest for objective `{slug}`.\n"
        "The CLI has already computed every precise fact you need below. Read\n"
        "the prose blocks to write the prose sections. Output the filled\n"
        "template only — no commentary above or below it.\n"
        "\n"
        "# Step 1 — Metadata table (copy this block verbatim)\n"
        "\n"
        f"{metadata_table}\n"
        "\n"
        "# Step 2 — Merged PRs (copy this block verbatim)\n"
        "\n"
        f"{merged_prs_block}\n"
        "\n"
        "# Step 3 — Thesis (write 2–4 sentences)\n"
        "\n"
        "Read the master body below as prose. Cover:\n"
        "- Value: what gets better when this workstream lands.\n"
        "- Approach: the strategy tying the work together.\n"
        "- Boundary (optional): a short out-of-scope clause when it sharpens\n"
        "  the mental model.\n"
        "\n"
        "Avoid module paths, class/function/API names, bullet lists,\n"
        "subheadings, and restating source section names.\n"
        "\n"
        "Source — master body:\n"
        "\n"
        "<<<\n"
        f"{_strip_trailing(master.body_md)}\n"
        ">>>\n"
        "\n"
        "# Step 4 — Remaining work (one bullet per unfinished roadmap slice)\n"
        "\n"
        "Render one bullet per remaining (unfinished) slice in the master\n"
        "roadmap below. Bullet shape:\n"
        "`- **<slice headline>.** <one short sentence>`. The headline copies\n"
        "the slice title (e.g. `Slice 3.5 — Inline line-level comments`); the\n"
        "sentence summarizes what's left in that slice in ≤25 words. Skip\n"
        "slices whose bullets are all checked. If every slice is done, render\n"
        "exactly: `_No remaining work — objective is complete._`\n"
        "\n"
        f"{remaining_work_section}\n"
        "\n"
        "# Step 5 — Key findings (≤5 bullets, or the empty placeholder)\n"
        "\n"
        "Bullet shape: `- **<short headline>.** <one short sentence>`. Each\n"
        "bullet is a single short sentence — aim for ≤20 words after the\n"
        "headline, no semicolons, no compound clauses, no trailing `and ...`\n"
        "rider.\n"
        "\n"
        "Pick durable contract decisions only: module paths, behavior\n"
        "deletions, error-message lock-ins, API surface moves, similar\n"
        "future-binding facts. Drop implementation trivia, test names,\n"
        "file:line citations, and scope-choice asides. Tag with the branch\n"
        "only when needed for follow-up. If there are no durable findings,\n"
        "render exactly: `_No durable findings recorded yet._`\n"
        "\n"
        f"{notes_section}\n"
        "\n"
        "# Output template — fill `<...>` placeholders, keep everything else exact\n"
        "\n"
        f"# `{slug}` — digest\n"
        "\n"
        "<METADATA TABLE FROM STEP 1, VERBATIM>\n"
        "\n"
        "## Thesis\n"
        "\n"
        "<YOUR THESIS FROM STEP 3>\n"
        "\n"
        "## Merged PRs\n"
        "\n"
        "<MERGED PRS FROM STEP 2, VERBATIM>\n"
        "\n"
        "## Remaining work\n"
        "\n"
        "<YOUR REMAINING WORK FROM STEP 4>\n"
        "\n"
        "## Key findings (binding for future work)\n"
        "\n"
        "<YOUR BULLETS FROM STEP 5>\n"
    )


def _branch_snapshots_row(branches: tuple[_BranchSnapshot, ...]) -> str:
    if not branches:
        return "0 active — no branch snapshots"
    live_count = sum(1 for b in branches if not b.deleted)
    deleted_count = sum(1 for b in branches if b.deleted)
    latest = max(branches, key=lambda b: b.body_last_touched or "")
    row = f"{live_count} active"
    if deleted_count:
        row += f" (+{deleted_count} merged & deleted)"
    ts = latest.body_last_touched or "unknown"
    row += f" · latest: `{latest.branch}` (updated {ts})"
    return row


def _associated_prs_cell(branches: tuple[_BranchSnapshot, ...]) -> str:
    open_count = sum(1 for b in branches if b.pr_state == "OPEN")
    merged_count = sum(1 for b in branches if b.pr_state == "MERGED")
    cell = f"{open_count} open, {merged_count} merged"
    errors = tuple(b for b in branches if b.pr_error is not None)
    if errors:
        details = ", ".join(f"`{b.branch}`: {b.pr_error}" for b in errors)
        cell += f" (lookup failed: {details})"
    return cell


def _merged_prs_block(branches: tuple[_BranchSnapshot, ...]) -> str:
    merged = sorted(
        (b for b in branches if b.pr_state == "MERGED" and b.pr_number is not None),
        key=lambda b: b.pr_number or 0,
    )
    if not merged:
        return "_No merged PRs yet._"
    lines = []
    for b in merged:
        title = b.pr_title or "(untitled)"
        url = b.pr_url or ""
        lines.append(f"- [#{b.pr_number}]({url}) — {title}")
    return "\n".join(lines)


def _remaining_work_section(master: _MasterSnapshot) -> str:
    if not master.roadmap_md.strip():
        return (
            "Source — master roadmap: (no roadmap recorded — use the master\n"
            "body shown in Step 3 as the only source)"
        )
    return f"Source — master roadmap:\n\n<<<\n{_strip_trailing(master.roadmap_md)}\n>>>"


def _notes_section(
    master: _MasterSnapshot,
    branches: tuple[_BranchSnapshot, ...],
) -> str:
    blocks: list[str] = []
    for b in branches:
        if not b.notes_md.strip():
            continue
        blocks.append(_branch_notes_block(b))
    if master.notes_md.strip():
        blocks.append("[master canonical]\n<<<\n" + _strip_trailing(master.notes_md) + "\n>>>")

    if not blocks:
        return (
            "Source — notes: (no notes recorded across any snapshot — render\n"
            "the empty placeholder line in the output)"
        )
    return "Source — notes (each block is verbatim from one snapshot):\n\n" + "\n\n".join(blocks)


def _branch_notes_block(b: _BranchSnapshot) -> str:
    label = f"branch: {b.branch}"
    if b.deleted:
        label += " (deleted)"
    if b.pr_number is not None:
        state = b.pr_state or "?"
        label += f" — PR #{b.pr_number} {state}"
    return f"[{label}]\n<<<\n{_strip_trailing(b.notes_md)}\n>>>"


def _strip_trailing(text: str) -> str:
    return text.rstrip("\n")
