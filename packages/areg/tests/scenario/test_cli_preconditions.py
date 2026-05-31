"""End-to-end coverage for the per-command host-tool preconditions.

Each Click command that shells out to `gh` or `npx` calls
`requires_gh()` / `requires_npx()` from `areg.preconditions` as its
first statement. These tests patch `shutil.which` in that module to
return `None` and verify the friendly error reaches the user. Every
test passes an explicit `obj=_ctx()` so the only thing exercised is the
precondition call inside each command.
"""

from __future__ import annotations

from unittest.mock import patch

from click.testing import CliRunner

from areg.cli import main
from areg.context import AregContext
from areg.gateways.gh.fake import FakeGhCli
from areg.gateways.npx_skills.fake import FakeNpxSkills


def _ctx() -> AregContext:
    return AregContext(gh=FakeGhCli(), npx_skills=FakeNpxSkills())


def test_create_project_requires_npx(tmp_path) -> None:
    with patch("areg.preconditions.shutil.which", autospec=True, return_value=None):
        result = CliRunner().invoke(
            main,
            ["create-project", "x", "--path", str(tmp_path)],
            obj=_ctx(),
        )
    assert result.exit_code != 0
    assert "npx is required" in result.output
    # Fail-fast: project directory was never created.
    assert not (tmp_path / "x").exists()


def test_skillx_list_requires_gh() -> None:
    with patch("areg.preconditions.shutil.which", autospec=True, return_value=None):
        result = CliRunner().invoke(
            main,
            ["exec", "skillx", "list", "--repo", "owner/repo"],
            obj=_ctx(),
        )
    assert result.exit_code != 0
    assert "gh CLI is required" in result.output


def test_skillx_fetch_requires_npx() -> None:
    with patch("areg.preconditions.shutil.which", autospec=True, return_value=None):
        result = CliRunner().invoke(
            main,
            ["exec", "skillx", "fetch", "--repo", "owner/repo", "--skill", "my-skill"],
            obj=_ctx(),
        )
    assert result.exit_code != 0
    assert "npx is required" in result.output
