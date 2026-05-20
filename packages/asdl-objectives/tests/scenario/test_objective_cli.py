from __future__ import annotations

import json
from pathlib import Path

import pytest
from click.testing import CliRunner, Result

from asdl_core.clinkr.context import build_clinkr_context_object
from asdl_core.clinkr.group import ClinkrGroup
from asdl_core.git.testing import FakeGitGateway
from asdl_core.git.types import GitCommandFailure
from asdl_objectives.context import ObjectiveCliContext, ObjectiveCliUnavailable
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
    assert "branches" in result.output
    assert "list" in result.output
    assert "exec" not in result.output


def test_objective_version(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["--version"])

    assert result.exit_code == 0
    assert "version" in result.output.lower()


def test_objective_list_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["list", "--help"])

    assert result.exit_code == 0
    assert "Usage: objective list" in result.output
    assert "List checked-in Objective record directories" in result.output


def test_objective_branches_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["branches", "--help"])

    assert result.exit_code == 0
    assert "Usage: objective branches" in result.output
    assert "List open Objective branch states across local branches." in result.output


def test_objective_branches_empty_result(cli_group: ClinkrGroup) -> None:
    ctx = _branches_context(branches=("master", "feat/no-objectives"))

    result = _invoke_branches_json(cli_group, ctx)

    assert result.exit_code == 0, result.output
    assert json.loads(result.output) == {
        "exit_code": 0,
        "data": {
            "trunk_branch": "master",
            "groups": [],
        },
    }

    human = _invoke_branches_human(cli_group, ctx)
    assert human.exit_code == 0, human.output
    assert "No open Objective branch states found." in human.output


def test_objective_branches_groups_multiple_branches_under_one_objective(
    cli_group: ClinkrGroup,
) -> None:
    ctx = _branches_context(
        branches=("master", "feat/b", "feat/a"),
        directories_by_ref_path={
            ("refs/heads/feat/a", ".asdl/objectives"): ("alpha",),
            ("refs/heads/feat/b", ".asdl/objectives"): ("alpha",),
        },
        branch_head_iso_by_branch={
            "feat/a": "2026-05-20T10:44:08-04:00",
            "feat/b": "2026-05-20T11:15:42-04:00",
        },
        commit_count_by_range={
            "master..feat/a": 3,
            "master..feat/b": 18,
        },
    )

    result = _invoke_branches_json(cli_group, ctx)

    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    assert payload["data"]["groups"] == [
        {
            "slug": "alpha",
            "branches": [
                {
                    "branch": "feat/a",
                    "tip_head_iso": "2026-05-20T10:44:08-04:00",
                    "ahead_trunk": 3,
                },
                {
                    "branch": "feat/b",
                    "tip_head_iso": "2026-05-20T11:15:42-04:00",
                    "ahead_trunk": 18,
                },
            ],
        }
    ]
    assert "canonical" not in result.output.lower()
    assert "tip_age" not in payload["data"]["groups"][0]["branches"][0]


def test_objective_branches_sorts_groups_and_branch_rows(cli_group: ClinkrGroup) -> None:
    ctx = _branches_context(
        branches=("master", "feat/b", "feat/a"),
        directories_by_ref_path={
            ("refs/heads/feat/a", ".asdl/objectives"): ("beta", "alpha"),
            ("refs/heads/feat/b", ".asdl/objectives"): ("alpha",),
        },
    )

    result = _invoke_branches_json(cli_group, ctx)

    assert result.exit_code == 0, result.output
    groups = json.loads(result.output)["data"]["groups"]
    assert [group["slug"] for group in groups] == ["alpha", "beta"]
    assert [entry["branch"] for entry in groups[0]["branches"]] == ["feat/a", "feat/b"]
    assert [entry["branch"] for entry in groups[1]["branches"]] == ["feat/a"]


def test_objective_branches_excludes_closed_objectives(cli_group: ClinkrGroup) -> None:
    ctx = _branches_context(
        branches=("master", "feat/a"),
        directories_by_ref_path={
            ("refs/heads/feat/a", ".asdl/objectives"): ("closed-one", "open-one"),
        },
        paths_at_ref=(("refs/heads/feat/a", ".asdl/objectives/closed-one/closed.md"),),
    )

    result = _invoke_branches_json(cli_group, ctx)

    assert result.exit_code == 0, result.output
    groups = json.loads(result.output)["data"]["groups"]
    assert [group["slug"] for group in groups] == ["open-one"]
    assert "closed-one" not in result.output


def test_objective_branches_excludes_trunk_and_no_objective_branches(
    cli_group: ClinkrGroup,
) -> None:
    ctx = _branches_context(
        branches=("master", "feat/active", "feat/empty"),
        directories_by_ref_path={
            ("refs/heads/master", ".asdl/objectives"): ("alpha",),
            ("refs/heads/feat/active", ".asdl/objectives"): ("alpha",),
        },
    )

    result = _invoke_branches_json(cli_group, ctx)

    assert result.exit_code == 0, result.output
    branches = json.loads(result.output)["data"]["groups"][0]["branches"]
    assert [entry["branch"] for entry in branches] == ["feat/active"]

    human = _invoke_branches_human(cli_group, ctx)
    assert human.exit_code == 0, human.output
    assert "feat/active" in human.output
    assert "master" not in human.output
    assert "feat/empty" not in human.output


def test_objective_branches_human_and_markdown_column_shape(cli_group: ClinkrGroup) -> None:
    ctx = _branches_context(
        branches=("master", "feat/a"),
        directories_by_ref_path={
            ("refs/heads/feat/a", ".asdl/objectives"): ("alpha",),
        },
        branch_head_iso_by_branch={"feat/a": "2026-05-20T10:44:08-04:00"},
        commit_count_by_range={"master..feat/a": 7},
    )

    human = _invoke_branches_human(cli_group, ctx)

    assert human.exit_code == 0, human.output
    assert "Branch" in human.output
    assert "Tip age" in human.output
    assert "Ahead trunk" in human.output
    assert "feat/a" in human.output
    assert "+7" in human.output
    assert "tip subject" not in human.output.lower()
    assert "latest update" not in human.output.lower()
    assert "objective files changed" not in human.output.lower()

    markdown = _invoke_branches_md(cli_group, ctx)
    assert markdown.exit_code == 0, markdown.output
    assert "# Open Objectives across local branches" in markdown.output
    assert "| branch | tip age | ahead trunk |" in markdown.output
    assert "| `feat/a` |" in markdown.output
    assert "tip subject" not in markdown.output.lower()
    assert "latest update" not in markdown.output.lower()
    assert "objective files changed" not in markdown.output.lower()


def test_objective_branches_unavailable_context_returns_failure_envelope(
    cli_group: ClinkrGroup,
) -> None:
    result = _invoke_branches_json(
        cli_group,
        ObjectiveCliUnavailable("Not inside a git repository."),
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
    assert "read-objective" in result.output

    result = CliRunner().invoke(cli_group, ["exec", "read-objective", "--help"])

    assert result.exit_code == 0
    assert "Usage: objective exec read-objective" in result.output
    assert "Read one Objective record by explicit slug" in result.output


def test_objective_list_absent_root(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(tmp_path)

    result = _invoke_json(cli_group)

    assert result.exit_code == 0, result.output
    assert json.loads(result.output) == {
        "exit_code": 0,
        "data": {
            "root_path": ".asdl/objectives",
            "root_exists": False,
            "state": "open",
            "entries": [],
        },
    }


def test_objective_list_empty_root(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(tmp_path)
    (tmp_path / ".asdl" / "objectives").mkdir(parents=True)

    result = _invoke_json(cli_group)

    assert result.exit_code == 0, result.output
    assert json.loads(result.output)["data"] == {
        "root_path": ".asdl/objectives",
        "root_exists": True,
        "state": "open",
        "entries": [],
    }


def test_objective_list_all_state_sorts_open_and_closed_records(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(tmp_path)
    root = tmp_path / ".asdl" / "objectives"
    _write_objective(root, "zeta", closed=True)
    _write_objective(root, "alpha")

    result = _invoke_json(cli_group, "--state", "all")

    assert result.exit_code == 0, result.output
    entries = json.loads(result.output)["data"]["entries"]
    assert [entry["slug"] for entry in entries] == ["alpha", "zeta"]
    assert entries[0]["path"] == ".asdl/objectives/alpha"
    assert entries[0]["closed"] is False
    assert entries[1]["path"] == ".asdl/objectives/zeta"
    assert entries[1]["closed"] is True
    assert entries[1]["files"]["closed_md"] is True


def test_objective_list_filters_open_state(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(tmp_path)
    root = tmp_path / ".asdl" / "objectives"
    _write_objective(root, "active")
    _write_objective(root, "done", closed=True)

    result = _invoke_json(cli_group, "--state", "open")

    assert result.exit_code == 0, result.output
    entries = json.loads(result.output)["data"]["entries"]
    assert [entry["slug"] for entry in entries] == ["active"]
    assert entries[0]["closed"] is False


def test_objective_list_filters_closed_state(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(tmp_path)
    root = tmp_path / ".asdl" / "objectives"
    _write_objective(root, "active")
    _write_objective(root, "done", closed=True)

    result = _invoke_json(cli_group, "--state", "closed")

    assert result.exit_code == 0, result.output
    entries = json.loads(result.output)["data"]["entries"]
    assert [entry["slug"] for entry in entries] == ["done"]
    assert entries[0]["closed"] is True


def test_objective_list_default_state_returns_open(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(tmp_path)
    root = tmp_path / ".asdl" / "objectives"
    _write_objective(root, "active")
    _write_objective(root, "done", closed=True)

    result = _invoke_json(cli_group)

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)["data"]
    assert data["state"] == "open"
    entries = data["entries"]
    assert [entry["slug"] for entry in entries] == ["active"]
    assert entries[0]["closed"] is False


def test_objective_list_invalid_state(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["list", "--state", "bogus"])

    assert result.exit_code != 0
    assert "Invalid value for '--state'" in result.output
    assert "bogus" in result.output


def test_objective_list_reports_missing_required_files(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(tmp_path)
    root = tmp_path / ".asdl" / "objectives"
    (root / "partial").mkdir(parents=True)

    result = _invoke_json(cli_group)

    assert result.exit_code == 0, result.output
    entry = json.loads(result.output)["data"]["entries"][0]
    assert entry["files"] == {
        "objective_md": False,
        "roadmap_md": False,
        "updates_dir": False,
        "closed_md": False,
    }
    assert entry["update_count"] == 0


def test_objective_list_counts_direct_markdown_updates_only(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(tmp_path)
    root = tmp_path / ".asdl" / "objectives"
    objective_path = _write_objective(root, "counter", updates=("first.md", "second.md"))
    updates_dir = objective_path / "updates"
    (updates_dir / "notes.txt").write_text("not markdown\n", encoding="utf-8")
    nested_dir = updates_dir / "nested"
    nested_dir.mkdir()
    (nested_dir / "third.md").write_text("nested update\n", encoding="utf-8")
    (updates_dir / "directory.md").mkdir()

    result = _invoke_json(cli_group)

    assert result.exit_code == 0, result.output
    entry = json.loads(result.output)["data"]["entries"][0]
    assert entry["update_count"] == 2


def test_objective_list_ignores_non_directory_root_entries(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(tmp_path)
    root = tmp_path / ".asdl" / "objectives"
    root.mkdir(parents=True)
    (root / ".gitkeep").write_text("", encoding="utf-8")
    (root / "not-an-objective.md").write_text("ignored\n", encoding="utf-8")
    _write_objective(root, "real")

    result = _invoke_json(cli_group)

    assert result.exit_code == 0, result.output
    entries = json.loads(result.output)["data"]["entries"]
    assert [entry["slug"] for entry in entries] == ["real"]


def test_objective_list_format_md(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(tmp_path)
    root = tmp_path / ".asdl" / "objectives"
    _write_objective(root, "alpha", updates=("progress.md",))

    result = CliRunner().invoke(cli_group, ["list", "--format", "md"])

    assert result.exit_code == 0, result.output
    assert "Root: `.asdl/objectives` (present)" in result.output
    assert "| slug | state | files | updates | path |" in result.output
    assert (
        "| alpha | open | objective.md:yes, roadmap.md:yes, updates/:yes, closed.md:no | "
        "1 | `.asdl/objectives/alpha` |"
    ) in result.output
    assert "choose" not in result.output.lower()
    assert "recommend" not in result.output.lower()


def test_objective_list_human_default(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(tmp_path)
    root = tmp_path / ".asdl" / "objectives"
    _write_objective(root, "alpha")
    _write_objective(root, "zeta", closed=True)

    result = CliRunner().invoke(cli_group, ["list"])

    assert result.exit_code == 0, result.output
    # CliRunner runs without a tty so get_console() strips ANSI markup; the
    # plain-text fragments must be present.
    assert "Root:" in result.output
    assert ".asdl/objectives" in result.output
    assert "present" in result.output
    assert "Slug" in result.output
    assert "alpha" in result.output
    assert "zeta" not in result.output
    # The markdown table header is markdown-only and must not leak into
    # the human renderer's output.
    assert "| slug | state |" not in result.output


def test_objective_list_human_default_empty_says_no_open_records(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(tmp_path)
    root = tmp_path / ".asdl" / "objectives"
    _write_objective(root, "done", closed=True)

    result = CliRunner().invoke(cli_group, ["list"])

    assert result.exit_code == 0, result.output
    assert "No open objective records." in result.output


def test_objective_list_human_closed_empty_says_no_closed_records(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(tmp_path)
    root = tmp_path / ".asdl" / "objectives"
    _write_objective(root, "active")

    result = CliRunner().invoke(cli_group, ["list", "--state", "closed"])

    assert result.exit_code == 0, result.output
    assert "No closed objective records." in result.output


def test_objective_list_human_all_empty_omits_state_adjective(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(tmp_path)
    (tmp_path / ".asdl" / "objectives").mkdir(parents=True)

    result = CliRunner().invoke(cli_group, ["list", "--state", "all"])

    assert result.exit_code == 0, result.output
    assert "No objective records." in result.output
    assert "No open objective records." not in result.output
    assert "No closed objective records." not in result.output


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


def _branches_context(
    *,
    branches: tuple[str, ...],
    trunk_branch: str = "master",
    directories_by_ref_path: dict[tuple[str, str], tuple[str, ...]] | None = None,
    paths_at_ref: tuple[tuple[str, str], ...] = (),
    branch_head_iso_by_branch: dict[str, str] | None = None,
    commit_count_by_range: dict[str, int | GitCommandFailure] | None = None,
) -> ObjectiveCliContext:
    return ObjectiveCliContext(
        repo_root=Path("/repo"),
        trunk_branch=trunk_branch,
        git=FakeGitGateway(
            repo_root=Path("/repo"),
            branches=branches,
            trunk_branch=trunk_branch,
            directories_by_ref_path=directories_by_ref_path,
            paths_at_ref=paths_at_ref,
            branch_head_iso_by_branch=branch_head_iso_by_branch,
            commit_count_by_range=commit_count_by_range,
        ),
    )


def _invoke_branches_json(
    cli_group: ClinkrGroup,
    ctx: ObjectiveCliContext | ObjectiveCliUnavailable,
) -> Result:
    return CliRunner().invoke(
        cli_group,
        ["branches", "--format", "json"],
        obj=build_clinkr_context_object(lambda: ctx),
    )


def _invoke_branches_human(cli_group: ClinkrGroup, ctx: ObjectiveCliContext) -> Result:
    return CliRunner().invoke(
        cli_group,
        ["branches"],
        obj=build_clinkr_context_object(lambda: ctx),
    )


def _invoke_branches_md(cli_group: ClinkrGroup, ctx: ObjectiveCliContext) -> Result:
    return CliRunner().invoke(
        cli_group,
        ["branches", "--format", "md"],
        obj=build_clinkr_context_object(lambda: ctx),
    )


def _invoke_json(cli_group: ClinkrGroup, *args: str) -> Result:
    return CliRunner().invoke(
        cli_group,
        ["list", *args, "--format", "json"],
        obj=build_clinkr_context_object(lambda: object()),
    )


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
