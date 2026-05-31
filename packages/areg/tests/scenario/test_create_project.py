from __future__ import annotations

import json

import pytest
from click.testing import CliRunner

from areg.cli import main
from areg.context import AregContext
from areg.gateways.gh.fake import FakeGhCli
from areg.gateways.npx_skills.fake import FakeNpxSkills
from areg.gateways.npx_skills.gateway import NpxSkillsError, SkillFiles


def _default_npx() -> FakeNpxSkills:
    """A FakeNpxSkills pre-loaded with the skills create-project installs."""
    return FakeNpxSkills(
        catalog={
            "dagster-io/asdl-tools": {
                "ns-install": SkillFiles(files={"SKILL.md": "---\nname: ns-install\n---\n"}),
                "ns-skill-management": SkillFiles(
                    files={"SKILL.md": "---\nname: ns-skill-management\n---\n"}
                ),
                "ns-skillx": SkillFiles(files={"SKILL.md": "---\nname: ns-skillx\n---\n"}),
                "nsx": SkillFiles(files={"SKILL.md": "---\nname: nsx\n---\n"}),
            }
        }
    )


def _ctx(*, npx: FakeNpxSkills | None = None) -> AregContext:
    return AregContext(
        gh=FakeGhCli(),
        npx_skills=npx or _default_npx(),
    )


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


def test_create_project_creates_expected_structure(tmp_path) -> None:
    result = CliRunner().invoke(
        main,
        ["create-project", "myapp", "--path", str(tmp_path)],
        obj=_ctx(),
    )

    assert result.exit_code == 0, result.output
    project = tmp_path / "myapp"

    # Directories exist
    assert (project / ".agents" / "skills" / "ns-install").is_dir()
    assert (project / ".agents" / "skills" / "ns-skill-management").is_dir()
    assert (project / ".agents" / "skills" / "ns-skillx").is_dir()
    assert (project / ".agents" / "skills" / "nsx").is_dir()

    # Claude symlinks exist and resolve
    assert (project / ".claude" / "skills" / "ns-install").is_symlink()
    assert (project / ".claude" / "skills" / "ns-skill-management").is_symlink()
    assert (project / ".claude" / "skills" / "ns-skillx").is_symlink()
    assert (project / ".claude" / "skills" / "nsx").is_symlink()

    # Generated files
    assert (project / "AGENTS.md").is_file()
    assert (project / "CLAUDE.md").is_file()
    assert (project / ".gitignore").is_file()
    assert (project / ".claude" / "settings.local.json").is_file()
    assert (project / "skills-lock.json").is_file()
    assert (project / "areg.json").is_file()


def test_create_project_agents_md_content(tmp_path) -> None:
    CliRunner().invoke(
        main,
        ["create-project", "myapp", "--path", str(tmp_path)],
        obj=_ctx(),
    )

    content = (tmp_path / "myapp" / "AGENTS.md").read_text()
    assert "Skill Directory Layout" in content
    assert "SKILL.md` frontmatter" in content
    assert "Do not maintain a duplicate list" in content
    assert "Available skills" not in content


def test_create_project_claude_md_has_project_name(tmp_path) -> None:
    CliRunner().invoke(
        main,
        ["create-project", "myapp", "--path", str(tmp_path)],
        obj=_ctx(),
    )

    content = (tmp_path / "myapp" / "CLAUDE.md").read_text()
    assert "# myapp" in content
    assert "@AGENTS.md" in content


def test_create_project_areg_json_default_agents(tmp_path) -> None:
    CliRunner().invoke(
        main,
        ["create-project", "myapp", "--path", str(tmp_path)],
        obj=_ctx(),
    )

    config = json.loads((tmp_path / "myapp" / "areg.json").read_text())
    assert config["agents"] == ["codex", "claude-code"]


def test_create_project_areg_json_custom_agents(tmp_path) -> None:
    CliRunner().invoke(
        main,
        [
            "create-project",
            "myapp",
            "--path",
            str(tmp_path),
            "--agent",
            "codex",
            "--agent",
            "windsurf",
        ],
        obj=_ctx(),
    )

    config = json.loads((tmp_path / "myapp" / "areg.json").read_text())
    assert config["agents"] == ["codex", "windsurf"]


def test_create_project_settings_local_json(tmp_path) -> None:
    CliRunner().invoke(
        main,
        ["create-project", "myapp", "--path", str(tmp_path)],
        obj=_ctx(),
    )

    settings = json.loads((tmp_path / "myapp" / ".claude" / "settings.local.json").read_text())
    assert "Bash(npx skills:*)" in settings["permissions"]["allow"]


# ---------------------------------------------------------------------------
# Npx invocation
# ---------------------------------------------------------------------------


def test_create_project_npx_invocation_default_agents(tmp_path) -> None:
    fake_npx = _default_npx()
    CliRunner().invoke(
        main,
        ["create-project", "myapp", "--path", str(tmp_path)],
        obj=_ctx(npx=fake_npx),
    )

    assert len(fake_npx.invocations) == 1
    inv = fake_npx.invocations[0]
    assert inv.repo == "dagster-io/asdl-tools"
    assert inv.skills == ("ns-install", "ns-skill-management", "ns-skillx", "nsx")
    assert inv.agents == ("codex", "claude-code")
    assert inv.cwd == tmp_path / "myapp"


def test_create_project_npx_invocation_custom_agents(tmp_path) -> None:
    fake_npx = _default_npx()
    CliRunner().invoke(
        main,
        [
            "create-project",
            "myapp",
            "--path",
            str(tmp_path),
            "--agent",
            "codex",
            "--agent",
            "windsurf",
        ],
        obj=_ctx(npx=fake_npx),
    )

    inv = fake_npx.invocations[0]
    assert inv.agents == ("codex", "windsurf")


# ---------------------------------------------------------------------------
# --path option
# ---------------------------------------------------------------------------


def test_create_project_creates_in_specified_parent(tmp_path) -> None:
    parent = tmp_path / "subdir"
    parent.mkdir()
    result = CliRunner().invoke(
        main,
        ["create-project", "myapp", "--path", str(parent)],
        obj=_ctx(),
    )

    assert result.exit_code == 0
    assert (parent / "myapp" / "AGENTS.md").is_file()


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------


def test_create_project_rejects_existing_directory(tmp_path) -> None:
    (tmp_path / "myapp").mkdir()
    result = CliRunner().invoke(
        main,
        ["create-project", "myapp", "--path", str(tmp_path)],
        obj=_ctx(),
    )

    assert result.exit_code != 0
    assert "already exists" in result.output


@pytest.mark.parametrize("name", ["../foo", ".hidden", "has space", "a/b"])
def test_create_project_rejects_invalid_name(tmp_path, name: str) -> None:
    result = CliRunner().invoke(
        main,
        ["create-project", name, "--path", str(tmp_path)],
        obj=_ctx(),
    )

    assert result.exit_code != 0
    assert "Invalid project name" in result.output


def test_create_project_rejects_nonexistent_parent(tmp_path) -> None:
    result = CliRunner().invoke(
        main,
        ["create-project", "myapp", "--path", str(tmp_path / "nope")],
        obj=_ctx(),
    )

    assert result.exit_code != 0
    assert "does not exist" in result.output


# ---------------------------------------------------------------------------
# Cleanup on failure
# ---------------------------------------------------------------------------


def test_create_project_cleanup_on_npx_failure(tmp_path) -> None:
    result = CliRunner().invoke(
        main,
        ["create-project", "myapp", "--path", str(tmp_path)],
        obj=_ctx(npx=FakeNpxSkills(raise_on_add=NpxSkillsError("boom"))),
    )

    assert result.exit_code != 0
    assert not (tmp_path / "myapp").exists()
