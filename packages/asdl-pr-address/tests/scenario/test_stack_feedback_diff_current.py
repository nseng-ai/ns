"""Scenario tests for stack feedback current-diff exec operation."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from click.testing import CliRunner

from asdl_core.clinkr.context import build_clinkr_context_object
from asdl_core.clinkr.group import ClinkrGroup
from asdl_core.gh.pr_testing import FakePRGateway
from asdl_core.gh.types import PRReviewComment, PRReviewThread
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


def _stack_input(pr_numbers: tuple[int, ...] = (101, 102)) -> dict:
    return {
        "stack": [
            {
                "pr_number": pr_number,
                "branch": f"branch-{pr_number}",
                "title": f"PR {pr_number}",
                "url": f"https://example.com/{pr_number}",
            }
            for pr_number in pr_numbers
        ]
    }


def _thread(
    thread_id: str,
    *,
    comment_id: int,
    path: str = "packages/example.py",
    line: int | None = 12,
    start_line: int | None = 10,
    is_resolved: bool = False,
    is_outdated: bool = False,
) -> PRReviewThread:
    return PRReviewThread(
        id=thread_id,
        path=path,
        line=line,
        start_line=start_line,
        is_resolved=is_resolved,
        is_outdated=is_outdated,
        comments=(
            PRReviewComment(
                id=comment_id,
                body=f"SECRET_THREAD_BODY {thread_id} please update this helper.",
                author="reviewer",
                path=path,
                line=line,
                start_line=start_line,
                created_at="2026-05-23T00:00:00Z",
            ),
        ),
    )


def _feedback_fake(
    review_threads: dict[int, list[PRReviewThread]] | None = None,
) -> FakePRGateway:
    return FakePRGateway(review_threads=review_threads or {})


def _run_current_prep(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    fake: FakePRGateway,
    *,
    pr_numbers: tuple[int, ...] = (101, 102),
    include_resolved: bool = True,
) -> dict:
    args = [
        "exec",
        "stack-feedback-prep",
        "--stack-json",
        json.dumps(_stack_input(pr_numbers)),
        "--format",
        "json",
    ]
    if include_resolved:
        args.insert(2, "--include-resolved")
    result = CliRunner().invoke(
        cli_group,
        args,
        obj=_obj(_ctx(fake)),
        env=_payload_env(tmp_path),
    )
    assert result.exit_code == 0, result.output
    assert "SECRET_THREAD_BODY" not in result.output
    return json.loads(result.output)["data"]


def _invoke_diff(
    cli_group: ClinkrGroup,
    stack_plan: dict,
    current_prep: dict,
) -> tuple[int, dict, str]:
    result = CliRunner().invoke(
        cli_group,
        ["exec", "stack-feedback-diff-current", "--format", "json"],
        obj=_obj(_ctx(FakePRGateway())),
        input=json.dumps({"stack_plan": stack_plan, "current_prep": current_prep}),
    )
    output = json.loads(result.output) if result.output.strip() else {}
    return result.exit_code, output, result.output


def _minimal_stack_feedback_plan(
    *,
    batches: list[dict],
    informational: list[dict] | None = None,
    planned_pr_numbers: tuple[int, ...] | None = None,
) -> dict:
    informational_items = informational or []
    derived_pr_numbers = tuple(
        dict.fromkeys(
            [item["pr_number"] for batch in batches for item in batch["items"]]
            + [item["pr_number"] for item in informational_items]
        )
    )
    pr_numbers = planned_pr_numbers or derived_pr_numbers
    return {
        "valid": True,
        "payload_session_id": "session1",
        "pr_count": len(pr_numbers),
        "validation": {
            "all_valid": True,
            "per_pr": [
                {"pr_number": pr_number, "valid": True, "counts": {}, "errors": []}
                for pr_number in pr_numbers
            ],
        },
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
    thread_id: str,
    *,
    source_batch_id: str = "local",
    path: str = "packages/example.py",
    line: int | None = 12,
    start_line: int | None = 10,
    is_outdated: bool = False,
) -> dict:
    return {
        "pr_number": pr_number,
        "branch": f"branch-{pr_number}",
        "title": f"PR {pr_number}",
        "url": f"https://example.com/{pr_number}",
        "source_batch_id": source_batch_id,
        "source_kind": "review_thread",
        "summary": f"Thread {thread_id} requires action.",
        "action_summary": f"Address thread {thread_id}.",
        "complexity": source_batch_id,
        "thread_id": thread_id,
        "path": path,
        "line": line,
        "start_line": start_line,
        "is_outdated": is_outdated,
    }


def _informational_thread_item(
    pr_number: int,
    thread_id: str,
    *,
    path: str = "packages/example.py",
) -> dict:
    return {
        "pr_number": pr_number,
        "branch": f"branch-{pr_number}",
        "title": f"PR {pr_number}",
        "url": f"https://example.com/{pr_number}",
        "source_kind": "review_thread",
        "summary": f"Thread {thread_id} is informational.",
        "informational_reason": "not_actionable",
        "user_decision_required": False,
        "thread_id": thread_id,
        "path": path,
        "line": 12,
        "start_line": 10,
        "is_outdated": False,
    }


def test_stack_feedback_diff_current_allows_unchanged_stack_feedback(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    fake = _feedback_fake(
        {
            101: [_thread("PRRT_101", comment_id=1001)],
            102: [_thread("PRRT_102", comment_id=1002)],
        }
    )
    current_prep = _run_current_prep(cli_group, tmp_path, fake)
    stack_plan = _minimal_stack_feedback_plan(
        batches=[
            _stack_batch(
                "local",
                [
                    _stack_thread_item(101, "PRRT_101"),
                    _stack_thread_item(102, "PRRT_102"),
                ],
            )
        ]
    )

    exit_code, output, raw_output = _invoke_diff(cli_group, stack_plan, current_prep)

    assert exit_code == 0
    data = output["data"]
    assert data["safe_to_resolve_planned"] is True
    assert [item["thread_id"] for item in data["planned_still_unresolved"]] == [
        "PRRT_101",
        "PRRT_102",
    ]
    assert data["planned_already_resolved"] == []
    assert data["new_unresolved_threads"] == []
    assert data["missing_or_outdated_planned_threads"] == []
    assert data["summary"]["planned_actionable_review_threads"] == 2
    assert "SECRET_THREAD_BODY" not in raw_output


def test_stack_feedback_diff_current_detects_new_unresolved_threads(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    fake = _feedback_fake(
        {
            101: [
                _thread("PRRT_101", comment_id=1001),
                _thread("PRRT_101_NEW", comment_id=1002, path="packages/new.py", line=8),
            ]
        }
    )
    current_prep = _run_current_prep(cli_group, tmp_path, fake, pr_numbers=(101,))
    stack_plan = _minimal_stack_feedback_plan(
        batches=[_stack_batch("local", [_stack_thread_item(101, "PRRT_101")])]
    )

    exit_code, output, raw_output = _invoke_diff(cli_group, stack_plan, current_prep)

    assert exit_code == 1
    data = output["data"]
    assert data["safe_to_resolve_planned"] is False
    assert data["new_unresolved_threads"] == [
        {
            "pr_number": 101,
            "branch": "branch-101",
            "title": "PR 101",
            "url": "https://example.com/101",
            "thread_id": "PRRT_101_NEW",
            "path": "packages/new.py",
            "line": 8,
            "start_line": 10,
            "is_outdated": False,
            "comment_count": 1,
        }
    ]
    assert "SECRET_THREAD_BODY" not in raw_output


def test_stack_feedback_diff_current_detects_already_resolved_planned_threads(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    fake = _feedback_fake({101: [_thread("PRRT_101", comment_id=1001, is_resolved=True)]})
    current_prep = _run_current_prep(cli_group, tmp_path, fake, pr_numbers=(101,))
    stack_plan = _minimal_stack_feedback_plan(
        batches=[_stack_batch("local", [_stack_thread_item(101, "PRRT_101")])]
    )

    exit_code, output, _raw_output = _invoke_diff(cli_group, stack_plan, current_prep)

    assert exit_code == 1
    data = output["data"]
    assert data["safe_to_resolve_planned"] is False
    assert [item["thread_id"] for item in data["planned_already_resolved"]] == ["PRRT_101"]


def test_stack_feedback_diff_current_detects_missing_planned_threads(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    current_prep = _run_current_prep(
        cli_group,
        tmp_path,
        _feedback_fake({101: []}),
        pr_numbers=(101,),
    )
    stack_plan = _minimal_stack_feedback_plan(
        batches=[_stack_batch("local", [_stack_thread_item(101, "PRRT_101")])]
    )

    exit_code, output, _raw_output = _invoke_diff(cli_group, stack_plan, current_prep)

    assert exit_code == 1
    data = output["data"]
    assert data["missing_or_outdated_planned_threads"][0]["thread_id"] == "PRRT_101"
    assert data["missing_or_outdated_planned_threads"][0]["reason"] == "missing_current_thread"


def test_stack_feedback_diff_current_detects_outdated_or_metadata_changed_planned_threads(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    fake = _feedback_fake(
        {
            101: [
                _thread(
                    "PRRT_101",
                    comment_id=1001,
                    path="packages/renamed.py",
                    is_outdated=True,
                )
            ]
        }
    )
    current_prep = _run_current_prep(cli_group, tmp_path, fake, pr_numbers=(101,))
    stack_plan = _minimal_stack_feedback_plan(
        batches=[_stack_batch("local", [_stack_thread_item(101, "PRRT_101")])]
    )

    exit_code, output, _raw_output = _invoke_diff(cli_group, stack_plan, current_prep)

    assert exit_code == 1
    item = output["data"]["missing_or_outdated_planned_threads"][0]
    assert item["thread_id"] == "PRRT_101"
    assert item["reason"] == "outdated_changed"
    assert set(item["changed_fields"]) == {"path", "is_outdated"}


def test_stack_feedback_diff_current_handles_mixed_multi_pr_drift(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    fake = _feedback_fake(
        {
            101: [_thread("PRRT_101", comment_id=1001)],
            102: [_thread("PRRT_102", comment_id=1002, is_resolved=True)],
            103: [_thread("PRRT_103_NEW", comment_id=1003)],
        }
    )
    current_prep = _run_current_prep(cli_group, tmp_path, fake, pr_numbers=(101, 102, 103))
    stack_plan = _minimal_stack_feedback_plan(
        batches=[
            _stack_batch(
                "local",
                [
                    _stack_thread_item(101, "PRRT_101"),
                    _stack_thread_item(102, "PRRT_102"),
                    _stack_thread_item(103, "PRRT_103_MISSING"),
                ],
            )
        ]
    )

    exit_code, output, _raw_output = _invoke_diff(cli_group, stack_plan, current_prep)

    assert exit_code == 1
    data = output["data"]
    assert [item["thread_id"] for item in data["planned_still_unresolved"]] == ["PRRT_101"]
    assert [item["thread_id"] for item in data["planned_already_resolved"]] == ["PRRT_102"]
    assert [item["thread_id"] for item in data["new_unresolved_threads"]] == ["PRRT_103_NEW"]
    assert [item["thread_id"] for item in data["missing_or_outdated_planned_threads"]] == [
        "PRRT_103_MISSING"
    ]
    assert data["summary"] == {
        "pr_count": 3,
        "planned_actionable_review_threads": 3,
        "planned_known_review_threads": 3,
        "current_unresolved_review_threads": 2,
        "planned_still_unresolved": 1,
        "planned_already_resolved": 1,
        "new_unresolved_threads": 1,
        "missing_or_outdated_planned_threads": 1,
    }


def test_stack_feedback_diff_current_requires_include_resolved_current_prep(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    fake = _feedback_fake({101: [_thread("PRRT_101", comment_id=1001)]})
    current_prep = _run_current_prep(
        cli_group,
        tmp_path,
        fake,
        pr_numbers=(101,),
        include_resolved=False,
    )
    stack_plan = _minimal_stack_feedback_plan(
        batches=[_stack_batch("local", [_stack_thread_item(101, "PRRT_101")])]
    )

    exit_code, output, _raw_output = _invoke_diff(cli_group, stack_plan, current_prep)

    assert exit_code == 1
    data = output["data"]
    assert data["safe_to_resolve_planned"] is False
    assert data["warnings"] == [
        "current_prep was not fetched with include_resolved=true; already-resolved planned "
        "threads cannot be distinguished from missing threads."
    ]


def test_stack_feedback_diff_current_rejects_pr_mismatch(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    fake = _feedback_fake(
        {
            101: [_thread("PRRT_101", comment_id=1001)],
            102: [_thread("PRRT_102_NEW", comment_id=1002)],
        }
    )
    current_prep = _run_current_prep(cli_group, tmp_path, fake, pr_numbers=(101, 102))
    stack_plan = _minimal_stack_feedback_plan(
        batches=[_stack_batch("local", [_stack_thread_item(101, "PRRT_101")])],
        planned_pr_numbers=(101,),
    )

    exit_code, output, _raw_output = _invoke_diff(cli_group, stack_plan, current_prep)

    assert exit_code == 1
    data = output["data"]
    assert data["valid"] is False
    assert data["safe_to_resolve_planned"] is False
    assert data["errors"] == [
        {
            "code": "unknown_current_pr",
            "message": "current_prep contains PR #102 not present in stack_plan.",
            "pr_number": 102,
            "thread_id": None,
        }
    ]
    assert data["planned_still_unresolved"] == []
    assert data["planned_already_resolved"] == []
    assert data["new_unresolved_threads"] == []
    assert data["missing_or_outdated_planned_threads"] == []
    assert data["summary"]["planned_still_unresolved"] == 0
    assert data["summary"]["new_unresolved_threads"] == 0


def test_stack_feedback_diff_current_ignores_planned_informational_threads_as_new_unresolved(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    fake = _feedback_fake(
        {
            101: [
                _thread("PRRT_101", comment_id=1001),
                _thread("PRRT_101_INFO", comment_id=1002),
            ]
        }
    )
    current_prep = _run_current_prep(cli_group, tmp_path, fake, pr_numbers=(101,))
    stack_plan = _minimal_stack_feedback_plan(
        batches=[_stack_batch("local", [_stack_thread_item(101, "PRRT_101")])],
        informational=[_informational_thread_item(101, "PRRT_101_INFO")],
    )

    exit_code, output, _raw_output = _invoke_diff(cli_group, stack_plan, current_prep)

    assert exit_code == 0
    data = output["data"]
    assert data["safe_to_resolve_planned"] is True
    assert data["new_unresolved_threads"] == []
    assert data["summary"]["planned_known_review_threads"] == 2
