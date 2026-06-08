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


def _run_stack_plan(cli_group: ClinkrGroup, tmp_path: Path) -> dict:
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
    return json.loads(result.output)["data"]


def _invoke_stack_builder(cli_group: ClinkrGroup, request: dict) -> tuple[int, dict, str]:
    result = CliRunner().invoke(
        cli_group,
        ["exec", "build-stack-resolve-thread-payloads", "--format", "json"],
        obj=_obj(_ctx(FakePRGateway())),
        input=json.dumps(request),
    )
    output = json.loads(result.output) if result.output.strip() else {}
    return result.exit_code, output, result.output


def _minimal_stack_feedback_plan(
    *,
    batches: list[dict],
    informational: list[dict] | None = None,
) -> dict:
    return {
        "valid": True,
        "payload_session_id": "session1",
        "pr_count": 2,
        "validation": {"all_valid": True, "per_pr": []},
        "batches": batches,
        "informational": informational or [],
        "automation_discussion_summary": {
            "automation_like": 0,
            "human_like": 0,
            "needs_agent_review": 0,
            "by_reason": {},
        },
        "decision_docket": [],
        "stack_plan_reference": None,
        "summary": {
            "actionable_items": sum(len(batch["items"]) for batch in batches),
            "approval_required_items": 0,
            "informational_items": len(informational or []),
            "automation_discussion_comments": 0,
        },
    }


def _stack_batch(batch_id: str, items: list[dict], *, complexity: str = "local") -> dict:
    return {
        "batch_id": batch_id,
        "complexity": complexity,
        "approval_required": False,
        "items": items,
    }


def _stack_thread_item(
    pr_number: int,
    branch: str,
    thread_id: str,
    *,
    source_batch_id: str = "local",
) -> dict:
    return {
        "pr_number": pr_number,
        "branch": branch,
        "source_batch_id": source_batch_id,
        "source_kind": "review_thread",
        "summary": f"Thread {thread_id} requires action.",
        "action_summary": f"Address thread {thread_id}.",
        "complexity": source_batch_id,
        "thread_id": thread_id,
    }


def _stack_review_item(pr_number: int, branch: str, review_id: str) -> dict:
    return {
        "pr_number": pr_number,
        "branch": branch,
        "source_batch_id": "local",
        "source_kind": "review",
        "summary": f"Review {review_id} requires action.",
        "action_summary": f"Address review {review_id}.",
        "complexity": "local",
        "review_id": review_id,
    }


def _stack_discussion_item(pr_number: int, branch: str, comment_id: int) -> dict:
    return {
        "pr_number": pr_number,
        "branch": branch,
        "source_batch_id": "local",
        "source_kind": "discussion_comment",
        "summary": f"Discussion comment {comment_id} requires action.",
        "action_summary": f"Address discussion comment {comment_id}.",
        "complexity": "local",
        "discussion_comment_id": comment_id,
    }


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


def test_build_stack_resolve_thread_payloads_builds_one_pr_payload_from_stack_plan(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    stack_plan = _run_stack_plan(cli_group, tmp_path)
    request = {
        "stack_plan": stack_plan,
        "batch_id": "local",
        "commit_sha": "abc1234",
        "continue_on_error": True,
        "decisions": [
            {
                "pr_number": 102,
                "thread_id": "PRRT_102",
                "action": "resolve",
                "mode": "fixed",
                "message": "Fixed in the stack-tip omnibus commit.",
            }
        ],
    }

    exit_code, output, raw_output = _invoke_stack_builder(cli_group, request)

    assert exit_code == 0
    assert output["exit_code"] == 0
    data = output["data"]
    assert data["valid"] is True
    assert data["payloads_ready"] is True
    assert data["review_thread_count"] == 1
    assert data["resolved_thread_count"] == 1
    assert data["payloads"] == [
        {
            "pr_number": 102,
            "branch": "branch-two",
            "title": "Second",
            "url": "u2",
            "batch_id": "local",
            "source_batch_id": "local",
            "payload_ready": True,
            "review_thread_count": 1,
            "resolved_thread_count": 1,
            "skipped_thread_count": 0,
            "ignored_non_thread_items": [],
            "skipped_items": [],
            "payload": {
                "commit_sha": "abc1234",
                "continue_on_error": True,
                "items": [
                    {
                        "thread_id": "PRRT_102",
                        "mode": "fixed",
                        "message": "Fixed in the stack-tip omnibus commit.",
                        "commit_sha": None,
                        "provenance": None,
                    }
                ],
            },
            "warnings": [],
        }
    ]
    assert "SECRET_THREAD_BODY" not in raw_output
    assert "SECRET_VERCEL_BODY" not in raw_output


def test_build_stack_resolve_thread_payloads_builds_multi_pr_payloads(
    cli_group: ClinkrGroup,
) -> None:
    stack_plan = _minimal_stack_feedback_plan(
        batches=[
            _stack_batch(
                "local",
                [
                    _stack_thread_item(101, "branch-one", "PRRT_101"),
                    _stack_thread_item(102, "branch-two", "PRRT_102"),
                ],
            )
        ]
    )
    request = {
        "stack_plan": stack_plan,
        "batch_id": "local",
        "commit_sha": "abc1234",
        "decisions": [
            {
                "pr_number": 101,
                "thread_id": "PRRT_101",
                "action": "resolve",
                "mode": "fixed",
                "message": "Fixed the first PR thread.",
            },
            {
                "pr_number": 102,
                "thread_id": "PRRT_102",
                "action": "resolve",
                "mode": "explained",
                "message": "The second PR thread is already covered by this path.",
            },
        ],
    }

    exit_code, output, _raw_output = _invoke_stack_builder(cli_group, request)

    assert exit_code == 0
    data = output["data"]
    assert data["payloads_ready"] is True
    assert data["review_thread_count"] == 2
    assert data["resolved_thread_count"] == 2
    assert [payload["pr_number"] for payload in data["payloads"]] == [101, 102]
    assert [payload["payload"]["items"][0]["thread_id"] for payload in data["payloads"]] == [
        "PRRT_101",
        "PRRT_102",
    ]


def test_build_stack_resolve_thread_payloads_rejects_missing_decision(
    cli_group: ClinkrGroup,
) -> None:
    stack_plan = _minimal_stack_feedback_plan(
        batches=[
            _stack_batch(
                "local",
                [
                    _stack_thread_item(101, "branch-one", "PRRT_101"),
                    _stack_thread_item(102, "branch-two", "PRRT_102"),
                ],
            )
        ]
    )
    request = {
        "stack_plan": stack_plan,
        "batch_id": "local",
        "commit_sha": "abc1234",
        "decisions": [
            {
                "pr_number": 101,
                "thread_id": "PRRT_101",
                "action": "resolve",
                "mode": "fixed",
                "message": "Fixed the first PR thread.",
            }
        ],
    }

    exit_code, output, _raw_output = _invoke_stack_builder(cli_group, request)

    assert exit_code == 1
    data = output["data"]
    assert data["valid"] is False
    assert data["payloads"] == []
    assert data["errors"] == [
        {
            "code": "missing_thread_decision",
            "message": "Missing explicit resolve or skip decision for PR #102 thread PRRT_102.",
            "batch_id": "local",
            "pr_number": 102,
            "thread_id": "PRRT_102",
            "actual_pr_number": None,
            "actual_batch_id": None,
        }
    ]


def test_build_stack_resolve_thread_payloads_rejects_duplicate_decision(
    cli_group: ClinkrGroup,
) -> None:
    stack_plan = _minimal_stack_feedback_plan(
        batches=[_stack_batch("local", [_stack_thread_item(101, "branch-one", "PRRT_101")])]
    )
    valid_decision = {
        "pr_number": 101,
        "thread_id": "PRRT_101",
        "action": "resolve",
        "mode": "fixed",
        "message": "Fixed the duplicated decision.",
    }
    request = {
        "stack_plan": stack_plan,
        "batch_id": "local",
        "commit_sha": "abc1234",
        "decisions": [valid_decision, valid_decision],
    }

    exit_code, output, _raw_output = _invoke_stack_builder(cli_group, request)

    assert exit_code == 1
    assert [error["code"] for error in output["data"]["errors"]] == ["duplicate_thread_decision"]
    assert output["data"]["payloads"] == []


def test_build_stack_resolve_thread_payloads_rejects_wrong_pr_reference(
    cli_group: ClinkrGroup,
) -> None:
    stack_plan = _minimal_stack_feedback_plan(
        batches=[_stack_batch("local", [_stack_thread_item(101, "branch-one", "PRRT_101")])]
    )
    request = {
        "stack_plan": stack_plan,
        "batch_id": "local",
        "commit_sha": "abc1234",
        "decisions": [
            {
                "pr_number": 102,
                "thread_id": "PRRT_101",
                "action": "resolve",
                "mode": "fixed",
                "message": "Wrong PR number for this thread.",
            }
        ],
    }

    exit_code, output, _raw_output = _invoke_stack_builder(cli_group, request)

    assert exit_code == 1
    error_codes = [error["code"] for error in output["data"]["errors"]]
    assert error_codes == ["thread_pr_mismatch", "missing_thread_decision"]
    mismatch = output["data"]["errors"][0]
    assert mismatch["actual_pr_number"] == 101
    assert mismatch["pr_number"] == 102


def test_build_stack_resolve_thread_payloads_rejects_wrong_batch_reference(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    stack_plan = _run_stack_plan(cli_group, tmp_path)
    request = {
        "stack_plan": stack_plan,
        "batch_id": "local",
        "commit_sha": "abc1234",
        "decisions": [
            {
                "pr_number": 102,
                "thread_id": "PRRT_102",
                "action": "resolve",
                "mode": "fixed",
                "message": "Valid selected-batch decision.",
            },
            {
                "pr_number": 101,
                "thread_id": "PRRT_101",
                "action": "resolve",
                "mode": "fixed",
                "message": "This belongs to the approval batch.",
            },
        ],
    }

    exit_code, output, _raw_output = _invoke_stack_builder(cli_group, request)

    assert exit_code == 1
    assert output["data"]["errors"] == [
        {
            "code": "thread_not_in_selected_batch",
            "message": (
                "Decision for PR #101 thread PRRT_101 belongs to batch 'cross_cutting', "
                "not selected batch 'local'."
            ),
            "batch_id": "local",
            "pr_number": 101,
            "thread_id": "PRRT_101",
            "actual_pr_number": None,
            "actual_batch_id": "cross_cutting",
        }
    ]


def test_build_stack_resolve_thread_payloads_returns_no_payload_for_all_skipped_batch(
    cli_group: ClinkrGroup,
) -> None:
    stack_plan = _minimal_stack_feedback_plan(
        batches=[
            _stack_batch(
                "local",
                [
                    _stack_thread_item(101, "branch-one", "PRRT_101"),
                    _stack_thread_item(102, "branch-two", "PRRT_102"),
                ],
            )
        ]
    )
    request = {
        "stack_plan": stack_plan,
        "batch_id": "local",
        "decisions": [
            {
                "pr_number": 101,
                "thread_id": "PRRT_101",
                "action": "skip",
                "skip_reason": "Deferred by the user.",
            },
            {
                "pr_number": 102,
                "thread_id": "PRRT_102",
                "action": "skip",
                "skip_reason": "No longer relevant.",
            },
        ],
    }

    exit_code, output, _raw_output = _invoke_stack_builder(cli_group, request)

    assert exit_code == 0
    data = output["data"]
    assert data["valid"] is True
    assert data["payloads_ready"] is False
    assert data["resolved_thread_count"] == 0
    assert data["skipped_thread_count"] == 2
    assert [payload["payload_ready"] for payload in data["payloads"]] == [False, False]
    assert [payload["payload"] for payload in data["payloads"]] == [None, None]
    assert "All selected stack review-thread items" in data["warnings"][0]


def test_build_stack_resolve_thread_payloads_supports_mixed_resolution_modes(
    cli_group: ClinkrGroup,
) -> None:
    stack_plan = _minimal_stack_feedback_plan(
        batches=[
            _stack_batch(
                "local",
                [
                    _stack_thread_item(101, "branch-one", "PRRT_fixed"),
                    _stack_thread_item(101, "branch-one", "PRRT_explained"),
                    _stack_thread_item(102, "branch-two", "PRRT_old"),
                ],
            )
        ]
    )
    request = {
        "stack_plan": stack_plan,
        "batch_id": "local",
        "commit_sha": "abc1234",
        "decisions": [
            {
                "pr_number": 101,
                "thread_id": "PRRT_fixed",
                "action": "resolve",
                "mode": "fixed",
                "message": "Fixed in the omnibus commit.",
            },
            {
                "pr_number": 101,
                "thread_id": "PRRT_explained",
                "action": "resolve",
                "mode": "explained",
                "message": "Already covered by the existing contract.",
            },
            {
                "pr_number": 102,
                "thread_id": "PRRT_old",
                "action": "resolve",
                "mode": "pre_existing",
            },
        ],
    }

    exit_code, output, _raw_output = _invoke_stack_builder(cli_group, request)

    assert exit_code == 0
    items_by_pr = {
        payload["pr_number"]: payload["payload"]["items"] for payload in output["data"]["payloads"]
    }
    assert items_by_pr[101] == [
        {
            "thread_id": "PRRT_fixed",
            "mode": "fixed",
            "message": "Fixed in the omnibus commit.",
            "commit_sha": None,
            "provenance": None,
        },
        {
            "thread_id": "PRRT_explained",
            "mode": "explained",
            "message": "Already covered by the existing contract.",
            "commit_sha": None,
            "provenance": None,
        },
    ]
    assert items_by_pr[102] == [
        {
            "thread_id": "PRRT_old",
            "mode": "pre_existing",
            "message": None,
            "commit_sha": None,
            "provenance": None,
        }
    ]


def test_build_stack_resolve_thread_payloads_ignores_non_thread_batch_items(
    cli_group: ClinkrGroup,
) -> None:
    stack_plan = _minimal_stack_feedback_plan(
        batches=[
            _stack_batch(
                "local",
                [
                    _stack_review_item(101, "branch-one", "PRR_1"),
                    _stack_discussion_item(102, "branch-two", 9001),
                ],
            )
        ]
    )
    request = {"stack_plan": stack_plan, "batch_id": "local", "decisions": []}

    exit_code, output, _raw_output = _invoke_stack_builder(cli_group, request)

    assert exit_code == 0
    data = output["data"]
    assert data["valid"] is True
    assert data["payloads_ready"] is False
    assert data["payloads"] == []
    assert data["review_thread_count"] == 0
    assert [item["source_kind"] for item in data["ignored_non_thread_items"]] == [
        "review",
        "discussion_comment",
    ]
    assert "no review-thread items" in data["warnings"][0]


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
