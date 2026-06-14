from __future__ import annotations

from pathlib import Path


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[4]


def _roaster_workflow_text() -> str:
    return (_repo_root() / ".github" / "workflows" / "roaster.yml").read_text(encoding="utf-8")


def test_roaster_workflow_discovers_applicable_ci_review_definitions() -> None:
    workflow = _roaster_workflow_text()

    assert "GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}" in workflow
    assert "PR_NUMBER: ${{ github.event.pull_request.number }}" in workflow
    assert (
        " ".join(
            (
                'BASE_REF=$(gh pr view "$PR_NUMBER"',
                '--repo "$GITHUB_REPOSITORY"',
                "--json baseRefName --jq .baseRefName)",
            )
        )
        in workflow
    )
    assert (
        'uv run roaster review list --applicable --base-ref "$BASE_REF" --format json' in workflow
    )


def test_roaster_workflow_prints_discover_failure_envelope() -> None:
    workflow = _roaster_workflow_text()

    assert "output=$(uv run roaster review list" in workflow
    assert "printf '%s\\n' \"$output\"" in workflow
    assert 'exit "$status"' in workflow


def test_roaster_workflow_fetches_full_history_for_discover_diff() -> None:
    workflow = _roaster_workflow_text()
    discover_checkout_index = workflow.index("jobs:\n  discover:")
    review_checkout_index = workflow.index("\n  review:")
    discover_job = workflow[discover_checkout_index:review_checkout_index]

    assert "fetch-depth: 0" in discover_job


def test_roaster_workflow_runs_diff_findings_review_without_format_flag() -> None:
    workflow = _roaster_workflow_text()

    assert 'uv run roaster review run "$REVIEW_KEY"' in workflow
    assert '--base-ref "$BASE_REF"' in workflow


def test_roaster_workflow_posts_inline_findings_before_summary_comment() -> None:
    workflow = _roaster_workflow_text()

    post_inline_index = workflow.index("uv run roaster exec post-inline-findings")
    format_index = workflow.index("uv run roaster exec format-findings-comment")
    post_summary_index = workflow.index("uv run roaster exec post-findings-comment")

    assert post_inline_index < format_index < post_summary_index
    assert '--inline-result-file "$inline_result_file"' in workflow
    assert '--review-name "$REVIEW_KEY"' in workflow
    assert '--base-ref "$BASE_REF"' in workflow
    assert '> "$inline_result_file"' in workflow


def test_roaster_workflow_posts_comments_before_exiting_with_roaster_status() -> None:
    workflow = _roaster_workflow_text()
    review_job = workflow[workflow.index("\n  review:") :]

    post_summary_index = review_job.index("uv run roaster exec post-findings-comment")
    exit_index = review_job.index('exit "$status"')

    assert post_summary_index < exit_index
    assert 'printf \'%s\' "$output" > "$roaster_output_file"' in review_job
