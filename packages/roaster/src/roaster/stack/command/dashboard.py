"""Dashboard rendering and PR discussion publication for roaster stack runs."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, TypeAlias

from asdl_core.gh.pr_gateway import PRGateway
from asdl_core.gh.types import PRDiscussionComment
from roaster.stack.common.markers import render_stack_dashboard_marker
from roaster.stack.common.run_storage import StackRunLocator

DEFAULT_STACK_DASHBOARD_AUTHOR_LOGIN = "github-actions[bot]"
_ACTIVITY_LOG_HEADING = "### Activity Log"
_ACTIVITY_LOG_CAP = 10

StackDashboardPublicationAction = Literal["created", "updated"]


@dataclass(frozen=True)
class StackDashboardCounts:
    """Optional roll-up counts for stack dashboard status sections."""

    accepted: int | None = None
    rejected: int | None = None
    superseded: int | None = None
    submitted: int | None = None
    failed: int | None = None
    blocked: int | None = None


@dataclass(frozen=True)
class StackDashboardBatch:
    """One batch row in the roaster stack dashboard."""

    slug: str
    title: str
    finding_ids: tuple[str, ...]
    confidence: str
    risk: str
    summary: str = ""
    generated_branch: str | None = None
    generated_pr_number: int | None = None
    generated_pr_url: str | None = None
    resolver_status: str | None = None
    validation_status: str | None = None
    validation_summary: str | None = None


@dataclass(frozen=True)
class RejectedStackFinding:
    """Compact rejected/superseded finding detail for the dashboard."""

    finding_id: str
    summary: str
    rationale: str | None = None


@dataclass(frozen=True)
class StackDashboardState:
    """Input facts for rendering one persistent roaster stack dashboard comment."""

    profile_slug: str
    run_slug: str
    implementation_branch: str
    manifest_locator: StackRunLocator
    implementation_pr_number: int | None = None
    implementation_pr_url: str | None = None
    reviewer_run_count: int | None = None
    finding_count: int | None = None
    counts: StackDashboardCounts = StackDashboardCounts()
    batches: tuple[StackDashboardBatch, ...] = ()
    rejected_findings: tuple[RejectedStackFinding, ...] = ()
    activity_entries: tuple[str, ...] = ()


@dataclass(frozen=True)
class StackDashboardPublication:
    """Successful dashboard publication result."""

    action: StackDashboardPublicationAction
    comment: PRDiscussionComment


@dataclass(frozen=True)
class StackDashboardPublicationError:
    """Non-ideal result for dashboard publication failures."""

    message: str
    error_type: str = "stack_dashboard_publication_failed"


StackDashboardPublicationResult: TypeAlias = (
    StackDashboardPublication | StackDashboardPublicationError
)


def render_stack_dashboard(state: StackDashboardState) -> str:
    """Render a deterministic Markdown dashboard body."""
    lines: list[str] = [
        render_stack_dashboard_marker(state.profile_slug),
        f"## roaster stack · {state.profile_slug}",
        "",
        "### Run",
        "",
        f"- **Implementation branch:** `{state.implementation_branch}`",
        (
            "- **Implementation PR:** "
            f"{_pr_display(state.implementation_pr_number, state.implementation_pr_url)}"
        ),
        f"- **Run slug:** `{state.run_slug}`",
        (
            "- **Manifest:** "
            f"Branch Memory `{state.manifest_locator.namespace}` / "
            f"`{state.manifest_locator.key}` on `{state.manifest_locator.branch}`"
        ),
    ]

    rollups = _render_rollups(state)
    if rollups:
        lines.extend(["", "### Status", ""])
        lines.extend(rollups)

    lines.extend(["", "### Batches", ""])
    lines.extend(_render_batch_table(state.batches))
    lines.extend(["", "### Rejected findings", ""])
    lines.extend(_render_rejected_findings(state))

    activity_entries = state.activity_entries[-_ACTIVITY_LOG_CAP:]
    if activity_entries:
        lines.extend(["", _ACTIVITY_LOG_HEADING, ""])
        lines.extend(f"- {entry}" for entry in activity_entries)

    return "\n".join(lines).rstrip() + "\n"


def preserve_dashboard_activity_log(existing_body: str, new_body: str, activity_entry: str) -> str:
    """Merge a new Activity Log entry into ``new_body`` from ``existing_body``."""
    prior_entries = _extract_activity_log_entries(existing_body)
    entries = (*prior_entries, activity_entry)[-_ACTIVITY_LOG_CAP:]

    base = _strip_activity_log(new_body).rstrip()
    rendered = [base, "", _ACTIVITY_LOG_HEADING, ""]
    rendered.extend(f"- {entry}" for entry in entries)
    return "\n".join(rendered) + "\n"


def publish_stack_dashboard(
    pr_gateway: PRGateway,
    *,
    implementation_pr_number: int,
    state: StackDashboardState,
    author_login: str = DEFAULT_STACK_DASHBOARD_AUTHOR_LOGIN,
    activity_entry: str | None = None,
) -> StackDashboardPublicationResult:
    """Create or update the one top-level dashboard comment for a stack run."""
    marker = render_stack_dashboard_marker(state.profile_slug)
    body = render_stack_dashboard(state)

    try:
        existing = pr_gateway.find_pr_discussion_comment_by_marker(
            implementation_pr_number,
            marker,
            author_login,
        )
        if existing is None:
            comment = pr_gateway.add_pr_discussion_comment(implementation_pr_number, body)
            return StackDashboardPublication(action="created", comment=comment)

        if activity_entry is not None:
            body = preserve_dashboard_activity_log(existing.body, body, activity_entry)
        comment = pr_gateway.update_pr_discussion_comment(existing.id, body)
        return StackDashboardPublication(action="updated", comment=comment)
    except Exception as exc:
        return StackDashboardPublicationError(
            message=f"failed to publish roaster stack dashboard: {exc}"
        )


def _render_rollups(state: StackDashboardState) -> list[str]:
    rollups: list[str] = []
    if state.reviewer_run_count is not None:
        rollups.append(f"- **Reviewers run:** {state.reviewer_run_count}")
    if state.finding_count is not None:
        rollups.append(f"- **Findings:** {state.finding_count}")

    count_fragments = _count_fragments(state.counts)
    if count_fragments:
        rollups.append(f"- **Counts:** {', '.join(count_fragments)}")
    return rollups


def _count_fragments(counts: StackDashboardCounts) -> list[str]:
    fragments: list[str] = []
    for label, value in (
        ("accepted", counts.accepted),
        ("rejected", counts.rejected),
        ("superseded", counts.superseded),
        ("submitted", counts.submitted),
        ("failed", counts.failed),
        ("blocked", counts.blocked),
    ):
        if value is not None:
            fragments.append(f"{label} {value}")
    return fragments


def _render_batch_table(batches: tuple[StackDashboardBatch, ...]) -> list[str]:
    lines = [
        "| Batch | Title / summary | Confidence / risk | Findings | Generated branch | "
        "Generated PR | Resolver | Validation |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    if not batches:
        lines.append("| — | No accepted batches yet. | — | — | — | — | — | — |")
        return lines

    for batch in batches:
        lines.append(
            "| "
            f"`{_table_cell(batch.slug)}` | "
            f"{_table_cell(_title_summary(batch))} | "
            f"{_table_cell(batch.confidence)} / {_table_cell(batch.risk)} | "
            f"{_table_cell(_finding_ids(batch.finding_ids))} | "
            f"{_optional_code_cell(batch.generated_branch)} | "
            f"{_table_cell(_pr_display(batch.generated_pr_number, batch.generated_pr_url))} | "
            f"{_table_cell(_optional_text(batch.resolver_status))} | "
            f"{_table_cell(_validation_display(batch))} |"
        )
    return lines


def _render_rejected_findings(state: StackDashboardState) -> list[str]:
    rejected_count = state.counts.rejected
    if rejected_count is None:
        rejected_count = len(state.rejected_findings)

    noun = "finding" if rejected_count == 1 else "findings"
    lines = [f"{rejected_count} rejected {noun}."]
    if not state.rejected_findings:
        return lines

    lines.extend(["", "<details>", "<summary>Rejected finding details</summary>", ""])
    for finding in state.rejected_findings:
        detail = f"- `{_table_cell(finding.finding_id)}` — {_table_cell(finding.summary)}"
        if finding.rationale is not None:
            detail = f"{detail} ({_table_cell(finding.rationale)})"
        lines.append(detail)
    lines.extend(["", "</details>"])
    return lines


def _title_summary(batch: StackDashboardBatch) -> str:
    if batch.summary:
        return f"{batch.title} — {batch.summary}"
    return batch.title


def _finding_ids(finding_ids: tuple[str, ...]) -> str:
    if not finding_ids:
        return "—"
    return ", ".join(f"`{finding_id}`" for finding_id in finding_ids)


def _pr_display(pr_number: int | None, pr_url: str | None) -> str:
    if pr_number is not None and pr_url is not None:
        return f"[#{pr_number}]({pr_url})"
    if pr_number is not None:
        return f"#{pr_number}"
    if pr_url is not None:
        return pr_url
    return "—"


def _optional_code_cell(value: str | None) -> str:
    if value is None:
        return "—"
    return f"`{_table_cell(value)}`"


def _optional_text(value: str | None) -> str:
    if value is None:
        return "—"
    return value


def _validation_display(batch: StackDashboardBatch) -> str:
    status = _optional_text(batch.validation_status)
    if batch.validation_summary is None:
        return status
    return f"{status}: {batch.validation_summary}"


def _table_cell(value: str) -> str:
    return value.replace("\n", " ").replace("|", "\\|")


def _extract_activity_log_entries(body: str) -> tuple[str, ...]:
    lines = body.splitlines()
    for index, line in enumerate(lines):
        if line.strip() == _ACTIVITY_LOG_HEADING:
            entries: list[str] = []
            for entry_line in lines[index + 1 :]:
                stripped = entry_line.strip()
                if stripped.startswith("- "):
                    entries.append(stripped[2:])
            return tuple(entries)
    return ()


def _strip_activity_log(body: str) -> str:
    lines = body.splitlines()
    for index, line in enumerate(lines):
        if line.strip() == _ACTIVITY_LOG_HEADING:
            return "\n".join(lines[:index])
    return body
