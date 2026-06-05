from __future__ import annotations

import json
import tempfile

from click.testing import CliRunner

from areg.cli import main
from areg.context import AregContext
from areg.gateways.environment.fake import FakeAregEnvironment
from areg.gateways.gh.fake import FakeGhCli
from areg.gateways.npx_skills.fake import FakeNpxSkills
from areg.gateways.npx_skills.gateway import SkillFiles
from areg.gateways.skillx_workspace.fake import FakeSkillxWorkspaceInstaller


def _ctx(
    *,
    gh: FakeGhCli | None = None,
    npx: FakeNpxSkills | None = None,
    skillx_workspace: FakeSkillxWorkspaceInstaller | None = None,
) -> AregContext:
    return AregContext(
        gh=gh or FakeGhCli(),
        npx_skills=npx or FakeNpxSkills(),
        environment=FakeAregEnvironment(),
        skillx_workspace=skillx_workspace or FakeSkillxWorkspaceInstaller(),
    )


# ---------------------------------------------------------------------------
# CLI integration: exec skillx
# ---------------------------------------------------------------------------


def test_skillx_parse_json_output() -> None:
    result = CliRunner().invoke(
        main,
        ["exec", "skillx", "parse", "dagster-io/asdl-tools --skill my-skill"],
        obj=_ctx(),
    )
    assert result.exit_code == 0
    data = json.loads(result.output)
    assert data["success"] is True
    assert data["repo"] == "dagster-io/asdl-tools"
    assert data["skill"] == "my-skill"


def test_skillx_parse_failure_json() -> None:
    result = CliRunner().invoke(
        main,
        ["exec", "skillx", "parse", "not a repo"],
        obj=_ctx(),
    )
    data = json.loads(result.output)
    assert data["success"] is False


def test_skillx_list_json_output() -> None:
    fake_gh = FakeGhCli(catalog={"owner/repo": {"skills": ["skill-a", "skill-b"]}})
    result = CliRunner().invoke(
        main,
        ["exec", "skillx", "list", "--repo", "owner/repo"],
        obj=_ctx(gh=fake_gh),
    )
    assert result.exit_code == 0
    data = json.loads(result.output)
    assert data["success"] is True
    assert data["skills"] == ["skill-a", "skill-b"]
    assert fake_gh.calls == [("owner/repo", "skills")]


def test_skillx_fetch_json_output() -> None:
    fake_workspace = FakeSkillxWorkspaceInstaller(
        catalog={
            "owner/repo": {
                "my-skill": SkillFiles(
                    files={
                        "SKILL.md": "---\nname: my-skill\n---\n",
                        "references/patterns.md": "# Patterns\n",
                    }
                )
            }
        }
    )
    result = CliRunner().invoke(
        main,
        ["exec", "skillx", "fetch", "--repo", "owner/repo", "--skill", "my-skill"],
        obj=_ctx(skillx_workspace=fake_workspace),
    )
    assert result.exit_code == 0
    data = json.loads(result.output)
    assert data["success"] is True
    assert data["skill"] == "my-skill"
    assert data["tmp_dir"] == "/tmp/skillx.fake-1"
    assert data["skill_dir"] == "/tmp/skillx.fake-1/.agents/skills/my-skill"
    assert data["skill_md"] == "/tmp/skillx.fake-1/.agents/skills/my-skill/SKILL.md"
    assert data["files"] == ["SKILL.md", "references/patterns.md"]

    assert len(fake_workspace.invocations) == 1
    invocation = fake_workspace.invocations[0]
    assert invocation.repo == "owner/repo"
    assert invocation.skill == "my-skill"


def test_skillx_cleanup_json_output() -> None:
    tmp_dir = tempfile.mkdtemp(prefix="skillx.")
    result = CliRunner().invoke(
        main,
        ["exec", "skillx", "cleanup", "--dir", tmp_dir],
        obj=_ctx(),
    )
    assert result.exit_code == 0
    data = json.loads(result.output)
    assert data["success"] is True
    assert data["removed"] == tmp_dir


def test_skillx_cleanup_failure_exit_code() -> None:
    result = CliRunner().invoke(
        main,
        ["exec", "skillx", "cleanup", "--dir", "/usr/local/bin"],
        obj=_ctx(),
    )
    assert result.exit_code != 0


# ---------------------------------------------------------------------------
# exec group is hidden
# ---------------------------------------------------------------------------


def test_exec_group_hidden_from_help() -> None:
    result = CliRunner().invoke(main, ["--help"], obj=_ctx())
    assert "exec" not in result.output
