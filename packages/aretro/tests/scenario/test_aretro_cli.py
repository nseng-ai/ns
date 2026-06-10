from __future__ import annotations

import json
from pathlib import Path

import pytest
from click.testing import CliRunner

from aretro.context import AretroCliContext
from aretro.main import build_cli
from asdl_core.clinkr.context import ClinkrContextObject, build_clinkr_context_object
from asdl_core.clinkr.group import ClinkrGroup
from asdl_core.git.testing import FakeGitGateway
from asdl_core.git.types import DetachedHead
from asdl_core.payloads.store import PayloadStore
from asdl_core.sessions.adapters.pi_jsonl import PiJsonlSessionSource
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


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


def test_aretro_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["-h"])

    assert result.exit_code == 0
    assert "Usage: aretro" in result.output
    assert "Branch session retrospective evidence operations." in result.output
    assert "--version" in result.output
    assert "exec" not in result.output


def test_aretro_version(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["--version"])

    assert result.exit_code == 0
    assert "version" in result.output.lower()


def test_aretro_runtime(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["--runtime"])

    assert result.exit_code == 0
    assert result.output == "runtime: python\nentry_point: aretro.main:main\n"


def test_aretro_exec_is_hidden_but_invocable(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["exec", "--help"])

    assert result.exit_code == 0
    assert "Usage: aretro exec" in result.output
    assert "Commands for use by branch retrospective skills." in result.output
    assert "collect-evidence" in result.output
    assert "read-evidence-detail" in result.output


def test_aretro_exec_lists_collect_evidence_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["exec", "collect-evidence", "--help"])

    assert result.exit_code == 0
    assert "Usage: aretro exec collect-evidence" in result.output
    for option in (
        "--repo",
        "--branch",
        "--session-root",
        "--max-sessions",
        "--payload-mode",
        "--payload-session-id",
        "--format",
    ):
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
        obj=_obj(AretroCliContext(git_gateway=git, session_source=source)),
        env={"ASDL_PAYLOAD_SESSION_ID": ""},
    )

    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    assert payload["exit_code"] == 0
    data = payload["data"]
    _assert_collect_evidence_data_contract(data)
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
    session = data["sessions"][0]
    _assert_session_summary_contract(session)
    assert session["session_id"] == "s1"
    assert session["source_ref"]["path"] == "/tmp/sessions/s1.jsonl"
    assert data["warnings"] == []
    evidence_item = data["evidence_items"][0]
    _assert_evidence_item_contract(evidence_item)
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
        obj=_obj(AretroCliContext(git_gateway=git, session_source=source)),
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


def test_collect_evidence_payload_mode_writes_detail_artifact(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    data, raw_payload = _collect_payload_evidence(cli_group, tmp_path)

    _assert_collect_evidence_payload_data_contract(data)
    assert data["payload_mode"] == "payload"
    payload_reference = data["payload_reference"]
    assert payload_reference["role"] == "raw"
    assert payload_reference["descriptor"] == "aretro-collect-evidence"
    payload_path = Path(payload_reference["payload_path"])
    assert payload_path.exists()
    assert payload_path.name.endswith(".raw.json")
    assert data["detail_locator_hints"]["sessions"] == "/data/sessions"
    assert data["aggregate_metrics"]["session_count"] == 1
    assert data["evidence_items"]

    assert raw_payload["exit_code"] == 0
    detail = raw_payload["data"]
    assert detail["schema_version"] == 1
    detail_session = detail["sessions"][0]
    assert detail_session["session_id"] == "s2"
    assert detail_session["tool_calls"][0]["tool_name"] == "read"
    assert detail_session["tool_results"][0]["has_error_message"] is True
    assert "error_message" not in detail_session["tool_results"][0]
    assert detail_session["command_executions"][0]["command_subject"] == "just test"
    assert "SECRET_TOOL_OUTPUT_TEXT" not in json.dumps(raw_payload)
    assert "SECRET_COMMAND_OUTPUT_TEXT" not in json.dumps(raw_payload)


def test_collect_evidence_payload_mode_missing_session_fails_before_query(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    repo_root = Path("/repo")
    source = FakeSessionSource(sessions=(_evidence_session(repo_root),))
    git = FakeGitGateway(
        repo_root=repo_root,
        current_branch_by_path={repo_root: "feature/retro"},
    )

    result = CliRunner().invoke(
        cli_group,
        [
            "exec",
            "collect-evidence",
            "--repo",
            str(repo_root),
            "--payload-mode",
            "payload",
            "--format",
            "json",
        ],
        obj=_obj(AretroCliContext(git_gateway=git, session_source=source)),
        env={"ASDL_PAYLOAD_ROOT": str(tmp_path / "payload-root"), "ASDL_PAYLOAD_SESSION_ID": ""},
    )

    assert result.exit_code == 2
    payload = json.loads(result.output)
    assert payload["exit_code"] == 2
    assert payload["error_type"] == "payload_session_required"
    assert "data" not in payload
    assert source.queries == ()


def test_collect_evidence_payload_mode_invalid_session_fails_before_query(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    repo_root = Path("/repo")
    source = FakeSessionSource(sessions=(_evidence_session(repo_root),))
    git = FakeGitGateway(
        repo_root=repo_root,
        current_branch_by_path={repo_root: "feature/retro"},
    )

    result = CliRunner().invoke(
        cli_group,
        [
            "exec",
            "collect-evidence",
            "--repo",
            str(repo_root),
            "--payload-mode",
            "payload",
            "--payload-session-id",
            "BadSession",
            "--format",
            "json",
        ],
        obj=_obj(AretroCliContext(git_gateway=git, session_source=source)),
        env={"ASDL_PAYLOAD_ROOT": str(tmp_path / "payload-root")},
    )

    assert result.exit_code == 2
    payload = json.loads(result.output)
    assert payload["exit_code"] == 2
    assert payload["error_type"] == "payload_session_invalid"
    assert "data" not in payload
    assert source.queries == ()


def test_read_evidence_detail_reads_selected_value(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    data, _raw_payload = _collect_payload_evidence(cli_group, tmp_path)
    payload_path = data["payload_reference"]["payload_path"]

    result = CliRunner().invoke(
        cli_group,
        [
            "exec",
            "read-evidence-detail",
            "--payload-path",
            payload_path,
            "--json-pointer",
            "/data/sessions/0/tool_calls/0",
            "--format",
            "json",
        ],
        obj=_empty_obj(),
    )

    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    assert payload["exit_code"] == 0
    assert payload["data"]["json_pointer"] == "/data/sessions/0/tool_calls/0"
    assert payload["data"]["value"]["tool_name"] == "read"


def test_read_evidence_detail_allows_data_root_and_rejects_outside_data(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    data, _raw_payload = _collect_payload_evidence(cli_group, tmp_path)
    payload_path = data["payload_reference"]["payload_path"]

    ok_result = CliRunner().invoke(
        cli_group,
        [
            "exec",
            "read-evidence-detail",
            "--payload-path",
            payload_path,
            "--json-pointer",
            "/data",
            "--format",
            "json",
        ],
        obj=_empty_obj(),
    )
    assert ok_result.exit_code == 0, ok_result.output
    assert json.loads(ok_result.output)["data"]["value"]["schema_version"] == 1

    for invalid_pointer in ("", "/exit_code", "/message", "/datax"):
        result = CliRunner().invoke(
            cli_group,
            [
                "exec",
                "read-evidence-detail",
                "--payload-path",
                payload_path,
                "--json-pointer",
                invalid_pointer,
                "--format",
                "json",
            ],
            obj=_empty_obj(),
        )
        assert result.exit_code == 2
        payload = json.loads(result.output)
        assert payload["exit_code"] == 2
        assert payload["error_type"] == "invalid_request"


def test_read_evidence_detail_rejects_malformed_non_success_and_non_raw_payloads(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    non_success_path = _write_payload_artifact(
        tmp_path,
        session_id="aretro-bad-session",
        role="raw",
        payload={"exit_code": 2, "data": {"schema_version": 1}},
    )
    summary_path = _write_payload_artifact(
        tmp_path,
        session_id="aretro-summary-session",
        role="summary",
        payload={"exit_code": 0, "data": {"schema_version": 1}},
    )
    unsupported_schema_path = _write_payload_artifact(
        tmp_path,
        session_id="aretro-unsupported-session",
        role="raw",
        payload={"exit_code": 0, "data": {"schema_version": 2}},
    )

    for payload_path in (non_success_path, summary_path, unsupported_schema_path):
        result = CliRunner().invoke(
            cli_group,
            [
                "exec",
                "read-evidence-detail",
                "--payload-path",
                str(payload_path),
                "--json-pointer",
                "/data",
                "--format",
                "json",
            ],
            obj=_empty_obj(),
        )
        assert result.exit_code == 2
        payload = json.loads(result.output)
        assert payload["exit_code"] == 2
        assert payload["error_type"] == "payload_lookup_failed"


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
        obj=_obj(AretroCliContext(git_gateway=git, session_source=source)),
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
        obj=_obj(AretroCliContext(git_gateway=git, session_source=source)),
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
        obj=_obj(AretroCliContext(git_gateway=git, session_source=source)),
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)["data"]
    _assert_collect_evidence_data_contract(data)
    assert data["success"] is True
    assert data["aggregate_metrics"]["session_count"] == 0
    assert data["aggregate_metrics"]["warning_count"] == 1
    warning = data["warnings"][0]
    _assert_warning_contract(warning)
    assert warning["code"] == "session_root_missing"
    assert warning["source_ref"]["path"] == str(tmp_path / "missing")


def test_collect_evidence_real_pi_missing_session_root_warning_is_success(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    repo_root = Path("/repo")
    missing_session_root = tmp_path / "missing-sessions"
    git = FakeGitGateway(
        repo_root=repo_root,
        current_branch_by_path={repo_root: "feature/retro"},
    )
    source = PiJsonlSessionSource()

    result = CliRunner().invoke(
        cli_group,
        [
            "exec",
            "collect-evidence",
            "--repo",
            str(repo_root),
            "--session-root",
            str(missing_session_root),
            "--format",
            "json",
        ],
        obj=_obj(AretroCliContext(git_gateway=git, session_source=source)),
    )

    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    assert payload["exit_code"] == 0
    data = payload["data"]
    _assert_collect_evidence_data_contract(data)
    assert data["success"] is True
    assert data["error"] is None
    assert data["repo"]["repo_root"] == "/repo"
    assert data["repo"]["branch"] == "feature/retro"
    assert data["repo"]["branch_source"] == "git_current_branch"
    assert data["query"] == {
        "repo_root": "/repo",
        "session_root": str(missing_session_root),
        "max_sessions": 20,
    }
    assert data["source"] == {
        "harness": "pi",
        "adapter_name": "pi_jsonl",
        "record_format": "jsonl",
    }
    assert data["aggregate_metrics"] == {
        "session_count": 0,
        "message_counts": {
            "user": 0,
            "assistant": 0,
            "tool_result": 0,
            "command_execution": 0,
            "system": 0,
            "other": 0,
        },
        "tool_call_count": 0,
        "tool_result_count": 0,
        "command_execution_count": 0,
        "usage_event_count": 0,
        "warning_count": 1,
    }
    assert data["sessions"] == []
    assert data["evidence_items"] == []
    assert len(data["warnings"]) == 1
    warning = data["warnings"][0]
    _assert_warning_contract(warning)
    assert warning["code"] == "session_root_missing"
    assert warning["harness"] == "pi"
    assert warning["adapter_name"] == "pi_jsonl"
    source_ref = warning["source_ref"]
    _assert_source_ref_contract(source_ref)
    assert source_ref["path"] == str(missing_session_root)
    assert source_ref["uri"] is None
    assert source_ref["line_number"] is None


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
        obj=_obj(AretroCliContext(git_gateway=git, session_source=source)),
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
        obj=_obj(AretroCliContext(git_gateway=git, session_source=source)),
    )

    assert result.exit_code == 1
    data = json.loads(result.output)["data"]
    assert data["success"] is False
    assert data["error"]["code"] == "not_a_git_repo"
    assert data["repo"]["repo_root"] is None
    assert data["sessions"] == []
    assert source.queries == ()


def _assert_collect_evidence_data_contract(data: object) -> None:
    assert isinstance(data, dict)
    assert set(data) == {
        "success",
        "error",
        "repo",
        "query",
        "source",
        "aggregate_metrics",
        "sessions",
        "warnings",
        "evidence_items",
    }
    _assert_repo_contract(data["repo"])
    _assert_query_contract(data["query"])
    _assert_source_contract(data["source"])
    _assert_aggregate_metrics_contract(data["aggregate_metrics"])
    assert isinstance(data["sessions"], list)
    assert isinstance(data["warnings"], list)
    assert isinstance(data["evidence_items"], list)


def _assert_collect_evidence_payload_data_contract(data: object) -> None:
    assert isinstance(data, dict)
    assert set(data) == {
        "success",
        "error",
        "repo",
        "query",
        "source",
        "aggregate_metrics",
        "sessions",
        "warnings",
        "evidence_items",
        "payload_mode",
        "payload_reference",
        "detail_locator_hints",
    }
    _assert_repo_contract(data["repo"])
    _assert_query_contract(data["query"])
    _assert_source_contract(data["source"])
    _assert_aggregate_metrics_contract(data["aggregate_metrics"])
    assert isinstance(data["sessions"], list)
    assert isinstance(data["warnings"], list)
    assert isinstance(data["evidence_items"], list)
    assert isinstance(data["payload_reference"], dict)
    assert isinstance(data["detail_locator_hints"], dict)


def _assert_repo_contract(repo: object) -> None:
    assert isinstance(repo, dict)
    assert set(repo) == {"repo_root", "cwd", "branch", "branch_source"}


def _assert_query_contract(query: object) -> None:
    assert isinstance(query, dict)
    assert set(query) == {"repo_root", "session_root", "max_sessions"}


def _assert_source_contract(source: object) -> None:
    assert isinstance(source, dict)
    assert set(source) == {"harness", "adapter_name", "record_format"}


def _assert_aggregate_metrics_contract(metrics: object) -> None:
    assert isinstance(metrics, dict)
    assert set(metrics) == {
        "session_count",
        "message_counts",
        "tool_call_count",
        "tool_result_count",
        "command_execution_count",
        "usage_event_count",
        "warning_count",
    }
    _assert_message_counts_contract(metrics["message_counts"])


def _assert_message_counts_contract(message_counts: object) -> None:
    assert isinstance(message_counts, dict)
    assert set(message_counts) == {
        "user",
        "assistant",
        "tool_result",
        "command_execution",
        "system",
        "other",
    }


def _assert_source_ref_contract(source_ref: object) -> None:
    assert isinstance(source_ref, dict)
    assert set(source_ref) == {"path", "uri", "line_number"}


def _assert_warning_contract(warning: object) -> None:
    assert isinstance(warning, dict)
    assert set(warning) == {"code", "message", "source_ref", "harness", "adapter_name"}
    if warning["source_ref"] is not None:
        _assert_source_ref_contract(warning["source_ref"])


def _assert_session_summary_contract(session: object) -> None:
    assert isinstance(session, dict)
    assert set(session) == {
        "session_id",
        "started_at_iso",
        "ended_at_iso",
        "source_ref",
        "association",
        "message_counts",
        "model_event_count",
        "tool_call_count",
        "tool_result_count",
        "command_execution_count",
        "usage_event_count",
        "warning_count",
    }
    _assert_source_ref_contract(session["source_ref"])
    _assert_association_contract(session["association"])
    _assert_message_counts_contract(session["message_counts"])


def _assert_association_contract(association: object) -> None:
    assert isinstance(association, dict)
    assert set(association) == {"repo_root", "cwd", "branch", "confidence", "evidence"}
    assert isinstance(association["evidence"], list)


def _assert_evidence_item_contract(evidence_item: object) -> None:
    assert isinstance(evidence_item, dict)
    assert set(evidence_item) == {
        "kind",
        "subject",
        "summary",
        "count",
        "session_count",
        "source_refs",
        "metadata",
    }
    assert isinstance(evidence_item["source_refs"], list)
    for source_ref in evidence_item["source_refs"]:
        _assert_source_ref_contract(source_ref)
    assert isinstance(evidence_item["metadata"], dict)


def _collect_payload_evidence(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> tuple[dict[str, object], dict[str, object]]:
    repo_root = Path("/repo")
    source = FakeSessionSource(sessions=(_evidence_session(repo_root),))
    git = FakeGitGateway(
        repo_root=repo_root,
        current_branch_by_path={repo_root: "feature/retro"},
    )

    result = CliRunner().invoke(
        cli_group,
        [
            "exec",
            "collect-evidence",
            "--repo",
            str(repo_root),
            "--branch",
            "feature/retro",
            "--payload-mode",
            "payload",
            "--payload-session-id",
            "aretro-test-session",
            "--format",
            "json",
        ],
        obj=_obj(AretroCliContext(git_gateway=git, session_source=source)),
        env={"ASDL_PAYLOAD_ROOT": str(tmp_path / "payload-root")},
    )

    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    assert payload["exit_code"] == 0
    data = payload["data"]
    assert isinstance(data, dict)
    payload_reference = data["payload_reference"]
    assert isinstance(payload_reference, dict)
    raw_payload = json.loads(Path(payload_reference["payload_path"]).read_text(encoding="utf-8"))
    assert isinstance(raw_payload, dict)
    return data, raw_payload


def _write_payload_artifact(
    tmp_path: Path,
    *,
    session_id: str,
    role: str,
    payload: object,
) -> Path:
    store = PayloadStore.open(root=tmp_path / "payload-root", session_id=session_id)
    reference = store.write_json_artifact(descriptor="aretro-reader", role=role, payload=payload)
    return Path(reference.payload_path)


def _empty_obj() -> ClinkrContextObject:
    return _obj(
        AretroCliContext(
            git_gateway=FakeGitGateway(repo_root=Path("/repo")),
            session_source=FakeSessionSource(),
        )
    )


def _obj(context: AretroCliContext) -> ClinkrContextObject:
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
