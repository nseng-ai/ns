from __future__ import annotations

from pathlib import Path

PNPM_ROASTER = "pnpm --config.verify-deps-before-run=false --dir ts exec roaster"


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


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
        f'{PNPM_ROASTER} review list --applicable --base-ref "$BASE_REF" --format json' in workflow
    )


def test_roaster_workflow_prints_discover_failure_envelope() -> None:
    workflow = _roaster_workflow_text()

    assert f"output=$({PNPM_ROASTER} review list" in workflow
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

    assert f'{PNPM_ROASTER} review run "$REVIEW_KEY"' in workflow
    assert '--base-ref "$BASE_REF"' in workflow


def test_roaster_workflow_publishes_findings_once_with_fallback_metadata() -> None:
    workflow = _roaster_workflow_text()

    publish_index = workflow.index(f"{PNPM_ROASTER} exec publish")

    assert workflow.count(f"{PNPM_ROASTER} exec publish") == 1
    assert '--review-name "$REVIEW_KEY"' in workflow
    assert '--base-ref "$BASE_REF"' in workflow
    run_url_arg = '--run-url "$GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID"'
    assert run_url_arg in workflow
    assert "printf '%s' \"$output\" \\\n            |" in workflow
    assert publish_index > workflow.index('echo "--- end roaster envelope ---"')
    assert "roaster_output_" + "file" not in workflow
    assert "inline_result_" + "file" not in workflow


def test_roaster_workflow_posts_comments_before_exiting_with_roaster_status() -> None:
    workflow = _roaster_workflow_text()
    review_job = workflow[workflow.index("\n  review:") :]

    publish_index = review_job.index(f"{PNPM_ROASTER} exec publish")
    exit_index = review_job.index('exit "$status"')

    assert publish_index < exit_index
