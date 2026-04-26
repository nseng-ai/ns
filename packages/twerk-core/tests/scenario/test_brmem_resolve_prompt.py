from __future__ import annotations

import json
from pathlib import Path

import pytest
from click.testing import CliRunner

from twerk_core.brmem.context import BrmemCliContext
from twerk_core.brmem.fake import FakeBranchMemoryGateway
from twerk_core.brmem.main import build_cli
from twerk_core.clinkr.context import ClinkrContextObject, build_clinkr_context_object
from twerk_core.clinkr.group import ClinkrGroup
from twerk_core.git.testing import FakeGitGateway


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


def _make_obj(
    *,
    repo_root: Path,
    home_root: Path,
    in_repo: bool = True,
) -> ClinkrContextObject:
    git_gateway = FakeGitGateway(
        repo_root=repo_root,
        git_common_dir=(repo_root / ".git") if in_repo else None,
    )
    ctx = BrmemCliContext(
        brmem_gateway=FakeBranchMemoryGateway(),
        git_gateway=git_gateway,
        home_root=home_root,
    )
    return build_clinkr_context_object(lambda: ctx)


def _seed(path: Path, body: str = "x") -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body, encoding="utf-8")
    return path


def test_resolves_project_local(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    repo_root = tmp_path / "repo"
    home_root = tmp_path / "home"
    project_path = _seed(repo_root / ".twerk" / "prompts" / "foo.md")

    result = CliRunner().invoke(
        cli_group,
        ["exec", "resolve-prompt", "foo", "--format", "json"],
        obj=_make_obj(repo_root=repo_root, home_root=home_root),
    )

    payload = json.loads(result.output)
    assert result.exit_code == 0, result.output
    assert payload == {
        "exit_code": 0,
        "data": {"path": str(project_path), "tier": "project"},
    }


def test_falls_back_to_global(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    repo_root = tmp_path / "repo"
    home_root = tmp_path / "home"
    repo_root.mkdir()
    global_path = _seed(home_root / ".twerk" / "prompts" / "foo.md")

    result = CliRunner().invoke(
        cli_group,
        ["exec", "resolve-prompt", "foo", "--format", "json"],
        obj=_make_obj(repo_root=repo_root, home_root=home_root),
    )

    payload = json.loads(result.output)
    assert result.exit_code == 0, result.output
    assert payload == {
        "exit_code": 0,
        "data": {"path": str(global_path), "tier": "global"},
    }


def test_project_wins_over_global(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    repo_root = tmp_path / "repo"
    home_root = tmp_path / "home"
    project_path = _seed(repo_root / ".twerk" / "prompts" / "foo.md", body="project")
    _seed(home_root / ".twerk" / "prompts" / "foo.md", body="global")

    result = CliRunner().invoke(
        cli_group,
        ["exec", "resolve-prompt", "foo", "--format", "json"],
        obj=_make_obj(repo_root=repo_root, home_root=home_root),
    )

    payload = json.loads(result.output)
    assert result.exit_code == 0, result.output
    assert payload["data"]["tier"] == "project"
    assert payload["data"]["path"] == str(project_path)


def test_neither_exists_returns_failure(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    repo_root = tmp_path / "repo"
    home_root = tmp_path / "home"
    repo_root.mkdir()

    result = CliRunner().invoke(
        cli_group,
        ["exec", "resolve-prompt", "foo", "--format", "json"],
        obj=_make_obj(repo_root=repo_root, home_root=home_root),
    )

    payload = json.loads(result.output)
    assert result.exit_code == 2
    assert payload["exit_code"] == 2
    assert payload["error_type"] == "prompt-not-found"
    assert str(repo_root / ".twerk" / "prompts" / "foo.md") in payload["message"]
    assert str(home_root / ".twerk" / "prompts" / "foo.md") in payload["message"]
    assert "just install-tools" in payload["message"]


def test_not_in_git_repo(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    repo_root = tmp_path / "repo"
    home_root = tmp_path / "home"
    _seed(home_root / ".twerk" / "prompts" / "foo.md")

    result = CliRunner().invoke(
        cli_group,
        ["exec", "resolve-prompt", "foo", "--format", "json"],
        obj=_make_obj(repo_root=repo_root, home_root=home_root, in_repo=False),
    )

    payload = json.loads(result.output)
    assert result.exit_code == 2
    assert payload["exit_code"] == 2
    assert payload["error_type"] == "not-a-git-repo"
    assert "Not inside a git repository" in payload["message"]


def test_human_render_prints_path_to_stdout(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    repo_root = tmp_path / "repo"
    home_root = tmp_path / "home"
    project_path = _seed(repo_root / ".twerk" / "prompts" / "foo.md")

    result = CliRunner().invoke(
        cli_group,
        ["exec", "resolve-prompt", "foo"],
        obj=_make_obj(repo_root=repo_root, home_root=home_root),
    )

    assert result.exit_code == 0, result.output
    assert result.stdout.strip() == str(project_path)
    assert "tier: project" in result.stderr
