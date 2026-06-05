"""End-to-end coverage for per-command host-tool preconditions over fakes."""

from __future__ import annotations

import json
from pathlib import Path

from click.testing import CliRunner

from areg.cli import main
from areg.context import AregContext
from areg.gateways.environment.fake import FakeAregEnvironment
from areg.gateways.environment.gateway import ToolName
from areg.gateways.gh.fake import FakeGhCli
from areg.gateways.npx_skills.fake import FakeNpxSkills


def _ctx(
    *,
    missing_tool: ToolName | None = None,
    npx: FakeNpxSkills | None = None,
) -> AregContext:
    available_tools: set[ToolName] = {"gh", "npx"}
    if missing_tool is not None:
        available_tools.remove(missing_tool)
    return AregContext(
        gh=FakeGhCli(),
        npx_skills=npx or FakeNpxSkills(),
        environment=FakeAregEnvironment(available_tools=available_tools),
    )


def _write_lockfile(project_dir: Path) -> None:
    project_dir.mkdir(parents=True, exist_ok=True)
    (project_dir / "skills-lock.json").write_text(
        json.dumps(
            {
                "version": 1,
                "skills": {
                    "skillx": {
                        "source": "dagster-io/asdl-tools",
                        "sourceType": "github",
                        "computedHash": "abc",
                    }
                },
            }
        ),
        encoding="utf-8",
    )


def test_init_requires_npx(tmp_path: Path) -> None:
    result = CliRunner().invoke(
        main,
        ["init", str(tmp_path)],
        obj=_ctx(missing_tool="npx"),
    )

    assert result.exit_code != 0
    assert "npx is required" in result.output
    # Fail-fast: no initialization files were created.
    assert not (tmp_path / "asdl.toml").exists()
    assert not (tmp_path / "areg.json").exists()


def test_skillx_list_requires_gh() -> None:
    result = CliRunner().invoke(
        main,
        ["exec", "skillx", "list", "--repo", "owner/repo"],
        obj=_ctx(missing_tool="gh"),
    )

    assert result.exit_code != 0
    assert "gh CLI is required" in result.output


def test_skillx_fetch_requires_npx() -> None:
    result = CliRunner().invoke(
        main,
        ["exec", "skillx", "fetch", "--repo", "owner/repo", "--skill", "my-skill"],
        obj=_ctx(missing_tool="npx"),
    )

    assert result.exit_code != 0
    assert "npx is required" in result.output


def test_update_skills_requires_npx_before_invoking_gateway(tmp_path: Path) -> None:
    project = tmp_path / "project"
    _write_lockfile(project)
    fake_npx = FakeNpxSkills()

    result = CliRunner().invoke(
        main,
        ["update-skills", "--path", str(project)],
        obj=_ctx(missing_tool="npx", npx=fake_npx),
    )

    assert result.exit_code != 0
    assert "npx is required" in result.output
    assert fake_npx.invocations == []


def test_update_skills_dry_run_does_not_require_npx(tmp_path: Path) -> None:
    project = tmp_path / "project"
    _write_lockfile(project)
    fake_npx = FakeNpxSkills()

    result = CliRunner().invoke(
        main,
        ["update-skills", "--path", str(project), "--dry-run"],
        obj=_ctx(missing_tool="npx", npx=fake_npx),
    )

    assert result.exit_code == 0, result.output
    assert fake_npx.invocations == []
    assert "dry-run" in result.output
