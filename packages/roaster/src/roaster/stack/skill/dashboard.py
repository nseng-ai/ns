"""Skill-first roaster stack dashboard rendering."""

from __future__ import annotations

from dataclasses import dataclass

from roaster.stack.common.markers import render_stack_dashboard_marker
from roaster.stack.common.run_storage import StackRunLocator


@dataclass(frozen=True)
class StackSkillDashboardCounts:
    """Roll-up counts for a skill-first stack dashboard."""

    accepted: int = 0
    submitted: int = 0
    failed: int = 0
    blocked: int = 0


@dataclass(frozen=True)
class StackSkillDashboardBatch:
    """One batch row in the skill-first dashboard."""

    slug: str
    title: str
    finding_ids: tuple[str, ...]
    confidence: str
    risk: str
    summary: str = ""
    generated_branch: str | None = None
    resolver_status: str | None = None
    validation_status: str | None = None
    validation_summary: str | None = None


@dataclass(frozen=True)
class StackSkillDashboardState:
    """Input facts for rendering one skill-first dashboard comment."""

    profile_slug: str
    run_slug: str
    implementation_branch: str
    manifest_locator: StackRunLocator
    implementation_pr_number: int | None = None
    implementation_pr_url: str | None = None
    counts: StackSkillDashboardCounts = StackSkillDashboardCounts()
    batches: tuple[StackSkillDashboardBatch, ...] = ()


def render_stack_skill_dashboard(state: StackSkillDashboardState) -> str:
    """Render deterministic skill-first stack dashboard Markdown."""
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
        "",
        "### Status",
        "",
        (
            "- **Counts:** "
            f"accepted {state.counts.accepted}, submitted {state.counts.submitted}, "
            f"failed {state.counts.failed}, blocked {state.counts.blocked}"
        ),
        "",
        "### Batches",
        "",
    ]
    lines.extend(_render_batch_table(state.batches))
    return "\n".join(lines).rstrip() + "\n"


def _render_batch_table(batches: tuple[StackSkillDashboardBatch, ...]) -> list[str]:
    lines = [
        "| Batch | Title / summary | Confidence / risk | Findings | Generated branch | "
        "Resolver | Validation |",
        "| --- | --- | --- | --- | --- | --- | --- |",
    ]
    if not batches:
        lines.append("| — | No accepted batches yet. | — | — | — | — | — |")
        return lines

    for batch in batches:
        lines.append(
            "| "
            f"`{_table_cell(batch.slug)}` | "
            f"{_table_cell(_title_summary(batch))} | "
            f"{_table_cell(batch.confidence)} / {_table_cell(batch.risk)} | "
            f"{_table_cell(_finding_ids(batch.finding_ids))} | "
            f"{_optional_code_cell(batch.generated_branch)} | "
            f"{_table_cell(_optional_text(batch.resolver_status))} | "
            f"{_table_cell(_validation_display(batch))} |"
        )
    return lines


def _title_summary(batch: StackSkillDashboardBatch) -> str:
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


def _validation_display(batch: StackSkillDashboardBatch) -> str:
    status = _optional_text(batch.validation_status)
    if batch.validation_summary is None:
        return status
    return f"{status}: {batch.validation_summary}"


def _table_cell(value: str) -> str:
    return value.replace("\n", " ").replace("|", "\\|")
