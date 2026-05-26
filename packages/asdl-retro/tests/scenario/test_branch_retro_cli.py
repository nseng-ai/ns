from __future__ import annotations

import json
from pathlib import Path

import pytest
from click.testing import CliRunner

from asdl_core.clinkr.context import ClinkrContextObject, build_clinkr_context_object
from asdl_core.clinkr.group import ClinkrGroup
from asdl_core.git.testing import FakeGitGateway
from asdl_core.git.types import DetachedHead
from asdl_core.sessions.testing import FakeSessionSource
from asdl_core.sessions.types import (
    ParsedSession,
    SessionAssociation,
    SessionCommandExecution,
    SessionMessageCounts,
    SessionModelEvent,
    SessionSourceInfo,
    SessionSourceRef,
    SessionToolCall,
    SessionToolResult,
    SessionUsage,
    SessionWarning,
)
from asdl_retro.context import BranchRetroCliContext
from asdl_retro.main import build_cli


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


def test_branch_retro_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["-h"])

    assert result.exit_code == 0
    assert "Usage: branch-retro" in result.output
    assert "Branch session retrospective evidence operations." in result.output
    assert "--version" in result.output
    assert "exec" not in result.output


def test_branch_retro_version(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["--version"])

    assert result.exit_code == 0
    assert "version" in result.output.lower()


def test_branch_retro_exec_is_hidden_but_invocable(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["exec", "--help"])

    assert result.exit_code == 0
    assert "Usage: branch-retro exec" in result.output
    assert "Commands for use by branch retrospective skills." in result.output


def test_branch_retro_exec_lists_collect_evidence_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["exec", "collect-evidence", "--help"])

    assert result.exit_code == 0
    assert "Usage: branch-retro exec collect-evidence" in result.output
    for option in ("--repo", "--branch", "--session-root", "--max-sessions", "--format"):
        assert option in result.output


def test_collect_evidence_returns_json_from_fake_session_source(cli_group: ClinkrGroup) -> None:
    repo_root = Path("/repo")
    source = FakeSessionSource(sessions=(_sample_session(repo_root),))
    git = FakeGitGateway(
        repo_root=repo_root,
        current_branch_by_path={repo_root: "feature/retro"},
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "collect-evidence", "--repo", str(repo_root), "--format", "json"],
        obj=_obj(BranchRetroCliContext(git_gateway=git, session_source=source)),
    )

    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    assert payload["exit_code"] == 0
    data = payload["data"]
    assert data["success"] is True
    assert data["error"] is None
    assert data["repo"]["repo_root"] == "/repo"
    assert data["repo"]["branch"] == "feature/retro"
    assert data["repo"]["branch_source"] == "git_current_branch"
    assert data["query"] == {
        "repo_root": "/repo",
        "session_root": None,
        "max_sessions": 20,
    }
    assert data["source"] == {
        "harness": "fake",
        "adapter_name": "fake",
        "record_format": "memory",
    }
    assert data["aggregate_metrics"]["session_count"] == 1
    assert data["aggregate_metrics"]["message_counts"]["user"] == 1
    assert data["aggregate_metrics"]["tool_call_count"] == 1
    assert data["sessions"][0]["session_id"] == "s1"
    assert data["sessions"][0]["source_ref"]["path"] == "/tmp/sessions/s1.jsonl"
    assert data["warnings"] == []
    assert data["evidence_items"] == [
        {
            "kind": "tool_usage_count",
            "subject": "read",
            "summary": "read called 1 time across 1 session",
            "count": 1,
            "session_count": 1,
            "source_refs": [{"path": "/tmp/sessions/s1.jsonl", "uri": None, "line_number": 2}],
            "metadata": {},
        }
    ]


def test_collect_evidence_includes_factual_items_without_raw_outputs(
    cli_group: ClinkrGroup,
) -> None:
    repo_root = Path("/repo")
    source = FakeSessionSource(sessions=(_evidence_session(repo_root),))
    git = FakeGitGateway(
        repo_root=repo_root,
        current_branch_by_path={repo_root: "feature/retro"},
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "collect-evidence", "--repo", str(repo_root), "--format", "json"],
        obj=_obj(BranchRetroCliContext(git_gateway=git, session_source=source)),
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)["data"]
    evidence_items = data["evidence_items"]
    evidence_kinds = {item["kind"] for item in evidence_items}
    assert evidence_kinds == {
        "tool_usage_count",
        "failed_tool_result",
        "repeated_file_read",
        "repeated_shell_command",
        "token_usage_observed",
        "large_output_observed",
    }
    failed_tool = _single_item(evidence_items, "failed_tool_result")
    assert failed_tool["subject"] == "read"
    assert failed_tool["metadata"] == {"error_message_count": 1}
    assert "SECRET_TOOL_OUTPUT_TEXT" not in json.dumps(data)
    assert "SECRET_COMMAND_OUTPUT_TEXT" not in json.dumps(data)


def test_collect_evidence_passes_query_to_session_source(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    repo_root = Path("/repo")
    session_root = tmp_path / "sessions"
    source = FakeSessionSource()
    git = FakeGitGateway(repo_root=repo_root)

    result = CliRunner().invoke(
        cli_group,
        [
            "exec",
            "collect-evidence",
            "--repo",
            str(repo_root),
            "--branch",
            "feature/explicit",
            "--session-root",
            str(session_root),
            "--max-sessions",
            "7",
            "--format",
            "json",
        ],
        obj=_obj(BranchRetroCliContext(git_gateway=git, session_source=source)),
    )

    assert result.exit_code == 0, result.output
    assert len(source.queries) == 1
    query = source.queries[0]
    assert query.repo_root == repo_root
    assert query.session_root == session_root
    assert query.max_sessions == 7


def test_collect_evidence_uses_explicit_branch_without_graphite_or_stack_metadata(
    cli_group: ClinkrGroup,
) -> None:
    repo_root = Path("/repo")
    source = FakeSessionSource(sessions=(_sample_session(repo_root),))
    git = FakeGitGateway(repo_root=repo_root)

    result = CliRunner().invoke(
        cli_group,
        [
            "exec",
            "collect-evidence",
            "--repo",
            str(repo_root),
            "--branch",
            "feature/manual",
            "--format",
            "json",
        ],
        obj=_obj(BranchRetroCliContext(git_gateway=git, session_source=source)),
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)["data"]
    assert data["repo"] == {
        "repo_root": "/repo",
        "cwd": str(Path.cwd()),
        "branch": "feature/manual",
        "branch_source": "explicit",
    }
    assert set(data["repo"]) == {"repo_root", "cwd", "branch", "branch_source"}
    assert data["sessions"][0]["association"]["branch"] is None


def test_collect_evidence_missing_session_root_warning_is_success(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    repo_root = Path("/repo")
    warning = SessionWarning(
        code="session_root_missing",
        message="session root is missing",
        source_ref=SessionSourceRef(path=tmp_path / "missing"),
        harness="pi",
        adapter_name="pi_jsonl",
    )
    source = FakeSessionSource(
        source_info=SessionSourceInfo(harness="pi", adapter_name="pi_jsonl", record_format="jsonl"),
        warnings=(warning,),
    )
    git = FakeGitGateway(
        repo_root=repo_root,
        current_branch_by_path={repo_root: "feature/retro"},
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "collect-evidence", "--repo", str(repo_root), "--format", "json"],
        obj=_obj(BranchRetroCliContext(git_gateway=git, session_source=source)),
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)["data"]
    assert data["success"] is True
    assert data["aggregate_metrics"]["session_count"] == 0
    assert data["aggregate_metrics"]["warning_count"] == 1
    assert data["warnings"][0]["code"] == "session_root_missing"
    assert data["warnings"][0]["source_ref"]["path"] == str(tmp_path / "missing")


def test_collect_evidence_detached_head_without_branch_is_negative(cli_group: ClinkrGroup) -> None:
    repo_root = Path("/repo")
    source = FakeSessionSource()
    git = FakeGitGateway(
        repo_root=repo_root,
        current_branch_by_path={repo_root: DetachedHead()},
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "collect-evidence", "--repo", str(repo_root), "--format", "json"],
        obj=_obj(BranchRetroCliContext(git_gateway=git, session_source=source)),
    )

    assert result.exit_code == 1
    payload = json.loads(result.output)
    assert payload["exit_code"] == 1
    assert "pass --branch" in payload["message"]
    data = payload["data"]
    assert data["success"] is False
    assert data["error"]["code"] == "detached_head"
    assert data["repo"]["branch"] is None
    assert data["repo"]["branch_source"] == "detached"
    assert data["sessions"] == []
    assert source.queries == ()


def test_collect_evidence_not_a_git_repo_is_negative(cli_group: ClinkrGroup) -> None:
    source = FakeSessionSource()
    git = FakeGitGateway(repo_root=Path("/repo"), git_common_dir=None)

    result = CliRunner().invoke(
        cli_group,
        ["exec", "collect-evidence", "--repo", "/not-a-repo", "--format", "json"],
        obj=_obj(BranchRetroCliContext(git_gateway=git, session_source=source)),
    )

    assert result.exit_code == 1
    data = json.loads(result.output)["data"]
    assert data["success"] is False
    assert data["error"]["code"] == "not_a_git_repo"
    assert data["repo"]["repo_root"] is None
    assert data["sessions"] == []
    assert source.queries == ()


def _obj(context: BranchRetroCliContext) -> ClinkrContextObject:
    return build_clinkr_context_object(lambda: context)


def _sample_session(repo_root: Path) -> ParsedSession:
    return ParsedSession(
        source_info=SessionSourceInfo(harness="fake", adapter_name="fake", record_format="memory"),
        source_ref=SessionSourceRef(path=Path("/tmp/sessions/s1.jsonl")),
        session_id="s1",
        started_at_iso="2026-01-01T00:00:00Z",
        ended_at_iso="2026-01-01T00:01:00Z",
        association=SessionAssociation(
            repo_root=repo_root,
            cwd=repo_root,
            branch=None,
            confidence="repo_cwd",
            evidence=("query.repo_root", "session_header.cwd"),
        ),
        message_counts=SessionMessageCounts(user=1, assistant=1),
        model_events=(SessionModelEvent(provider="fake", model="model"),),
        tool_calls=(
            SessionToolCall(
                call_id="call-1",
                tool_name="read",
                argument_keys=("path",),
                source_ref=SessionSourceRef(path=Path("/tmp/sessions/s1.jsonl"), line_number=2),
            ),
        ),
        tool_results=(),
        command_executions=(),
        usage_events=(),
        warnings=(),
    )


def _evidence_session(repo_root: Path) -> ParsedSession:
    source_path = Path("/tmp/sessions/s2.jsonl")
    return ParsedSession(
        source_info=SessionSourceInfo(harness="fake", adapter_name="fake", record_format="memory"),
        source_ref=SessionSourceRef(path=source_path),
        session_id="s2",
        started_at_iso="2026-01-01T00:00:00Z",
        ended_at_iso="2026-01-01T00:01:00Z",
        association=SessionAssociation(
            repo_root=repo_root,
            cwd=repo_root,
            branch=None,
            confidence="repo_cwd",
            evidence=("query.repo_root", "session_header.cwd"),
        ),
        message_counts=SessionMessageCounts(user=1, assistant=1, tool_result=1),
        model_events=(),
        tool_calls=(
            SessionToolCall(
                call_id="read-1",
                tool_name="read",
                argument_keys=("path",),
                source_ref=SessionSourceRef(path=source_path, line_number=2),
                path="packages/foo.py",
            ),
            SessionToolCall(
                call_id="read-2",
                tool_name="read",
                argument_keys=("path",),
                source_ref=SessionSourceRef(path=source_path, line_number=3),
                path="packages/foo.py",
            ),
            SessionToolCall(
                call_id="bash-1",
                tool_name="bash",
                argument_keys=("command",),
                source_ref=SessionSourceRef(path=source_path, line_number=4),
                command="just test",
            ),
        ),
        tool_results=(
            SessionToolResult(
                tool_call_id="read-1",
                tool_name="read",
                is_error=True,
                error_message="SECRET_TOOL_OUTPUT_TEXT",
                text_length=25_000,
                line_count=300,
                truncated=True,
                source_ref=SessionSourceRef(path=source_path, line_number=5),
            ),
        ),
        command_executions=(
            SessionCommandExecution(
                command="just test",
                exit_code=0,
                cancelled=False,
                truncated=False,
                output_length=30_000,
                line_count=4,
                source_ref=SessionSourceRef(path=source_path, line_number=6),
            ),
        ),
        usage_events=(
            SessionUsage(
                input_tokens=10,
                output_tokens=5,
                cache_read_tokens=None,
                cache_write_tokens=None,
                total_tokens=15,
                source_ref=SessionSourceRef(path=source_path, line_number=7),
            ),
        ),
        warnings=(),
    )


def _single_item(
    evidence_items: list[dict[str, object]],
    kind: str,
) -> dict[str, object]:
    matches = [item for item in evidence_items if item["kind"] == kind]
    assert len(matches) == 1
    return matches[0]
