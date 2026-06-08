from __future__ import annotations

import json
from pathlib import Path

import pytest
from click.testing import CliRunner, Result

from asdl_core.clinkr.context import build_clinkr_context_object
from asdl_core.clinkr.group import ClinkrGroup
from asdl_core.git.testing import FakeGitGateway
from asdl_objectives.context import (
    ObjectiveCliContext,
    ObjectiveCliUnavailable,
)
from asdl_objectives.main import build_cli


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


def test_objective_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["-h"])

    assert result.exit_code == 0
    assert "Usage: objective" in result.output
    assert "Work with checked-in Objective records." in result.output
    assert "--version" in result.output
    assert "archive" in result.output
    assert "Archive or unarchive an Objective record" in result.output
    assert "Work with Graphite Objective stack projections" not in result.output
    assert "list" in result.output
    assert "List Objective records" in result.output
    assert "exec" not in result.output


def test_objective_version(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["--version"])

    assert result.exit_code == 0
    assert "version" in result.output.lower()


def test_objective_gt_command_is_not_registered(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["gt", "stacks", "--help"])

    assert result.exit_code != 0
    assert "No such command" in result.output


def test_objective_archive_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["archive", "--help"])

    assert result.exit_code == 0
    assert "Usage: objective archive" in result.output
    assert "Archive or unarchive an Objective record by moving its directory" in result.output
    assert "SLUG" in result.output
    assert "--unarchive" in result.output


def test_objective_archive_open_record_json_moves_from_active_to_archive(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    active_root = tmp_path / ".asdl" / "objectives"
    archive_root = tmp_path / ".asdl" / "objective-archive"
    _write_objective(active_root, "alpha")
    subdir = tmp_path / "subdir"
    subdir.mkdir()
    monkeypatch.chdir(subdir)
    ctx = _archive_context(tmp_path)

    result = _invoke_archive_json(cli_group, ctx, "alpha")

    assert result.exit_code == 0, result.output
    assert json.loads(result.output) == {
        "exit_code": 0,
        "data": _archive_data(
            status="archived",
            error=None,
            slug="alpha",
            direction="archive",
            source_path=".asdl/objectives/alpha",
            destination_path=".asdl/objective-archive/alpha",
            source_exists=False,
            destination_exists=True,
            moved=True,
        ),
    }
    assert not (active_root / "alpha").exists()
    assert (archive_root / "alpha" / "objective.md").is_file()


def test_objective_archive_human_output_lists_moved_paths(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    _write_objective(tmp_path / ".asdl" / "objectives", "alpha")
    ctx = _archive_context(tmp_path)

    result = _invoke_archive_human(cli_group, ctx, "alpha")

    assert result.exit_code == 0, result.output
    assert "Archived Objective `alpha`." in result.output
    assert ".asdl/objectives/alpha" in result.output
    assert "-> .asdl/objective-archive/alpha" in result.output


def test_objective_archive_closed_record_preserves_closed_marker(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    _write_objective(tmp_path / ".asdl" / "objectives", "done", closed=True)
    ctx = _archive_context(tmp_path)

    result = _invoke_archive_json(cli_group, ctx, "done")

    assert result.exit_code == 0, result.output
    assert (tmp_path / ".asdl" / "objective-archive" / "done" / "closed.md").read_text(
        encoding="utf-8"
    ) == "closed\n"


def test_objective_archive_creates_archive_root_when_absent(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    _write_objective(tmp_path / ".asdl" / "objectives", "alpha")
    archive_root = tmp_path / ".asdl" / "objective-archive"
    assert not archive_root.exists()

    result = _invoke_archive_json(cli_group, _archive_context(tmp_path), "alpha")

    assert result.exit_code == 0, result.output
    assert archive_root.is_dir()


def test_objective_archive_absent_source_returns_stable_json_without_creating_destination(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    ctx = _archive_context(tmp_path)

    result = _invoke_archive_json(cli_group, ctx, "ghost")

    assert result.exit_code == 1
    assert json.loads(result.output) == {
        "exit_code": 1,
        "message": "No active Objective record found for slug 'ghost' at .asdl/objectives/ghost.",
        "data": _archive_data(
            status="source_not_found",
            error="source_not_found",
            slug="ghost",
            direction="archive",
            source_path=".asdl/objectives/ghost",
            destination_path=".asdl/objective-archive/ghost",
            source_exists=False,
            destination_exists=False,
            moved=False,
        ),
    }
    assert not (tmp_path / ".asdl" / "objective-archive" / "ghost").exists()


def test_objective_archive_destination_collision_fails_without_mutation(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    active_record = _write_objective(tmp_path / ".asdl" / "objectives", "alpha")
    archived_record = _write_objective(tmp_path / ".asdl" / "objective-archive", "alpha")
    (active_record / "objective.md").write_text("active sentinel\n", encoding="utf-8")
    (archived_record / "objective.md").write_text("archived sentinel\n", encoding="utf-8")

    result = _invoke_archive_json(cli_group, _archive_context(tmp_path), "alpha")

    assert result.exit_code == 1
    assert json.loads(result.output) == {
        "exit_code": 1,
        "message": (
            "Destination already exists for slug 'alpha': .asdl/objective-archive/alpha. "
            "Refusing to merge or overwrite."
        ),
        "data": _archive_data(
            status="destination_exists",
            error="destination_exists",
            slug="alpha",
            direction="archive",
            source_path=".asdl/objectives/alpha",
            destination_path=".asdl/objective-archive/alpha",
            source_exists=True,
            destination_exists=True,
            moved=False,
        ),
    }
    assert (active_record / "objective.md").read_text(encoding="utf-8") == "active sentinel\n"
    assert (archived_record / "objective.md").read_text(encoding="utf-8") == "archived sentinel\n"


@pytest.mark.parametrize("slug", ("foo/bar", ".asdl/objectives/foo", ".", ".."))
def test_objective_archive_rejects_invalid_slug_without_mutation(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    slug: str,
) -> None:
    _write_objective(tmp_path / ".asdl" / "objectives", "alpha")

    result = _invoke_archive_json(cli_group, _archive_context(tmp_path), slug)

    assert result.exit_code == 1
    assert json.loads(result.output) == {
        "exit_code": 1,
        "message": f"Invalid Objective slug {slug!r}. Pass a single slug, not a path.",
        "data": _archive_data(
            status="invalid_slug",
            error="invalid_slug",
            slug=None,
            direction="archive",
            source_path=".asdl/objectives",
            destination_path=".asdl/objective-archive",
            source_exists=False,
            destination_exists=False,
            moved=False,
        ),
    }
    assert (tmp_path / ".asdl" / "objectives" / "alpha").is_dir()
    assert not (tmp_path / ".asdl" / "objective-archive").exists()


def test_objective_archive_missing_slug_returns_negative_without_click_usage(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    result = _invoke_archive_json(cli_group, _archive_context(tmp_path), slug=None)

    assert result.exit_code == 1
    assert "Usage:" not in result.output
    assert "Usage:" not in result.stderr
    assert json.loads(result.output) == {
        "exit_code": 1,
        "message": "Missing Objective slug. Pass an explicit slug.",
        "data": _archive_data(
            status="missing_slug",
            error="missing_slug",
            slug=None,
            direction="archive",
            source_path=".asdl/objectives",
            destination_path=".asdl/objective-archive",
            source_exists=False,
            destination_exists=False,
            moved=False,
        ),
    }


def test_objective_unarchive_json_moves_from_archive_to_active(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    _write_objective(tmp_path / ".asdl" / "objective-archive", "alpha")
    active_root = tmp_path / ".asdl" / "objectives"
    ctx = _archive_context(tmp_path)

    result = _invoke_archive_json(cli_group, ctx, "alpha", unarchive=True)

    assert result.exit_code == 0, result.output
    assert json.loads(result.output) == {
        "exit_code": 0,
        "data": _archive_data(
            status="unarchived",
            error=None,
            slug="alpha",
            direction="unarchive",
            source_path=".asdl/objective-archive/alpha",
            destination_path=".asdl/objectives/alpha",
            source_exists=False,
            destination_exists=True,
            moved=True,
        ),
    }
    assert (active_root / "alpha" / "objective.md").is_file()
    assert not (tmp_path / ".asdl" / "objective-archive" / "alpha").exists()


def test_objective_unarchive_human_output_lists_moved_paths(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    _write_objective(tmp_path / ".asdl" / "objective-archive", "alpha")

    result = _invoke_archive_human(cli_group, _archive_context(tmp_path), "alpha", unarchive=True)

    assert result.exit_code == 0, result.output
    assert "Unarchived Objective `alpha`." in result.output
    assert ".asdl/objective-archive/alpha" in result.output
    assert "-> .asdl/objectives/alpha" in result.output


def test_objective_unarchive_creates_active_root_when_absent(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    _write_objective(tmp_path / ".asdl" / "objective-archive", "alpha")
    active_root = tmp_path / ".asdl" / "objectives"
    assert not active_root.exists()

    result = _invoke_archive_json(cli_group, _archive_context(tmp_path), "alpha", unarchive=True)

    assert result.exit_code == 0, result.output
    assert active_root.is_dir()


def test_objective_unarchive_absent_source_returns_stable_json(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    result = _invoke_archive_json(cli_group, _archive_context(tmp_path), "ghost", unarchive=True)

    assert result.exit_code == 1
    assert json.loads(result.output) == {
        "exit_code": 1,
        "message": (
            "No archived Objective record found for slug 'ghost' at .asdl/objective-archive/ghost."
        ),
        "data": _archive_data(
            status="source_not_found",
            error="source_not_found",
            slug="ghost",
            direction="unarchive",
            source_path=".asdl/objective-archive/ghost",
            destination_path=".asdl/objectives/ghost",
            source_exists=False,
            destination_exists=False,
            moved=False,
        ),
    }


def test_objective_unarchive_destination_collision_fails_without_mutation(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    archived_record = _write_objective(tmp_path / ".asdl" / "objective-archive", "alpha")
    active_record = _write_objective(tmp_path / ".asdl" / "objectives", "alpha")
    (archived_record / "objective.md").write_text("archived sentinel\n", encoding="utf-8")
    (active_record / "objective.md").write_text("active sentinel\n", encoding="utf-8")

    result = _invoke_archive_json(cli_group, _archive_context(tmp_path), "alpha", unarchive=True)

    assert result.exit_code == 1
    assert json.loads(result.output) == {
        "exit_code": 1,
        "message": (
            "Destination already exists for slug 'alpha': .asdl/objectives/alpha. "
            "Refusing to merge or overwrite."
        ),
        "data": _archive_data(
            status="destination_exists",
            error="destination_exists",
            slug="alpha",
            direction="unarchive",
            source_path=".asdl/objective-archive/alpha",
            destination_path=".asdl/objectives/alpha",
            source_exists=True,
            destination_exists=True,
            moved=False,
        ),
    }
    assert (archived_record / "objective.md").read_text(encoding="utf-8") == "archived sentinel\n"
    assert (active_record / "objective.md").read_text(encoding="utf-8") == "active sentinel\n"


def test_objective_archive_unavailable_context_returns_failure_envelope(
    cli_group: ClinkrGroup,
) -> None:
    result = _invoke_archive_json(
        cli_group,
        ObjectiveCliUnavailable("Not inside a git repository."),
        "alpha",
    )

    assert result.exit_code == 2
    assert json.loads(result.output) == {
        "exit_code": 2,
        "error_type": "not_in_repo",
        "message": "Not inside a git repository.",
    }


def test_objective_exec_is_hidden_but_invocable(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["exec", "--help"])

    assert result.exit_code == 0
    assert "Usage: objective exec" in result.output
    assert "Commands for use by objective skills." in result.output
    assert "list-candidates" in result.output
    assert "runner-subagent-usage" in result.output
    assert "read-objective" in result.output

    result = CliRunner().invoke(cli_group, ["exec", "read-objective", "--help"])

    assert result.exit_code == 0
    assert "Usage: objective exec read-objective" in result.output
    assert "Read one Objective record by explicit slug" in result.output


def test_objective_exec_list_candidates_returns_active_slug_status_only(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    root = tmp_path / ".asdl" / "objectives"
    _write_objective(root, "alpha")
    _write_objective(root, "bravo", closed=True)
    _write_objective(root, "charlie")
    git = FakeGitGateway(repo_root=tmp_path, branches=("master",), trunk_branch="master")
    ctx = ObjectiveCliContext(repo_root=tmp_path, trunk_branch="master", git=git)

    result = CliRunner().invoke(
        cli_group,
        ["exec", "list-candidates", "--format", "json"],
        obj=build_clinkr_context_object(lambda: ctx),
    )

    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    assert payload == {
        "exit_code": 0,
        "data": {
            "records": [
                {"slug": "alpha", "status": "open"},
                {"slug": "charlie", "status": "open"},
            ],
        },
    }
    assert all(set(record) == {"slug", "status"} for record in payload["data"]["records"])
    assert git.path_last_touched_calls == ()
    assert git.has_uncommitted_changes_under_calls == ()


def test_objective_exec_list_candidates_unavailable_context_returns_failure_envelope(
    cli_group: ClinkrGroup,
) -> None:
    result = CliRunner().invoke(
        cli_group,
        ["exec", "list-candidates", "--format", "json"],
        obj=build_clinkr_context_object(
            lambda: ObjectiveCliUnavailable("Not inside a git repository.")
        ),
    )

    assert result.exit_code == 2
    assert json.loads(result.output) == {
        "exit_code": 2,
        "error_type": "not_in_repo",
        "message": "Not inside a git repository.",
    }


def test_objective_exec_runner_subagent_usage_json(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    session_file = tmp_path / "slice.jsonl"
    _write_runner_subagent_jsonl(session_file)

    result = CliRunner().invoke(
        cli_group,
        ["exec", "runner-subagent-usage", str(session_file), "--format", "json"],
        obj=build_clinkr_context_object(lambda: object()),
    )

    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    assert payload["exit_code"] == 0
    session = payload["data"]["sessions"][0]
    assert session["session_file"] == str(session_file)
    assert session["status"] == "ok"
    assert session["assistant_response_count"] == 1
    assert session["models"] == [
        {"provider": "openai-codex", "api": "responses", "model": "gpt-5.5"}
    ]
    assert session["tokens"] == {
        "input_tokens": 100,
        "output_tokens": 20,
        "cache_read_tokens": 30,
        "cache_write_tokens": 0,
        "total_tokens": 150,
    }
    assert payload["data"]["aggregate"]["usage_response_count"] == 1
    assert payload["data"]["aggregate"]["cost"]["total_usd"] == 0.006


def test_objective_exec_runner_subagent_usage_markdown(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    session_file = tmp_path / "slice.jsonl"
    _write_runner_subagent_jsonl(session_file)

    result = CliRunner().invoke(
        cli_group,
        ["exec", "runner-subagent-usage", str(session_file), "--format", "md"],
    )

    assert result.exit_code == 0, result.output
    assert "# Runner Subagent Usage" in result.output
    assert (
        "| session | status | responses | model(s) | input | output | cache read |" in result.output
    )
    assert str(session_file) in result.output
    assert "openai-codex/responses/gpt-5.5" in result.output
    assert "| 100 | 20 | 30 | 0 | 150 | 150 | 130 | $0.006000 |" in result.output
    assert "## Aggregate" in result.output
    assert "- sessions: 1 total, 1 with usage" in result.output
    assert "- configured context window: unavailable in runner subagent logs" in result.output
    assert "- cost: $0.006000" in result.output


def test_objective_exec_runner_subagent_usage_no_args_is_negative(
    cli_group: ClinkrGroup,
) -> None:
    result = CliRunner().invoke(cli_group, ["exec", "runner-subagent-usage"])

    assert result.exit_code == 1
    assert "Missing session file" in result.stderr
    assert "missing_session_file" in result.output

    json_result = CliRunner().invoke(
        cli_group,
        ["exec", "runner-subagent-usage", "--format", "json"],
        obj=build_clinkr_context_object(lambda: object()),
    )
    assert json_result.exit_code == 1
    payload = json.loads(json_result.output)
    assert "missing_session_file" in payload["message"]
    assert payload["data"]["sessions"] == []


def test_objective_exec_runner_subagent_usage_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["exec", "runner-subagent-usage", "--help"])

    assert result.exit_code == 0
    assert "Usage: objective exec runner-subagent-usage" in result.output
    assert "Summarize Pi runner subagent JSONL usage telemetry" in result.output


def test_objective_exec_read_missing_slug_returns_stable_json(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(tmp_path)

    result = _invoke_read_json(cli_group)

    assert result.exit_code == 1
    assert "Usage:" not in result.output
    assert "Usage:" not in result.stderr
    assert json.loads(result.output) == {
        "exit_code": 1,
        "message": "Missing Objective slug. Pass an explicit slug.",
        "data": _empty_read_data(status="missing_slug", error="missing_slug"),
    }


@pytest.mark.parametrize("slug", ("foo/bar", ".asdl/objectives/foo", ".", ".."))
def test_objective_exec_read_rejects_path_shaped_slug(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    slug: str,
) -> None:
    monkeypatch.chdir(tmp_path)

    result = _invoke_read_json(cli_group, slug)

    assert result.exit_code == 1
    assert json.loads(result.output) == {
        "exit_code": 1,
        "message": f"Invalid Objective slug {slug!r}. Pass a single slug, not a path.",
        "data": _empty_read_data(status="invalid_slug", error="invalid_slug"),
    }


def test_objective_exec_read_absent_record_returns_facts(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(tmp_path)

    result = _invoke_read_json(cli_group, "ghost")

    assert result.exit_code == 1
    assert json.loads(result.output) == {
        "exit_code": 1,
        "message": "No Objective record found for slug 'ghost'.",
        "data": _empty_read_data(
            status="not_found",
            error="not_found",
            slug="ghost",
            path=".asdl/objectives/ghost",
        ),
    }


def test_objective_exec_read_does_not_read_archive_only_record(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(tmp_path)
    _write_objective(tmp_path / ".asdl" / "objective-archive", "alpha")

    result = _invoke_read_json(cli_group, "alpha")

    assert result.exit_code == 1
    assert json.loads(result.output) == {
        "exit_code": 1,
        "message": "No Objective record found for slug 'alpha'.",
        "data": _empty_read_data(
            status="not_found",
            error="not_found",
            slug="alpha",
            path=".asdl/objectives/alpha",
        ),
    }


def test_objective_exec_read_complete_open_record_json(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(tmp_path)
    root = tmp_path / ".asdl" / "objectives"
    _write_objective(root, "alpha", updates=("second.md", "first.md"))

    result = _invoke_read_json(cli_group, "alpha")

    assert result.exit_code == 0, result.output
    assert json.loads(result.output) == {
        "exit_code": 0,
        "data": {
            "status": "ok",
            "error": None,
            "root_path": ".asdl/objectives",
            "root_exists": True,
            "slug": "alpha",
            "path": ".asdl/objectives/alpha",
            "exists": True,
            "closed": False,
            "files": {
                "objective_md": True,
                "roadmap_md": True,
                "updates_dir": True,
                "closed_md": False,
            },
            "updates": [
                {
                    "name": "first.md",
                    "path": ".asdl/objectives/alpha/updates/first.md",
                },
                {
                    "name": "second.md",
                    "path": ".asdl/objectives/alpha/updates/second.md",
                },
            ],
            "update_count": 2,
        },
    }


def test_objective_exec_read_closed_record_json(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(tmp_path)
    root = tmp_path / ".asdl" / "objectives"
    _write_objective(root, "done", closed=True)

    result = _invoke_read_json(cli_group, "done")

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)["data"]
    assert data["closed"] is True
    assert data["files"]["closed_md"] is True


def test_objective_exec_read_incomplete_record_json_succeeds(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(tmp_path)
    root = tmp_path / ".asdl" / "objectives"
    (root / "partial").mkdir(parents=True)

    result = _invoke_read_json(cli_group, "partial")

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)["data"]
    assert data["files"] == {
        "objective_md": False,
        "roadmap_md": False,
        "updates_dir": False,
        "closed_md": False,
    }
    assert data["updates"] == []
    assert data["update_count"] == 0


def test_objective_exec_read_markdown_includes_raw_files_sorted_updates(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(tmp_path)
    record = tmp_path / ".asdl" / "objectives" / "story"
    updates_dir = record / "updates"
    updates_dir.mkdir(parents=True)
    (record / "objective.md").write_text("# Raw Objective\nbody sentinel\n", encoding="utf-8")
    (record / "roadmap.md").write_text("# Raw Roadmap\n- [ ] roadmap sentinel\n", encoding="utf-8")
    (updates_dir / "b-later.md").write_text("# Later\nlater sentinel\n", encoding="utf-8")
    (updates_dir / "a-earlier.md").write_text("# Earlier\nearlier sentinel\n", encoding="utf-8")
    (updates_dir / "notes.txt").write_text("not markdown\n", encoding="utf-8")

    result = CliRunner().invoke(cli_group, ["exec", "read-objective", "story", "--format", "md"])

    assert result.exit_code == 0, result.output
    assert "# Objective `story`" in result.output
    assert "## objective.md" in result.output
    assert "# Raw Objective\nbody sentinel" in result.output
    assert "## roadmap.md" in result.output
    assert "# Raw Roadmap\n- [ ] roadmap sentinel" in result.output
    assert result.output.index("## updates/a-earlier.md") < result.output.index(
        "## updates/b-later.md"
    )
    assert "# Earlier\nearlier sentinel" in result.output
    assert "# Later\nlater sentinel" in result.output
    assert "not markdown" not in result.output


def test_objective_exec_read_markdown_notes_missing_files(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(tmp_path)
    record = tmp_path / ".asdl" / "objectives" / "partial"
    record.mkdir(parents=True)

    result = CliRunner().invoke(cli_group, ["exec", "read-objective", "partial", "--format", "md"])

    assert result.exit_code == 0, result.output
    assert "_Missing `objective.md`._" in result.output
    assert "_Missing `roadmap.md`._" in result.output
    assert "_Missing `updates/` directory._" in result.output


def test_objective_exec_read_markdown_empty_updates_dir_note(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(tmp_path)
    root = tmp_path / ".asdl" / "objectives"
    _write_objective(root, "alpha")

    result = _invoke_read_md(cli_group, "alpha")

    assert result.exit_code == 0, result.output
    assert "_No direct update Markdown files found._" in result.output


def test_objective_exec_read_json_omits_raw_markdown_content(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(tmp_path)
    root = tmp_path / ".asdl" / "objectives"
    record = _write_objective(root, "quiet", updates=("update.md",))
    (record / "objective.md").write_text("private objective body sentinel\n", encoding="utf-8")
    (record / "roadmap.md").write_text("private roadmap body sentinel\n", encoding="utf-8")
    (record / "updates" / "update.md").write_text(
        "private update body sentinel\n",
        encoding="utf-8",
    )

    result = _invoke_read_json(cli_group, "quiet")

    assert result.exit_code == 0, result.output
    assert "private objective body sentinel" not in result.output
    assert "private roadmap body sentinel" not in result.output
    assert "private update body sentinel" not in result.output


def _archive_context(repo_root: Path) -> ObjectiveCliContext:
    return ObjectiveCliContext(
        repo_root=repo_root,
        trunk_branch="master",
        git=FakeGitGateway(repo_root=repo_root, branches=("master",), trunk_branch="master"),
    )


def _invoke_archive_json(
    cli_group: ClinkrGroup,
    ctx: ObjectiveCliContext | ObjectiveCliUnavailable,
    slug: str | None,
    *,
    unarchive: bool = False,
) -> Result:
    args = ["archive"]
    if slug is not None:
        args.append(slug)
    if unarchive:
        args.append("--unarchive")
    args.extend(("--format", "json"))
    return CliRunner().invoke(
        cli_group,
        args,
        obj=build_clinkr_context_object(lambda: ctx),
    )


def _invoke_archive_human(
    cli_group: ClinkrGroup,
    ctx: ObjectiveCliContext,
    slug: str,
    *,
    unarchive: bool = False,
) -> Result:
    args = ["archive", slug]
    if unarchive:
        args.append("--unarchive")
    return CliRunner().invoke(
        cli_group,
        args,
        obj=build_clinkr_context_object(lambda: ctx),
    )


def _archive_data(
    *,
    status: str,
    error: str | None,
    slug: str | None,
    direction: str,
    source_path: str,
    destination_path: str,
    source_exists: bool,
    destination_exists: bool,
    moved: bool,
) -> dict[str, object]:
    return {
        "status": status,
        "error": error,
        "slug": slug,
        "direction": direction,
        "source_path": source_path,
        "destination_path": destination_path,
        "source_exists": source_exists,
        "destination_exists": destination_exists,
        "moved": moved,
    }


def _invoke_read_json(cli_group: ClinkrGroup, slug: str | None = None) -> Result:
    args = ["exec", "read-objective"]
    if slug is not None:
        args.append(slug)
    args.extend(("--format", "json"))
    return CliRunner().invoke(
        cli_group,
        args,
        obj=build_clinkr_context_object(lambda: object()),
    )


def _invoke_read_md(cli_group: ClinkrGroup, slug: str) -> Result:
    return CliRunner().invoke(
        cli_group,
        ["exec", "read-objective", slug, "--format", "md"],
        obj=build_clinkr_context_object(lambda: object()),
    )


def _empty_read_data(
    *,
    status: str,
    error: str,
    slug: str | None = None,
    path: str | None = None,
) -> dict[str, object]:
    return {
        "status": status,
        "error": error,
        "root_path": ".asdl/objectives",
        "root_exists": False,
        "slug": slug,
        "path": path,
        "exists": False,
        "closed": False,
        "files": {
            "objective_md": False,
            "roadmap_md": False,
            "updates_dir": False,
            "closed_md": False,
        },
        "updates": [],
        "update_count": 0,
    }


def _write_runner_subagent_jsonl(path: Path) -> None:
    path.write_text(
        json.dumps(
            {
                "message": {
                    "role": "assistant",
                    "provider": "openai-codex",
                    "api": "responses",
                    "model": "gpt-5.5",
                    "usage": {
                        "input": 100,
                        "output": 20,
                        "cacheRead": 30,
                        "cacheWrite": 0,
                        "totalTokens": 150,
                        "cost": {
                            "input": 0.001,
                            "output": 0.004,
                            "cacheRead": 0.001,
                            "cacheWrite": 0.0,
                            "total": 0.006,
                        },
                    },
                }
            }
        )
        + "\n",
        encoding="utf-8",
    )


def _write_objective(
    root: Path,
    slug: str,
    *,
    closed: bool = False,
    updates: tuple[str, ...] = (),
) -> Path:
    path = root / slug
    path.mkdir(parents=True)
    (path / "objective.md").write_text(f"# {slug}\n", encoding="utf-8")
    (path / "roadmap.md").write_text("# Roadmap\n", encoding="utf-8")
    updates_dir = path / "updates"
    updates_dir.mkdir()
    for update_name in updates:
        (updates_dir / update_name).write_text("# Update\n", encoding="utf-8")
    if closed:
        (path / "closed.md").write_text("closed\n", encoding="utf-8")
    return path
