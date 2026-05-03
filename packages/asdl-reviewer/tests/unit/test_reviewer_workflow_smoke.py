from __future__ import annotations

from pathlib import Path


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[4]


def _reviewer_workflow_text() -> str:
    return (_repo_root() / ".github" / "workflows" / "reviewer.yml").read_text(encoding="utf-8")


def test_reviewer_workflow_posts_inline_findings_before_summary_comment() -> None:
    workflow = _reviewer_workflow_text()

    post_inline_index = workflow.index("uv run reviewer exec post-inline-findings")
    format_index = workflow.index("uv run reviewer exec format-findings-comment")
    post_summary_index = workflow.index("uv run reviewer exec post-findings-comment")

    assert post_inline_index < format_index < post_summary_index
    assert '--inline-result-file "$inline_result_file"' in workflow
    assert '> "$inline_result_file"' in workflow


def test_reviewer_workflow_posts_comments_before_exiting_with_reviewer_status() -> None:
    workflow = _reviewer_workflow_text()

    post_summary_index = workflow.index("uv run reviewer exec post-findings-comment")
    exit_index = workflow.index('exit "$status"')

    assert post_summary_index < exit_index
    assert 'printf \'%s\' "$output" > "$reviewer_output_file"' in workflow
