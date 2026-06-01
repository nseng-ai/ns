from __future__ import annotations

from collections.abc import Sequence

from vibechk.models import LoadedBundle

MetricRow = tuple[str, str]

METRIC_ROWS: tuple[MetricRow, ...] = (
    ("Wall time seconds", "wall_time_seconds"),
    ("Input tokens", "input_tokens"),
    ("Output tokens", "output_tokens"),
    ("Total tokens", "total_tokens"),
    ("Cost USD", "cost_usd"),
)
RUNS_TABLE_HEADERS = ("RUN ID", "STARTED AT", "STATUS", "RUNNER", "MODEL", "BRANCH", "WORKDIR")


def render_run_report(loaded: LoadedBundle) -> str:
    bundle = loaded.bundle
    result_branch = bundle.result_branch or "none"
    diff_patch = _diff_body(loaded.diff_patch)
    transcript = loaded.transcript or "_No transcript captured._"

    lines = [
        f"# Vibechk Run `{bundle.run_id}`",
        "",
        "## Summary",
        "",
        f"- Status: {bundle.status}",
        f"- Runner: {bundle.runner}",
        f"- Model: {_format_value(bundle.model)}",
        f"- Workdir: {bundle.workdir}",
        f"- Started: {bundle.started_at.isoformat()}",
        f"- Finished: {bundle.finished_at.isoformat()}",
        f"- Starting branch: {bundle.git.starting_branch}",
        f"- Starting commit: {bundle.git.starting_commit}",
        f"- Result branch: {result_branch}",
        "",
        "## Metrics",
        "",
        "| Metric | Value |",
        "| --- | --- |",
    ]
    for label, field_name in METRIC_ROWS:
        lines.append(f"| {label} | {_format_value(getattr(bundle.metrics, field_name))} |")

    lines.extend(
        [
            "",
            "<details>",
            "<summary>Plan</summary>",
            "",
            "```markdown",
            loaded.plan_text,
            "```",
            "",
            "</details>",
            "",
            "<details>",
            "<summary>Transcript</summary>",
            "",
            "```text",
            transcript,
            "```",
            "",
            "</details>",
            "",
            "## Diff",
            "",
            "```diff",
            diff_patch,
            "```",
            "",
        ]
    )
    return "\n".join(lines)


def render_runs_table(loaded_bundles: Sequence[LoadedBundle]) -> str:
    rows = [_runs_table_row(loaded) for loaded in loaded_bundles]
    widths = [
        max([len(RUNS_TABLE_HEADERS[index]), *(len(row[index]) for row in rows)])
        for index in range(len(RUNS_TABLE_HEADERS))
    ]
    lines = [_format_table_row(RUNS_TABLE_HEADERS, widths)]
    lines.extend(_format_table_row(row, widths) for row in rows)
    return "\n".join(lines)


def run_list_entry_to_json(loaded: LoadedBundle) -> dict[str, object]:
    bundle = loaded.bundle
    return {
        "run_id": bundle.run_id,
        "started_at": bundle.started_at.isoformat(),
        "finished_at": bundle.finished_at.isoformat(),
        "status": bundle.status,
        "runner": bundle.runner,
        "runner_version": bundle.runner_version,
        "model": bundle.model,
        "workdir": bundle.workdir,
        "starting_branch": bundle.git.starting_branch,
        "starting_commit": bundle.git.starting_commit,
        "result_branch": bundle.result_branch,
        "branch_created": bundle.branch_created,
        "runner_exit_code": bundle.runner_exit_code,
        "metrics": bundle.metrics.to_json(),
        "run_dir": str(loaded.run_dir),
    }


def render_comparison_report(baseline: LoadedBundle, treatment: LoadedBundle) -> str:
    baseline_bundle = baseline.bundle
    treatment_bundle = treatment.bundle
    lines = [
        "# Vibechk Comparison",
        "",
        f"Baseline: `{baseline_bundle.run_id}`  ",
        f"Treatment: `{treatment_bundle.run_id}`",
        "",
        "## Biggest Metric Deltas",
        "",
        _delta_bullet(
            "Wall time seconds",
            baseline_bundle.metrics.wall_time_seconds,
            treatment_bundle.metrics.wall_time_seconds,
        ),
        _delta_bullet(
            "Total tokens",
            baseline_bundle.metrics.total_tokens,
            treatment_bundle.metrics.total_tokens,
        ),
        _delta_bullet(
            "Cost USD", baseline_bundle.metrics.cost_usd, treatment_bundle.metrics.cost_usd
        ),
        "",
        "## Metrics",
        "",
        "| Metric | Baseline | Treatment | Delta |",
        "| --- | ---: | ---: | ---: |",
    ]

    for label, field_name in METRIC_ROWS:
        baseline_value = getattr(baseline_bundle.metrics, field_name)
        treatment_value = getattr(treatment_bundle.metrics, field_name)
        lines.append(
            "| "
            f"{label} | {_format_value(baseline_value)} | {_format_value(treatment_value)} | "
            f"{_format_delta(baseline_value, treatment_value)} |"
        )

    lines.extend(
        [
            "",
            "## Configuration",
            "",
            "| Field | Baseline | Treatment |",
            "| --- | --- | --- |",
            _config_row("Runner", baseline_bundle.runner, treatment_bundle.runner),
            _config_row(
                "Runner version",
                baseline_bundle.runner_version,
                treatment_bundle.runner_version,
            ),
            _config_row("Model", baseline_bundle.model, treatment_bundle.model),
            _config_row(
                "Starting branch",
                baseline_bundle.git.starting_branch,
                treatment_bundle.git.starting_branch,
            ),
            _config_row(
                "Starting commit",
                baseline_bundle.git.starting_commit,
                treatment_bundle.git.starting_commit,
            ),
            _config_row(
                "Result branch",
                baseline_bundle.result_branch,
                treatment_bundle.result_branch,
            ),
            "",
        ]
    )

    lines.extend(_render_plan_comparison(baseline.plan_text, treatment.plan_text))
    lines.extend(
        [
            "",
            "## Baseline Diff",
            "",
            "```diff",
            _diff_body(baseline.diff_patch),
            "```",
            "",
            "## Treatment Diff",
            "",
            "```diff",
            _diff_body(treatment.diff_patch),
            "```",
            "",
        ]
    )
    return "\n".join(lines)


def _runs_table_row(loaded: LoadedBundle) -> tuple[str, ...]:
    bundle = loaded.bundle
    return (
        bundle.run_id,
        bundle.started_at.isoformat(),
        bundle.status,
        bundle.runner,
        _format_table_value(bundle.model),
        _format_table_value(bundle.result_branch),
        bundle.workdir,
    )


def _format_table_row(values: Sequence[str], widths: Sequence[int]) -> str:
    padded = [value.ljust(widths[index]) for index, value in enumerate(values[:-1])]
    return "  ".join([*padded, values[-1]])


def _format_table_value(value: object) -> str:
    if value is None:
        return "-"
    return str(value)


def _render_plan_comparison(baseline_plan: str, treatment_plan: str) -> list[str]:
    if baseline_plan == treatment_plan:
        return [
            "<details>",
            "<summary>Plan</summary>",
            "",
            "```markdown",
            baseline_plan,
            "```",
            "",
            "</details>",
        ]

    return [
        "> Warning: baseline and treatment plans differ.",
        "",
        "<details>",
        "<summary>Baseline Plan</summary>",
        "",
        "```markdown",
        baseline_plan,
        "```",
        "",
        "</details>",
        "",
        "<details>",
        "<summary>Treatment Plan</summary>",
        "",
        "```markdown",
        treatment_plan,
        "```",
        "",
        "</details>",
    ]


def _delta_bullet(label: str, baseline: float | int | None, treatment: float | int | None) -> str:
    return (
        f"- {label}: {_format_value(baseline)} -> {_format_value(treatment)} "
        f"({_format_delta(baseline, treatment)})"
    )


def _format_delta(baseline: float | int | None, treatment: float | int | None) -> str:
    if baseline is None or treatment is None:
        return "n/a"
    return f"{treatment - baseline:+g}"


def _config_row(label: str, baseline: object, treatment: object) -> str:
    return f"| {label} | {_format_value(baseline)} | {_format_value(treatment)} |"


def _format_value(value: object) -> str:
    if value is None:
        return "null"
    if isinstance(value, float):
        return f"{value:g}"
    return str(value)


def _diff_body(diff_patch: str) -> str:
    if diff_patch.strip():
        return diff_patch
    return "_No workdir changes._"
