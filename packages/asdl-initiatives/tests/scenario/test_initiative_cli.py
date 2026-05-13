from __future__ import annotations

import json
from pathlib import Path

import pytest
from click.testing import CliRunner, Result

from asdl_core.clinkr.context import build_clinkr_context_object
from asdl_core.clinkr.group import ClinkrGroup
from asdl_core.git.testing import FakeGitGateway
from asdl_core.git.types import DetachedHead, GitPathChange
from asdl_initiatives.context import InitiativeCliContext
from asdl_initiatives.main import build_cli


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


def test_initiative_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["-h"])

    assert result.exit_code == 0
    assert "Usage: initiative" in result.output
    assert "Work with checked-in Initiative records." in result.output
    assert "--version" in result.output
    assert "exec" not in result.output


def test_initiative_version(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["--version"])

    assert result.exit_code == 0
    assert "version" in result.output.lower()


def test_initiative_exec_is_hidden_but_invocable(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["exec", "--help"])

    assert result.exit_code == 0
    assert "Usage: initiative exec" in result.output
    assert "Commands for use by initiative skills." in result.output
    assert "list" in result.output
    assert "read-initiative" in result.output
    assert "tracking-gate-facts" in result.output

    result = CliRunner().invoke(cli_group, ["exec", "list", "--help"])

    assert result.exit_code == 0
    assert "Usage: initiative exec list" in result.output
    assert "List checked-in Initiative record directories" in result.output

    result = CliRunner().invoke(cli_group, ["exec", "read-initiative", "--help"])

    assert result.exit_code == 0
    assert "Usage: initiative exec read-initiative" in result.output
    assert "Read one Initiative record by explicit slug" in result.output

    result = CliRunner().invoke(cli_group, ["exec", "tracking-gate-facts", "--help"])

    assert result.exit_code == 0
    assert "Usage: initiative exec tracking-gate-facts" in result.output
    assert "Collect changed-path facts for an Initiative tracking gate" in result.output


def test_initiative_exec_list_absent_root(
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
            "root_path": ".asdl/initiatives",
            "root_exists": False,
            "entries": [],
        },
    }


def test_initiative_exec_list_empty_root(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(tmp_path)
    (tmp_path / ".asdl" / "initiatives").mkdir(parents=True)

    result = _invoke_json(cli_group)

    assert result.exit_code == 0, result.output
    assert json.loads(result.output)["data"] == {
        "root_path": ".asdl/initiatives",
        "root_exists": True,
        "entries": [],
    }


def test_initiative_exec_list_sorts_open_and_closed_records(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(tmp_path)
    root = tmp_path / ".asdl" / "initiatives"
    _write_initiative(root, "zeta", closed=True)
    _write_initiative(root, "alpha")

    result = _invoke_json(cli_group)

    assert result.exit_code == 0, result.output
    entries = json.loads(result.output)["data"]["entries"]
    assert [entry["slug"] for entry in entries] == ["alpha", "zeta"]
    assert entries[0]["path"] == ".asdl/initiatives/alpha"
    assert entries[0]["closed"] is False
    assert entries[1]["path"] == ".asdl/initiatives/zeta"
    assert entries[1]["closed"] is True
    assert entries[1]["files"]["closed_md"] is True


def test_initiative_exec_list_reports_missing_required_files(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(tmp_path)
    root = tmp_path / ".asdl" / "initiatives"
    (root / "partial").mkdir(parents=True)

    result = _invoke_json(cli_group)

    assert result.exit_code == 0, result.output
    entry = json.loads(result.output)["data"]["entries"][0]
    assert entry["files"] == {
        "initiative_md": False,
        "roadmap_md": False,
        "updates_dir": False,
        "closed_md": False,
    }
    assert entry["update_count"] == 0


def test_initiative_exec_list_counts_direct_markdown_updates_only(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(tmp_path)
    root = tmp_path / ".asdl" / "initiatives"
    initiative_path = _write_initiative(root, "counter", updates=("first.md", "second.md"))
    updates_dir = initiative_path / "updates"
    (updates_dir / "notes.txt").write_text("not markdown\n", encoding="utf-8")
    nested_dir = updates_dir / "nested"
    nested_dir.mkdir()
    (nested_dir / "third.md").write_text("nested update\n", encoding="utf-8")
    (updates_dir / "directory.md").mkdir()

    result = _invoke_json(cli_group)

    assert result.exit_code == 0, result.output
    entry = json.loads(result.output)["data"]["entries"][0]
    assert entry["update_count"] == 2


def test_initiative_exec_list_ignores_non_directory_root_entries(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(tmp_path)
    root = tmp_path / ".asdl" / "initiatives"
    root.mkdir(parents=True)
    (root / ".gitkeep").write_text("", encoding="utf-8")
    (root / "not-an-initiative.md").write_text("ignored\n", encoding="utf-8")
    _write_initiative(root, "real")

    result = _invoke_json(cli_group)

    assert result.exit_code == 0, result.output
    entries = json.loads(result.output)["data"]["entries"]
    assert [entry["slug"] for entry in entries] == ["real"]


def test_initiative_exec_list_format_md(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(tmp_path)
    root = tmp_path / ".asdl" / "initiatives"
    _write_initiative(root, "alpha", updates=("progress.md",))

    result = CliRunner().invoke(cli_group, ["exec", "list", "--format", "md"])

    assert result.exit_code == 0, result.output
    assert "Root: `.asdl/initiatives` (present)" in result.output
    assert "| slug | state | files | updates | path |" in result.output
    assert (
        "| alpha | open | initiative.md:yes, roadmap.md:yes, updates/:yes, closed.md:no | "
        "1 | `.asdl/initiatives/alpha` |"
    ) in result.output
    assert "choose" not in result.output.lower()
    assert "recommend" not in result.output.lower()


def test_initiative_exec_read_missing_slug_returns_stable_json(
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
        "message": "Missing Initiative slug. Pass an explicit slug.",
        "data": _empty_read_data(status="missing_slug", error="missing_slug"),
    }


@pytest.mark.parametrize("slug", ("foo/bar", ".asdl/initiatives/foo", ".", ".."))
def test_initiative_exec_read_rejects_path_shaped_slug(
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
        "message": f"Invalid Initiative slug {slug!r}. Pass a single slug, not a path.",
        "data": _empty_read_data(status="invalid_slug", error="invalid_slug"),
    }


def test_initiative_exec_read_absent_record_returns_facts(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(tmp_path)

    result = _invoke_read_json(cli_group, "ghost")

    assert result.exit_code == 1
    assert json.loads(result.output) == {
        "exit_code": 1,
        "message": "No Initiative record found for slug 'ghost'.",
        "data": _empty_read_data(
            status="not_found",
            error="not_found",
            slug="ghost",
            path=".asdl/initiatives/ghost",
        ),
    }


def test_initiative_exec_read_complete_open_record_json(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(tmp_path)
    root = tmp_path / ".asdl" / "initiatives"
    _write_initiative(root, "alpha", updates=("second.md", "first.md"))

    result = _invoke_read_json(cli_group, "alpha")

    assert result.exit_code == 0, result.output
    assert json.loads(result.output) == {
        "exit_code": 0,
        "data": {
            "status": "ok",
            "error": None,
            "root_path": ".asdl/initiatives",
            "root_exists": True,
            "slug": "alpha",
            "path": ".asdl/initiatives/alpha",
            "exists": True,
            "closed": False,
            "files": {
                "initiative_md": True,
                "roadmap_md": True,
                "updates_dir": True,
                "closed_md": False,
            },
            "updates": [
                {
                    "name": "first.md",
                    "path": ".asdl/initiatives/alpha/updates/first.md",
                },
                {
                    "name": "second.md",
                    "path": ".asdl/initiatives/alpha/updates/second.md",
                },
            ],
            "update_count": 2,
        },
    }


def test_initiative_exec_read_closed_record_json(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(tmp_path)
    root = tmp_path / ".asdl" / "initiatives"
    _write_initiative(root, "done", closed=True)

    result = _invoke_read_json(cli_group, "done")

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)["data"]
    assert data["closed"] is True
    assert data["files"]["closed_md"] is True


def test_initiative_exec_read_incomplete_record_json_succeeds(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(tmp_path)
    root = tmp_path / ".asdl" / "initiatives"
    (root / "partial").mkdir(parents=True)

    result = _invoke_read_json(cli_group, "partial")

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)["data"]
    assert data["files"] == {
        "initiative_md": False,
        "roadmap_md": False,
        "updates_dir": False,
        "closed_md": False,
    }
    assert data["updates"] == []
    assert data["update_count"] == 0


def test_initiative_exec_read_markdown_includes_raw_files_sorted_updates(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(tmp_path)
    record = tmp_path / ".asdl" / "initiatives" / "story"
    updates_dir = record / "updates"
    updates_dir.mkdir(parents=True)
    (record / "initiative.md").write_text("# Raw Initiative\nbody sentinel\n", encoding="utf-8")
    (record / "roadmap.md").write_text("# Raw Roadmap\n- [ ] roadmap sentinel\n", encoding="utf-8")
    (updates_dir / "b-later.md").write_text("# Later\nlater sentinel\n", encoding="utf-8")
    (updates_dir / "a-earlier.md").write_text("# Earlier\nearlier sentinel\n", encoding="utf-8")
    (updates_dir / "notes.txt").write_text("not markdown\n", encoding="utf-8")

    result = CliRunner().invoke(cli_group, ["exec", "read-initiative", "story", "--format", "md"])

    assert result.exit_code == 0, result.output
    assert "# Initiative `story`" in result.output
    assert "## initiative.md" in result.output
    assert "# Raw Initiative\nbody sentinel" in result.output
    assert "## roadmap.md" in result.output
    assert "# Raw Roadmap\n- [ ] roadmap sentinel" in result.output
    assert result.output.index("## updates/a-earlier.md") < result.output.index(
        "## updates/b-later.md"
    )
    assert "# Earlier\nearlier sentinel" in result.output
    assert "# Later\nlater sentinel" in result.output
    assert "not markdown" not in result.output


def test_initiative_exec_read_markdown_notes_missing_files(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(tmp_path)
    record = tmp_path / ".asdl" / "initiatives" / "partial"
    record.mkdir(parents=True)

    result = CliRunner().invoke(cli_group, ["exec", "read-initiative", "partial", "--format", "md"])

    assert result.exit_code == 0, result.output
    assert "_Missing `initiative.md`._" in result.output
    assert "_Missing `roadmap.md`._" in result.output
    assert "_Missing `updates/` directory._" in result.output


def test_initiative_exec_read_json_omits_raw_markdown_content(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(tmp_path)
    root = tmp_path / ".asdl" / "initiatives"
    record = _write_initiative(root, "quiet", updates=("update.md",))
    (record / "initiative.md").write_text("private initiative body sentinel\n", encoding="utf-8")
    (record / "roadmap.md").write_text("private roadmap body sentinel\n", encoding="utf-8")
    (record / "updates" / "update.md").write_text(
        "private update body sentinel\n",
        encoding="utf-8",
    )

    result = _invoke_read_json(cli_group, "quiet")

    assert result.exit_code == 0, result.output
    assert "private initiative body sentinel" not in result.output
    assert "private roadmap body sentinel" not in result.output
    assert "private update body sentinel" not in result.output


def test_initiative_exec_tracking_gate_missing_base_ref_returns_stable_json(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(tmp_path)

    result = _invoke_tracking_json(cli_group, "alpha", base_ref=None)

    assert result.exit_code == 1
    assert "Usage:" not in result.output
    assert "Usage:" not in result.stderr
    assert json.loads(result.output) == {
        "exit_code": 1,
        "message": "Missing base ref. Pass --base-ref <ref>.",
        "data": _empty_tracking_data(status="missing_base_ref", error="missing_base_ref"),
    }


def test_initiative_exec_tracking_gate_invalid_selection_returns_stable_json(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(tmp_path)

    result = _invoke_tracking_json(cli_group, "docs/plan.md", base_ref="main")

    assert result.exit_code == 1
    assert "Usage:" not in result.output
    assert "Usage:" not in result.stderr
    assert json.loads(result.output) == {
        "exit_code": 1,
        "message": (
            "Invalid Initiative selection 'docs/plan.md'. "
            "Pass a slug or path under .asdl/initiatives/<slug>/."
        ),
        "data": _empty_tracking_data(
            status="invalid_selection",
            error="invalid_selection",
            base_ref="main",
        ),
    }


def test_initiative_exec_tracking_gate_classifies_selected_other_and_non_initiative(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(tmp_path)
    root = tmp_path / ".asdl" / "initiatives"
    _write_initiative(root, "alpha", closed=True)
    _write_initiative(root, "beta")
    cwd = Path.cwd()
    git_gateway = FakeGitGateway(
        current_branch_by_path={cwd: "feature/initiative"},
        working_tree_changes_by_path={
            cwd: (
                GitPathChange(status="M", path=".asdl/initiatives/alpha/roadmap.md"),
                GitPathChange(status="M", path=".asdl/initiatives/beta/initiative.md"),
                GitPathChange(status="M", path="packages/asdl/example.py"),
            )
        },
    )

    result = _invoke_tracking_json(cli_group, "alpha", base_ref="main", git_gateway=git_gateway)

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)["data"]
    assert data["selected"] == {
        "input": "alpha",
        "slug": "alpha",
        "path": ".asdl/initiatives/alpha",
        "exists": True,
        "closed": True,
    }
    assert data["current_branch"] == {
        "status": "branch",
        "name": "feature/initiative",
        "error": None,
        "returncode": None,
    }
    assert data["buckets"]["selected_initiative"]["working_tree"] == [
        {
            "status": "M",
            "path": ".asdl/initiatives/alpha/roadmap.md",
            "old_path": None,
            "initiative_slugs": ["alpha"],
        }
    ]
    assert data["buckets"]["other_initiatives"]["working_tree"] == [
        {
            "status": "M",
            "path": ".asdl/initiatives/beta/initiative.md",
            "old_path": None,
            "initiative_slugs": ["beta"],
        }
    ]
    assert data["buckets"]["non_initiative"]["working_tree"] == [
        {
            "status": "M",
            "path": "packages/asdl/example.py",
            "old_path": None,
            "initiative_slugs": [],
        }
    ]


def test_initiative_exec_tracking_gate_separates_working_tree_index_and_committed(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(tmp_path)
    root = tmp_path / ".asdl" / "initiatives"
    _write_initiative(root, "alpha")
    cwd = Path.cwd()
    git_gateway = FakeGitGateway(
        current_branch_by_path={cwd: DetachedHead()},
        working_tree_changes_by_path={
            cwd: (GitPathChange(status="M", path=".asdl/initiatives/alpha/roadmap.md"),)
        },
        index_changes_by_path={
            cwd: (GitPathChange(status="A", path=".asdl/initiatives/alpha/updates/progress.md"),)
        },
        range_changes_by_key={
            (cwd, "origin/main"): (GitPathChange(status="M", path="packages/asdl/example.py"),)
        },
    )

    result = _invoke_tracking_json(
        cli_group,
        ".asdl/initiatives/alpha/initiative.md",
        base_ref="origin/main",
        git_gateway=git_gateway,
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)["data"]
    assert data["base_ref"] == "origin/main"
    assert data["current_branch"]["status"] == "detached"
    assert [
        change["path"] for change in data["buckets"]["selected_initiative"]["working_tree"]
    ] == [".asdl/initiatives/alpha/roadmap.md"]
    assert [change["path"] for change in data["buckets"]["selected_initiative"]["index"]] == [
        ".asdl/initiatives/alpha/updates/progress.md"
    ]
    assert [change["path"] for change in data["buckets"]["non_initiative"]["committed"]] == [
        "packages/asdl/example.py"
    ]


def test_initiative_exec_tracking_gate_markdown_output(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(tmp_path)
    root = tmp_path / ".asdl" / "initiatives"
    _write_initiative(root, "alpha")
    cwd = Path.cwd()
    git_gateway = FakeGitGateway(
        current_branch_by_path={cwd: "feature/alpha"},
        working_tree_changes_by_path={
            cwd: (GitPathChange(status="??", path=".asdl/initiatives/alpha/updates/new.md"),)
        },
        range_changes_by_key={
            (cwd, "main"): (GitPathChange(status="M", path="packages/asdl/example.py"),)
        },
    )

    result = _invoke_tracking_md(cli_group, "alpha", base_ref="main", git_gateway=git_gateway)

    assert result.exit_code == 0, result.output
    assert "# Initiative Tracking Gate Facts" in result.output
    assert (
        "Selected Initiative: `alpha` (`.asdl/initiatives/alpha`, present, open)" in result.output
    )
    assert "Base ref: `main`" in result.output
    assert "Current branch: `feature/alpha`" in result.output
    assert "| selected_initiative | 1 | 0 | 0 |" in result.output
    assert "| non_initiative | 0 | 0 | 1 |" in result.output
    assert (
        "| working_tree | selected_initiative | ?? | `.asdl/initiatives/alpha/updates/new.md` |"
        in result.output
    )
    assert "| committed | non_initiative | M | `packages/asdl/example.py` |" in result.output
    assert "recommend" not in result.output.lower()
    assert "material" not in result.output.lower()


def _invoke_json(cli_group: ClinkrGroup) -> Result:
    return CliRunner().invoke(
        cli_group,
        ["exec", "list", "--format", "json"],
        obj=build_clinkr_context_object(lambda: object()),
    )


def _invoke_read_json(cli_group: ClinkrGroup, slug: str | None = None) -> Result:
    args = ["exec", "read-initiative"]
    if slug is not None:
        args.append(slug)
    args.extend(("--format", "json"))
    return CliRunner().invoke(
        cli_group,
        args,
        obj=build_clinkr_context_object(lambda: object()),
    )


def _invoke_tracking_json(
    cli_group: ClinkrGroup,
    slug_or_path: str,
    *,
    base_ref: str | None,
    git_gateway: FakeGitGateway | None = None,
) -> Result:
    args = ["exec", "tracking-gate-facts", slug_or_path]
    if base_ref is not None:
        args.extend(("--base-ref", base_ref))
    args.extend(("--format", "json"))
    return CliRunner().invoke(
        cli_group,
        args,
        obj=build_clinkr_context_object(
            lambda: InitiativeCliContext(git_gateway=git_gateway or FakeGitGateway())
        ),
    )


def _invoke_tracking_md(
    cli_group: ClinkrGroup,
    slug_or_path: str,
    *,
    base_ref: str,
    git_gateway: FakeGitGateway,
) -> Result:
    return CliRunner().invoke(
        cli_group,
        [
            "exec",
            "tracking-gate-facts",
            slug_or_path,
            "--base-ref",
            base_ref,
            "--format",
            "md",
        ],
        obj=build_clinkr_context_object(lambda: InitiativeCliContext(git_gateway=git_gateway)),
    )


def _empty_tracking_data(
    *,
    status: str,
    error: str,
    base_ref: str | None = None,
) -> dict[str, object]:
    return {
        "status": status,
        "error": error,
        "root_path": ".asdl/initiatives",
        "root_exists": False,
        "selected": None,
        "base_ref": base_ref,
        "current_branch": None,
        "buckets": _empty_tracking_buckets(),
    }


def _empty_tracking_buckets() -> dict[str, object]:
    empty = {"working_tree": [], "index": [], "committed": []}
    return {
        "selected_initiative": empty,
        "other_initiatives": empty,
        "non_initiative": empty,
    }


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
        "root_path": ".asdl/initiatives",
        "root_exists": False,
        "slug": slug,
        "path": path,
        "exists": False,
        "closed": False,
        "files": {
            "initiative_md": False,
            "roadmap_md": False,
            "updates_dir": False,
            "closed_md": False,
        },
        "updates": [],
        "update_count": 0,
    }


def _write_initiative(
    root: Path,
    slug: str,
    *,
    closed: bool = False,
    updates: tuple[str, ...] = (),
) -> Path:
    path = root / slug
    path.mkdir(parents=True)
    (path / "initiative.md").write_text(f"# {slug}\n", encoding="utf-8")
    (path / "roadmap.md").write_text("# Roadmap\n", encoding="utf-8")
    updates_dir = path / "updates"
    updates_dir.mkdir()
    for update_name in updates:
        (updates_dir / update_name).write_text("# Update\n", encoding="utf-8")
    if closed:
        (path / "closed.md").write_text("closed\n", encoding="utf-8")
    return path
