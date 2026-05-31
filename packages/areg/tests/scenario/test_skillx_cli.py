from __future__ import annotations

import json
import tempfile
from pathlib import Path

from click.testing import CliRunner

from areg.cli import main
from areg.context import AregContext
from areg.gateways.gh.fake import FakeGhCli
from areg.gateways.npx_skills.fake import FakeNpxSkills
from areg.gateways.npx_skills.gateway import SkillFiles


def _ctx(*, gh: FakeGhCli | None = None, npx: FakeNpxSkills | None = None) -> AregContext:
    return AregContext(
        gh=gh or FakeGhCli(),
        npx_skills=npx or FakeNpxSkills(),
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
    fake_npx = FakeNpxSkills(
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
        obj=_ctx(npx=fake_npx),
    )
    assert result.exit_code == 0
    data = json.loads(result.output)
    assert data["success"] is True
    assert data["skill"] == "my-skill"
    assert data["tmp_dir"] is not None

    assert len(fake_npx.invocations) == 1
    inv = fake_npx.invocations[0]
    assert inv.repo == "owner/repo"
    assert inv.skills == ("my-skill",)
    assert inv.agents == ("codex",)

    # Clean up the real temp dir fetch_skill created
    tmp = Path(data["tmp_dir"])
    if tmp.exists():
        __import__("shutil").rmtree(tmp)


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
# CLI integration: exec nsx
# ---------------------------------------------------------------------------


def test_nsx_list_uses_default_repo() -> None:
    fake_gh = FakeGhCli(catalog={"dagster-io/asdl-tools": {"skills": ["skill-a"]}})
    result = CliRunner().invoke(
        main,
        ["exec", "nsx", "list"],
        obj=_ctx(gh=fake_gh),
    )
    assert result.exit_code == 0
    data = json.loads(result.output)
    assert data["repo"] == "dagster-io/asdl-tools"
    assert fake_gh.calls == [("dagster-io/asdl-tools", "skills")]


def test_nsx_fetch_uses_default_repo() -> None:
    fake_npx = FakeNpxSkills(
        catalog={
            "dagster-io/asdl-tools": {
                "my-skill": SkillFiles(files={"SKILL.md": "---\nname: my-skill\n---\n"})
            }
        }
    )
    result = CliRunner().invoke(
        main,
        ["exec", "nsx", "fetch", "--skill", "my-skill"],
        obj=_ctx(npx=fake_npx),
    )
    assert result.exit_code == 0
    data = json.loads(result.output)
    assert data["repo"] == "dagster-io/asdl-tools"

    assert len(fake_npx.invocations) == 1
    assert fake_npx.invocations[0].repo == "dagster-io/asdl-tools"

    tmp = Path(data["tmp_dir"])
    if tmp.exists():
        __import__("shutil").rmtree(tmp)


def test_nsx_cleanup_works() -> None:
    tmp_dir = tempfile.mkdtemp(prefix="skillx.")
    result = CliRunner().invoke(
        main,
        ["exec", "nsx", "cleanup", "--dir", tmp_dir],
        obj=_ctx(),
    )
    assert result.exit_code == 0
    data = json.loads(result.output)
    assert data["success"] is True


# ---------------------------------------------------------------------------
# exec group is hidden
# ---------------------------------------------------------------------------


def test_exec_group_hidden_from_help() -> None:
    result = CliRunner().invoke(main, ["--help"], obj=_ctx())
    assert "exec" not in result.output
