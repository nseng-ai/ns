"""Scenario tests for stack resolve-thread payload building."""

from __future__ import annotations

import json

import pytest
from click.testing import CliRunner

from asdl_core.clinkr.context import build_clinkr_context_object
from asdl_core.clinkr.group import ClinkrGroup
from asdl_core.gh.pr_testing import FakePRGateway
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
    informational_items = informational or []
    pr_numbers = {item["pr_number"] for batch in batches for item in batch["items"]} | {
        item["pr_number"] for item in informational_items
    }
    return {
        "valid": True,
        "payload_session_id": "session1",
        "pr_count": len(pr_numbers),
        "validation": {"all_valid": True, "per_pr": []},
        "batches": batches,
        "informational": informational_items,
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
            "informational_items": len(informational_items),
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
) -> None:
    stack_plan = _minimal_stack_feedback_plan(
        batches=[
            _stack_batch("local", [_stack_thread_item(102, "branch-two", "PRRT_102")]),
            _stack_batch(
                "cross_cutting",
                [
                    _stack_thread_item(
                        101,
                        "branch-one",
                        "PRRT_101",
                        source_batch_id="cross_cutting",
                    )
                ],
                complexity="cross_cutting",
            ),
        ]
    )
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
