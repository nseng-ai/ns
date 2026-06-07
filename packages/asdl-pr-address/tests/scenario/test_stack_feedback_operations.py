"""Scenario tests for stack feedback orchestration exec operations."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from click.testing import CliRunner

from asdl_core.clinkr.context import build_clinkr_context_object
from asdl_core.clinkr.group import ClinkrGroup
from asdl_core.gh.pr_testing import FakePRGateway
from asdl_core.gh.types import PRDiscussionComment, PRReviewComment, PRReviewThread
from asdl_core.git.testing import FakeGitGateway
from asdl_pr_address.cli.main import build_cli
from asdl_pr_address.cli.pr_address.context import PrAddressCliContext


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


def _ctx(fake: FakePRGateway) -> PrAddressCliContext:
    return PrAddressCliContext(pr_gateway=fake, git_gateway=FakeGitGateway())


def _obj(context: object) -> object:
    return build_clinkr_context_object(lambda: context)


def _payload_env(tmp_path: Path, *, session_id: str = "session1") -> dict[str, str]:
    return {
        "ASDL_PAYLOAD_ROOT": str(tmp_path / "payload-root"),
        "ASDL_PAYLOAD_SESSION_ID": session_id,
    }


def _summary_thread(
    thread_id: str,
    *,
    comment_id: int,
    body: str = "SECRET_THREAD_BODY please update this helper.",
) -> PRReviewThread:
    return PRReviewThread(
        id=thread_id,
        path="packages/example.py",
        line=12,
        start_line=10,
        is_resolved=False,
        is_outdated=False,
        comments=(
            PRReviewComment(
                id=comment_id,
                body=body,
                author="reviewer",
                path="packages/example.py",
                line=12,
                start_line=10,
                created_at="2026-05-23T00:00:00Z",
            ),
        ),
    )


def _feedback_fake() -> FakePRGateway:
    return FakePRGateway(
        review_threads={
            101: [_summary_thread("PRRT_101", comment_id=1001)],
            102: [_summary_thread("PRRT_102", comment_id=1002)],
        },
        discussion_comments={
            101: [
                PRDiscussionComment(
                    id=201,
                    author="vercel[bot]",
                    body="[vc]: SECRET_VERCEL_BODY deployment succeeded.",
                    url="https://example.com/201",
                ),
                PRDiscussionComment(
                    id=202,
                    author="roaster[bot]",
                    body="<!-- roaster: summary --> SECRET_ROASTER_BODY summary.",
                    url="https://example.com/202",
                ),
                PRDiscussionComment(
                    id=203,
                    author="alice",
                    body="SECRET_HUMAN_BODY FYI this looks good to me.",
                    url="https://example.com/203",
                ),
            ],
            102: [
                PRDiscussionComment(
                    id=204,
                    author="github-actions[bot]",
                    body="SECRET_ACTIONS_BODY GitHub Actions checks completed.",
                    url="https://example.com/204",
                )
            ],
        },
    )


def _stack_input() -> dict:
    return {
        "stack": [
            {"pr_number": 101, "branch": "branch-one", "title": "First", "url": "u1"},
            {"pr_number": 102, "branch": "branch-two", "title": "Second", "url": "u2"},
        ]
    }


def _locator_ref(locator: dict) -> dict:
    return {
        "json_pointer": locator["json_pointer"],
        "item_pointer": locator["item_pointer"],
    }


def _classification_for_prep_pr(prep_pr: dict) -> dict:
    automation_ids = {
        item["comment_id"]
        for item in prep_pr["discussion_triage"]["items"]
        if item["classification_hint"] == "automation"
    }
    return {
        "schema_version": 1,
        "reviews": [],
        "review_threads": [
            {
                "thread_id": thread["thread_id"],
                "disposition": "actionable",
                "thread_item_pointer": thread["item_pointer"],
                "covered_comments": [
                    {
                        "comment_id": comment["id"],
                        "body_locator": _locator_ref(comment["body_locator"]),
                    }
                    for comment in thread["comments"]
                ],
                "summary": "Inline review thread requires a code change.",
                "action_summary": "Apply the requested inline review change.",
                "complexity": "cross_cutting" if prep_pr["pr_number"] == 101 else "local",
            }
            for thread in prep_pr["manifest"]["review_threads"]
        ],
        "discussion_comments": [
            _discussion_classification(comment, automation_ids=automation_ids)
            for comment in prep_pr["manifest"]["discussion_comments"]
        ],
    }


def _discussion_classification(comment: dict, *, automation_ids: set[int]) -> dict:
    if comment["comment_id"] in automation_ids:
        return {
            "comment_id": comment["comment_id"],
            "disposition": "informational",
            "body_locator": _locator_ref(comment["body_locator"]),
            "summary": "Automation status comment.",
            "informational_reason": "automation",
        }
    return {
        "comment_id": comment["comment_id"],
        "disposition": "informational",
        "body_locator": _locator_ref(comment["body_locator"]),
        "summary": "Human FYI discussion comment.",
        "informational_reason": "fyi",
    }


def _run_prep(cli_group: ClinkrGroup, tmp_path: Path) -> dict:
    result = CliRunner().invoke(
        cli_group,
        [
            "exec",
            "stack-feedback-prep",
            "--stack-json",
            json.dumps(_stack_input()),
            "--format",
            "json",
        ],
        obj=_obj(_ctx(_feedback_fake())),
        env=_payload_env(tmp_path),
    )
    assert result.exit_code == 0, result.output
    return json.loads(result.output)["data"]


def test_stack_feedback_prep_writes_payload_summaries_and_triages_automation(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    result = CliRunner().invoke(
        cli_group,
        [
            "exec",
            "stack-feedback-prep",
            "--stack-json",
            json.dumps(_stack_input()),
            "--format",
            "json",
        ],
        obj=_obj(_ctx(_feedback_fake())),
        env=_payload_env(tmp_path),
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)["data"]
    assert data["summary"]["prs"] == 2
    assert data["summary"]["unresolved_review_threads"] == 2
    assert data["summary"]["automation_discussion_comments"] == 3
    assert data["summary"]["discussion_comments_needing_agent_review"] == 0
    assert data["stack"][0]["raw_feedback_reference"]["role"] == "raw"
    assert data["stack"][0]["manifest_summary_reference"]["role"] == "summary"
    assert data["stack"][0]["classification_template_reference"]["role"] == "summary"
    assert data["stack_summary_reference"]["role"] == "summary"
    assert Path(data["stack"][0]["raw_feedback_reference"]["payload_path"]).exists()
    assert Path(data["stack"][0]["manifest_summary_reference"]["payload_path"]).exists()
    assert Path(data["stack_summary_reference"]["payload_path"]).exists()
    assert "SECRET_THREAD_BODY" not in result.output
    assert "SECRET_VERCEL_BODY" not in result.output
    assert "SECRET_ROASTER_BODY" not in result.output
    assert data["stack"][0]["discussion_triage"]["by_reason"] == {
        "vercel_status": 1,
        "roaster_summary": 1,
        "human_like": 1,
    }


def test_stack_feedback_prep_rejects_duplicate_pr_numbers(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    payload = {"stack": [{"pr_number": 101, "branch": "one"}, {"pr_number": 101, "branch": "two"}]}

    result = CliRunner().invoke(
        cli_group,
        [
            "exec",
            "stack-feedback-prep",
            "--stack-json",
            json.dumps(payload),
            "--format",
            "json",
        ],
        obj=_obj(_ctx(_feedback_fake())),
        env=_payload_env(tmp_path),
    )

    assert result.exit_code == 2, result.output
    output = json.loads(result.output)
    assert output["exit_code"] == 2
    assert output["error_type"] == "invalid_request"
    assert "duplicate PR numbers" in output["message"]


def test_stack_feedback_plan_validates_and_merges_stack_plan(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    prep = _run_prep(cli_group, tmp_path)
    classifications = [
        {
            "pr_number": prep_pr["pr_number"],
            "classification": _classification_for_prep_pr(prep_pr),
        }
        for prep_pr in prep["stack"]
    ]

    result = CliRunner().invoke(
        cli_group,
        [
            "exec",
            "stack-feedback-plan",
            "--payload-json",
            json.dumps({"prep": prep, "classifications": classifications}),
            "--format",
            "json",
        ],
        obj=_obj(_ctx(_feedback_fake())),
        env=_payload_env(tmp_path),
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)["data"]
    assert data["valid"] is True
    assert data["validation"]["all_valid"] is True
    assert [batch["batch_id"] for batch in data["batches"]] == ["local", "cross_cutting"]
    local_item = data["batches"][0]["items"][0]
    assert local_item["pr_number"] == 102
    assert local_item["branch"] == "branch-two"
    assert local_item["thread_id"] == "PRRT_102"
    assert local_item["source_batch_id"] == "local"
    approval_item = data["batches"][1]["items"][0]
    assert approval_item["pr_number"] == 101
    assert approval_item["approval_required"] is True
    assert data["automation_discussion_summary"]["automation_like"] == 3
    assert data["summary"]["actionable_items"] == 2
    assert data["summary"]["approval_required_items"] == 1
    assert data["summary"]["informational_items"] == 4
    assert data["decision_docket"][0]["decision_kind"] == "approval_required_action"
    assert data["decision_docket"][0]["thread_id"] == "PRRT_101"
    assert {item["discussion_comment_id"] for item in data["decision_docket"]} == {203, None}
    assert data["stack_plan_reference"]["role"] == "summary"
    assert Path(data["stack_plan_reference"]["payload_path"]).exists()


def test_stack_feedback_plan_returns_negative_for_invalid_classification(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    prep = _run_prep(cli_group, tmp_path)
    classifications = [
        {
            "pr_number": prep_pr["pr_number"],
            "classification": _classification_for_prep_pr(prep_pr),
        }
        for prep_pr in prep["stack"]
    ]
    classifications[0]["classification"]["discussion_comments"] = []

    result = CliRunner().invoke(
        cli_group,
        ["exec", "stack-feedback-plan", "--format", "json"],
        obj=_obj(_ctx(_feedback_fake())),
        env=_payload_env(tmp_path),
        input=json.dumps({"prep": prep, "classifications": classifications}),
    )

    assert result.exit_code == 1, result.output
    output = json.loads(result.output)
    assert output["exit_code"] == 1
    assert output["data"]["valid"] is False
    assert output["data"]["stack_plan_reference"] is None
    assert output["data"]["validation"]["all_valid"] is False
    first_pr_errors = output["data"]["validation"]["per_pr"][0]["errors"]
    assert "missing_discussion_comment" in {error["code"] for error in first_pr_errors}


def test_stack_feedback_plan_rejects_classification_pr_mismatch(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    prep = _run_prep(cli_group, tmp_path)
    classifications = [
        {
            "pr_number": 999,
            "classification": _classification_for_prep_pr(prep["stack"][0]),
        }
    ]

    result = CliRunner().invoke(
        cli_group,
        [
            "exec",
            "stack-feedback-plan",
            "--payload-json",
            json.dumps({"prep": prep, "classifications": classifications}),
            "--format",
            "json",
        ],
        obj=_obj(_ctx(_feedback_fake())),
        env=_payload_env(tmp_path),
    )

    assert result.exit_code == 2, result.output
    output = json.loads(result.output)
    assert output["error_type"] == "invalid_request"
    assert "missing PR numbers" in output["message"]
