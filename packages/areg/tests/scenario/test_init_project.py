from __future__ import annotations

import json
import subprocess
import tomllib
from pathlib import Path

import pytest
from click.testing import CliRunner

from areg.cli import main
from areg.context import AregContext
from areg.gateways.gh.fake import FakeGhCli
from areg.gateways.npx_skills.fake import FakeNpxSkills
from areg.gateways.npx_skills.gateway import NpxSkillsError, SkillFiles

BOOTSTRAP_REPO = "dagster-io/asdl-tools"


def _default_npx() -> FakeNpxSkills:
    return FakeNpxSkills(
        catalog={
            BOOTSTRAP_REPO: {
                "skill-management": SkillFiles(
                    files={"SKILL.md": "---\nname: skill-management\n---\n"}
                ),
                "skillx": SkillFiles(files={"SKILL.md": "---\nname: skillx\n---\n"}),
            }
        }
    )


def _ctx(*, npx: FakeNpxSkills | None = None) -> AregContext:
    return AregContext(
        gh=FakeGhCli(),
        npx_skills=npx or _default_npx(),
    )


class _SymlinkClaudeDirAfterAdd(FakeNpxSkills):
    def __init__(self, *, outside: Path) -> None:
        super().__init__(
            catalog={
                BOOTSTRAP_REPO: {
                    "skill-management": SkillFiles(
                        files={"SKILL.md": "---\nname: skill-management\n---\n"}
                    ),
                    "skillx": SkillFiles(files={"SKILL.md": "---\nname: skillx\n---\n"}),
                }
            },
            write_claude_symlinks=False,
        )
        self._outside = outside

    def add(
        self,
        repo: str,
        *,
        skills: list[str] | None,
        agents: list[str],
        cwd: Path,
    ) -> None:
        super().add(repo, skills=skills, agents=agents, cwd=cwd)
        self._outside.mkdir()
        (cwd / ".claude").symlink_to(self._outside, target_is_directory=True)


def _git_init(project_dir: Path) -> None:
    project_dir.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["git", "init"],
        cwd=project_dir,
        check=True,
        capture_output=True,
        text=True,
    )


def _read_toml(path: Path) -> dict:
    return tomllib.loads(path.read_text(encoding="utf-8"))


def _assert_init_error_before_install(
    tmp_path: Path,
    *,
    fake_npx: FakeNpxSkills,
    expected_output: str,
) -> None:
    result = CliRunner().invoke(main, ["init", str(tmp_path)], obj=_ctx(npx=fake_npx))

    assert result.exit_code != 0
    assert expected_output in result.output
    assert fake_npx.invocations == []
    assert not (tmp_path / ".agents").exists()
    assert not (tmp_path / "skills-lock.json").exists()


def test_init_initializes_existing_git_root(tmp_path: Path) -> None:
    _git_init(tmp_path)

    result = CliRunner().invoke(main, ["init", str(tmp_path)], obj=_ctx())

    assert result.exit_code == 0, result.output
    assert (tmp_path / ".agents" / "skills" / "skill-management").is_dir()
    assert (tmp_path / ".agents" / "skills" / "skillx").is_dir()
    assert (tmp_path / ".claude" / "skills" / "skill-management").is_symlink()
    assert (tmp_path / ".claude" / "skills" / "skillx").is_symlink()
    assert (tmp_path / "skills-lock.json").is_file()
    assert _read_toml(tmp_path / "asdl.toml") == {"areg": {"agents": ["codex", "claude-code"]}}
    assert not (tmp_path / "areg.json").exists()
    assert "<!-- areg:skills:start -->" in (tmp_path / "AGENTS.md").read_text(encoding="utf-8")
    claude_md = (tmp_path / "CLAUDE.md").read_text(encoding="utf-8")
    assert "<!-- areg:claude-skills:start -->" in claude_md
    assert "Claude Code discovers installed skills" in claude_md
    assert (tmp_path / ".claude" / "settings.local.json").is_file()
    assert not (tmp_path / ".gitignore").exists()
    assert f"Initialized areg in {tmp_path}" in result.output
    assert "Bootstrap skills installed: skill-management, skillx" in result.output
    assert "Review and commit generated files" in result.output
    assert "npx skills add" in result.output


def test_init_defaults_to_current_directory(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _git_init(tmp_path)
    monkeypatch.chdir(tmp_path)

    result = CliRunner().invoke(main, ["init"], obj=_ctx())

    assert result.exit_code == 0, result.output
    assert (tmp_path / "AGENTS.md").is_file()
    assert (tmp_path / "asdl.toml").is_file()
    assert not (tmp_path / "areg.json").exists()


def test_init_uses_custom_agents(tmp_path: Path) -> None:
    _git_init(tmp_path)
    fake_npx = _default_npx()

    result = CliRunner().invoke(
        main,
        ["init", str(tmp_path), "--agent", "codex", "--agent", "windsurf"],
        obj=_ctx(npx=fake_npx),
    )

    assert result.exit_code == 0, result.output
    assert _read_toml(tmp_path / "asdl.toml") == {"areg": {"agents": ["codex", "windsurf"]}}
    assert not (tmp_path / "areg.json").exists()
    assert len(fake_npx.invocations) == 1
    invocation = fake_npx.invocations[0]
    assert invocation.repo == BOOTSTRAP_REPO
    assert invocation.skills == ("skill-management", "skillx")
    assert invocation.agents == ("codex", "windsurf")
    assert invocation.cwd == tmp_path


def test_init_preserves_other_asdl_toml_sections_when_updating_areg(tmp_path: Path) -> None:
    _git_init(tmp_path)
    (tmp_path / "asdl.toml").write_text(
        '[roaster.diff]\nexclude = [".agents/skills/**/*.py"]\n\n[areg]\nagents = ["old"]\n',
        encoding="utf-8",
    )

    result = CliRunner().invoke(
        main,
        ["init", str(tmp_path), "--agent", "codex", "--agent", "windsurf"],
        obj=_ctx(),
    )

    assert result.exit_code == 0, result.output
    assert _read_toml(tmp_path / "asdl.toml") == {
        "roaster": {"diff": {"exclude": [".agents/skills/**/*.py"]}},
        "areg": {"agents": ["codex", "windsurf"]},
    }


def test_init_appends_areg_section_to_existing_asdl_toml(tmp_path: Path) -> None:
    _git_init(tmp_path)
    (tmp_path / "asdl.toml").write_text(
        '[roaster.diff]\nexclude = [".agents/skills/**/*.py"]\n',
        encoding="utf-8",
    )

    result = CliRunner().invoke(main, ["init", str(tmp_path)], obj=_ctx())

    assert result.exit_code == 0, result.output
    assert _read_toml(tmp_path / "asdl.toml") == {
        "roaster": {"diff": {"exclude": [".agents/skills/**/*.py"]}},
        "areg": {"agents": ["codex", "claude-code"]},
    }


def test_init_migrates_agents_from_legacy_areg_json(tmp_path: Path) -> None:
    _git_init(tmp_path)
    legacy_content = json.dumps({"agents": ["codex", "cursor"]})
    (tmp_path / "areg.json").write_text(legacy_content, encoding="utf-8")
    fake_npx = _default_npx()

    result = CliRunner().invoke(main, ["init", str(tmp_path)], obj=_ctx(npx=fake_npx))

    assert result.exit_code == 0, result.output
    assert _read_toml(tmp_path / "asdl.toml") == {"areg": {"agents": ["codex", "cursor"]}}
    assert (tmp_path / "areg.json").read_text(encoding="utf-8") == legacy_content
    assert fake_npx.invocations[0].agents == ("codex", "cursor")


def test_init_leaves_existing_claude_settings_unchanged(tmp_path: Path) -> None:
    _git_init(tmp_path)
    settings = tmp_path / ".claude" / "settings.local.json"
    settings.parent.mkdir()
    settings.write_text("custom settings\n", encoding="utf-8")

    result = CliRunner().invoke(main, ["init", str(tmp_path)], obj=_ctx())

    assert result.exit_code == 0, result.output
    assert settings.read_text(encoding="utf-8") == "custom settings\n"


def test_init_rejects_agents_md_symlink_before_install(tmp_path: Path) -> None:
    _git_init(tmp_path)
    outside = tmp_path / "outside-agents.md"
    outside.write_text("external agents\n", encoding="utf-8")
    (tmp_path / "AGENTS.md").symlink_to(outside)
    fake_npx = _default_npx()

    result = CliRunner().invoke(main, ["init", str(tmp_path)], obj=_ctx(npx=fake_npx))

    assert result.exit_code != 0
    assert "symlink" in result.output
    assert "refusing" in result.output.lower()
    assert fake_npx.invocations == []
    assert outside.read_text(encoding="utf-8") == "external agents\n"
    assert not (tmp_path / ".agents").exists()
    assert not (tmp_path / "skills-lock.json").exists()


def test_init_rejects_claude_md_symlink_before_install(tmp_path: Path) -> None:
    _git_init(tmp_path)
    outside = tmp_path / "outside-claude.md"
    outside.write_text("external claude\n", encoding="utf-8")
    (tmp_path / "CLAUDE.md").symlink_to(outside)
    fake_npx = _default_npx()

    result = CliRunner().invoke(main, ["init", str(tmp_path)], obj=_ctx(npx=fake_npx))

    assert result.exit_code != 0
    assert "symlink" in result.output
    assert "refusing" in result.output.lower()
    assert fake_npx.invocations == []
    assert outside.read_text(encoding="utf-8") == "external claude\n"
    assert not (tmp_path / ".agents").exists()
    assert not (tmp_path / "skills-lock.json").exists()


def test_init_rejects_asdl_toml_symlink_before_install(tmp_path: Path) -> None:
    _git_init(tmp_path)
    outside = tmp_path / "outside-asdl.toml"
    outside.write_text("[areg]\nagents = ['external']\n", encoding="utf-8")
    (tmp_path / "asdl.toml").symlink_to(outside)
    fake_npx = _default_npx()

    result = CliRunner().invoke(main, ["init", str(tmp_path)], obj=_ctx(npx=fake_npx))

    assert result.exit_code != 0
    assert "symlink" in result.output
    assert "refusing" in result.output.lower()
    assert fake_npx.invocations == []
    assert outside.read_text(encoding="utf-8") == "[areg]\nagents = ['external']\n"
    assert not (tmp_path / ".agents").exists()
    assert not (tmp_path / "skills-lock.json").exists()


def test_init_rejects_claude_dir_symlink_before_install(tmp_path: Path) -> None:
    _git_init(tmp_path)
    outside = tmp_path / "outside-claude-dir"
    outside.mkdir()
    (tmp_path / ".claude").symlink_to(outside, target_is_directory=True)
    fake_npx = _default_npx()

    result = CliRunner().invoke(main, ["init", str(tmp_path)], obj=_ctx(npx=fake_npx))

    assert result.exit_code != 0
    assert "symlink" in result.output
    assert "refusing" in result.output.lower()
    assert fake_npx.invocations == []
    assert not (outside / "settings.local.json").exists()
    assert not (tmp_path / ".agents").exists()
    assert not (tmp_path / "skills-lock.json").exists()


def test_init_rejects_claude_settings_symlink_before_install(tmp_path: Path) -> None:
    _git_init(tmp_path)
    claude_dir = tmp_path / ".claude"
    claude_dir.mkdir()
    outside = tmp_path / "outside-settings.local.json"
    outside.write_text("external settings\n", encoding="utf-8")
    (claude_dir / "settings.local.json").symlink_to(outside)
    fake_npx = _default_npx()

    result = CliRunner().invoke(main, ["init", str(tmp_path)], obj=_ctx(npx=fake_npx))

    assert result.exit_code != 0
    assert "symlink" in result.output
    assert "refusing" in result.output.lower()
    assert fake_npx.invocations == []
    assert outside.read_text(encoding="utf-8") == "external settings\n"
    assert not (tmp_path / ".agents").exists()
    assert not (tmp_path / "skills-lock.json").exists()


def test_init_revalidates_settings_parent_after_npx_install(tmp_path: Path) -> None:
    _git_init(tmp_path)
    outside = tmp_path / "outside-claude-after-install"
    fake_npx = _SymlinkClaudeDirAfterAdd(outside=outside)

    result = CliRunner().invoke(main, ["init", str(tmp_path)], obj=_ctx(npx=fake_npx))

    assert result.exit_code != 0
    assert "symlink" in result.output
    assert "refusing" in result.output.lower()
    assert len(fake_npx.invocations) == 1
    assert not (outside / "settings.local.json").exists()


def test_init_asdl_toml_directory_errors_before_install(tmp_path: Path) -> None:
    _git_init(tmp_path)
    (tmp_path / "asdl.toml").mkdir()
    fake_npx = _default_npx()

    _assert_init_error_before_install(
        tmp_path,
        fake_npx=fake_npx,
        expected_output="exists but is not a file",
    )


def test_init_agents_md_directory_errors_before_install(tmp_path: Path) -> None:
    _git_init(tmp_path)
    (tmp_path / "AGENTS.md").mkdir()
    fake_npx = _default_npx()

    _assert_init_error_before_install(
        tmp_path,
        fake_npx=fake_npx,
        expected_output="exists but is not a file",
    )


def test_init_claude_md_directory_errors_before_install(tmp_path: Path) -> None:
    _git_init(tmp_path)
    (tmp_path / "CLAUDE.md").mkdir()
    fake_npx = _default_npx()

    _assert_init_error_before_install(
        tmp_path,
        fake_npx=fake_npx,
        expected_output="exists but is not a file",
    )


def test_init_claude_path_file_errors_before_install(tmp_path: Path) -> None:
    _git_init(tmp_path)
    (tmp_path / ".claude").write_text("not a directory\n", encoding="utf-8")
    fake_npx = _default_npx()

    _assert_init_error_before_install(
        tmp_path,
        fake_npx=fake_npx,
        expected_output="exists but is not a directory",
    )


def test_init_claude_settings_directory_errors_before_install(tmp_path: Path) -> None:
    _git_init(tmp_path)
    settings = tmp_path / ".claude" / "settings.local.json"
    settings.mkdir(parents=True)
    fake_npx = _default_npx()

    _assert_init_error_before_install(
        tmp_path,
        fake_npx=fake_npx,
        expected_output="exists but is not a file",
    )


def test_init_rejects_nonexistent_target(tmp_path: Path) -> None:
    result = CliRunner().invoke(main, ["init", str(tmp_path / "missing")], obj=_ctx())

    assert result.exit_code != 0
    assert "does not exist" in result.output


def test_init_rejects_non_git_directory(tmp_path: Path) -> None:
    result = CliRunner().invoke(main, ["init", str(tmp_path)], obj=_ctx())

    assert result.exit_code != 0
    assert "must be a Git worktree root" in result.output
    assert "Run git init first" in result.output


def test_init_rejects_git_subdirectory(tmp_path: Path) -> None:
    _git_init(tmp_path)
    subdir = tmp_path / "subdir"
    subdir.mkdir()

    result = CliRunner().invoke(main, ["init", str(subdir)], obj=_ctx())

    assert result.exit_code != 0
    assert "is inside a Git worktree but is not the root" in result.output
    assert f"Run areg init {tmp_path}" in result.output


def test_init_existing_agents_md_prompt_no_leaves_file_unchanged(tmp_path: Path) -> None:
    _git_init(tmp_path)
    agents = tmp_path / "AGENTS.md"
    agents.write_text("# Existing instructions\n", encoding="utf-8")

    result = CliRunner().invoke(main, ["init", str(tmp_path)], obj=_ctx(), input="n\n")

    assert result.exit_code == 0, result.output
    assert agents.read_text(encoding="utf-8") == "# Existing instructions\n"


def test_init_existing_agents_md_prompt_yes_appends_block(tmp_path: Path) -> None:
    _git_init(tmp_path)
    agents = tmp_path / "AGENTS.md"
    agents.write_text("# Existing instructions\n", encoding="utf-8")

    result = CliRunner().invoke(main, ["init", str(tmp_path)], obj=_ctx(), input="y\n")

    assert result.exit_code == 0, result.output
    content = agents.read_text(encoding="utf-8")
    assert "# Existing instructions" in content
    assert "<!-- areg:skills:start -->" in content


def test_init_existing_agents_md_yes_flag_appends_block(tmp_path: Path) -> None:
    _git_init(tmp_path)
    agents = tmp_path / "AGENTS.md"
    agents.write_text("# Existing instructions\n", encoding="utf-8")

    result = CliRunner().invoke(main, ["init", str(tmp_path), "--yes"], obj=_ctx())

    assert result.exit_code == 0, result.output
    assert "<!-- areg:skills:start -->" in agents.read_text(encoding="utf-8")


def test_init_existing_agents_md_no_append_skips_block(tmp_path: Path) -> None:
    _git_init(tmp_path)
    agents = tmp_path / "AGENTS.md"
    agents.write_text("# Existing instructions\n", encoding="utf-8")

    result = CliRunner().invoke(main, ["init", str(tmp_path), "--no-append"], obj=_ctx())

    assert result.exit_code == 0, result.output
    assert agents.read_text(encoding="utf-8") == "# Existing instructions\n"
    assert (tmp_path / "CLAUDE.md").is_file()


def test_init_existing_claude_md_prompt_no_leaves_file_unchanged(tmp_path: Path) -> None:
    _git_init(tmp_path)
    claude = tmp_path / "CLAUDE.md"
    claude.write_text("# Existing Claude instructions\n", encoding="utf-8")

    result = CliRunner().invoke(main, ["init", str(tmp_path)], obj=_ctx(), input="n\n")

    assert result.exit_code == 0, result.output
    assert claude.read_text(encoding="utf-8") == "# Existing Claude instructions\n"


def test_init_existing_claude_md_prompt_yes_appends_block(tmp_path: Path) -> None:
    _git_init(tmp_path)
    claude = tmp_path / "CLAUDE.md"
    claude.write_text("# Existing Claude instructions\n", encoding="utf-8")

    result = CliRunner().invoke(main, ["init", str(tmp_path)], obj=_ctx(), input="y\n")

    assert result.exit_code == 0, result.output
    content = claude.read_text(encoding="utf-8")
    assert "# Existing Claude instructions" in content
    assert "<!-- areg:claude-skills:start -->" in content
    assert "@AGENTS.md" in content


def test_init_existing_claude_md_yes_flag_appends_block(tmp_path: Path) -> None:
    _git_init(tmp_path)
    claude = tmp_path / "CLAUDE.md"
    claude.write_text("# Existing Claude instructions\n", encoding="utf-8")

    result = CliRunner().invoke(main, ["init", str(tmp_path), "--yes"], obj=_ctx())

    assert result.exit_code == 0, result.output
    assert "<!-- areg:claude-skills:start -->" in claude.read_text(encoding="utf-8")


def test_init_existing_claude_md_no_append_skips_block(tmp_path: Path) -> None:
    _git_init(tmp_path)
    claude = tmp_path / "CLAUDE.md"
    claude.write_text("# Existing Claude instructions\n", encoding="utf-8")

    result = CliRunner().invoke(main, ["init", str(tmp_path), "--no-append"], obj=_ctx())

    assert result.exit_code == 0, result.output
    assert claude.read_text(encoding="utf-8") == "# Existing Claude instructions\n"
    assert (tmp_path / "AGENTS.md").is_file()


def test_init_claude_md_does_not_duplicate_existing_agents_include(tmp_path: Path) -> None:
    _git_init(tmp_path)
    claude = tmp_path / "CLAUDE.md"
    claude.write_text("# Existing Claude instructions\n\n@AGENTS.md\n", encoding="utf-8")

    result = CliRunner().invoke(main, ["init", str(tmp_path), "--yes"], obj=_ctx())

    assert result.exit_code == 0, result.output
    content = claude.read_text(encoding="utf-8")
    assert content.count("@AGENTS.md") == 1
    assert "Claude Code discovers installed skills" in content


def test_init_existing_marked_agents_block_prompt_no_leaves_old_block(tmp_path: Path) -> None:
    _git_init(tmp_path)
    agents = tmp_path / "AGENTS.md"
    original = "# Agents\n\n<!-- areg:skills:start -->\nold\n<!-- areg:skills:end -->\n"
    agents.write_text(original, encoding="utf-8")

    result = CliRunner().invoke(main, ["init", str(tmp_path)], obj=_ctx(), input="n\n")

    assert result.exit_code == 0, result.output
    assert agents.read_text(encoding="utf-8") == original


def test_init_existing_marked_agents_block_prompt_yes_replaces_old_block(tmp_path: Path) -> None:
    _git_init(tmp_path)
    agents = tmp_path / "AGENTS.md"
    agents.write_text(
        "# Agents\n\n<!-- areg:skills:start -->\nold\n<!-- areg:skills:end -->\n",
        encoding="utf-8",
    )

    result = CliRunner().invoke(main, ["init", str(tmp_path)], obj=_ctx(), input="y\n")

    assert result.exit_code == 0, result.output
    content = agents.read_text(encoding="utf-8")
    assert "old" not in content
    assert "Discover installed skills" in content


def test_init_existing_marked_agents_block_yes_flag_replaces_old_block(tmp_path: Path) -> None:
    _git_init(tmp_path)
    agents = tmp_path / "AGENTS.md"
    agents.write_text(
        "# Agents\n\n<!-- areg:skills:start -->\nold\n<!-- areg:skills:end -->\n",
        encoding="utf-8",
    )

    result = CliRunner().invoke(main, ["init", str(tmp_path), "--yes"], obj=_ctx())

    assert result.exit_code == 0, result.output
    assert "old" not in agents.read_text(encoding="utf-8")


def test_init_existing_marked_agents_block_no_append_leaves_old_block(tmp_path: Path) -> None:
    _git_init(tmp_path)
    agents = tmp_path / "AGENTS.md"
    original = "# Agents\n\n<!-- areg:skills:start -->\nold\n<!-- areg:skills:end -->\n"
    agents.write_text(original, encoding="utf-8")

    result = CliRunner().invoke(main, ["init", str(tmp_path), "--no-append"], obj=_ctx())

    assert result.exit_code == 0, result.output
    assert agents.read_text(encoding="utf-8") == original


def test_init_malformed_agents_marker_errors_before_install(tmp_path: Path) -> None:
    _git_init(tmp_path)
    agents = tmp_path / "AGENTS.md"
    original = "<!-- areg:skills:start -->\nold\n"
    agents.write_text(original, encoding="utf-8")
    fake_npx = _default_npx()

    result = CliRunner().invoke(main, ["init", str(tmp_path)], obj=_ctx(npx=fake_npx))

    assert result.exit_code != 0
    assert "malformed areg-managed block" in result.output
    assert fake_npx.invocations == []
    assert agents.read_text(encoding="utf-8") == original
    assert not (tmp_path / "asdl.toml").exists()
    assert not (tmp_path / "areg.json").exists()
    assert not (tmp_path / ".agents").exists()
    assert not (tmp_path / "skills-lock.json").exists()


def test_init_malformed_claude_marker_errors_before_install(tmp_path: Path) -> None:
    _git_init(tmp_path)
    claude = tmp_path / "CLAUDE.md"
    original = "<!-- areg:claude-skills:start -->\nold\n"
    claude.write_text(original, encoding="utf-8")
    fake_npx = _default_npx()

    result = CliRunner().invoke(main, ["init", str(tmp_path)], obj=_ctx(npx=fake_npx))

    assert result.exit_code != 0
    assert "malformed areg-managed block" in result.output
    assert fake_npx.invocations == []
    assert claude.read_text(encoding="utf-8") == original
    assert not (tmp_path / "asdl.toml").exists()
    assert not (tmp_path / "areg.json").exists()
    assert not (tmp_path / "AGENTS.md").exists()
    assert not (tmp_path / ".agents").exists()
    assert not (tmp_path / "skills-lock.json").exists()


@pytest.mark.parametrize(
    ("path_name", "content"),
    [
        (
            "AGENTS.md",
            "<!-- areg:skills:start -->\nold\n<!-- areg:skills:start -->\n"
            "<!-- areg:skills:end -->\n",
        ),
        (
            "CLAUDE.md",
            "<!-- areg:claude-skills:start -->\nold\n"
            "<!-- areg:claude-skills:end -->\n<!-- areg:claude-skills:end -->\n",
        ),
        (
            "AGENTS.md",
            "<!-- areg:skills:end -->\nold\n<!-- areg:skills:start -->\n",
        ),
    ],
)
def test_init_malformed_marker_variants_error_before_install(
    tmp_path: Path,
    path_name: str,
    content: str,
) -> None:
    _git_init(tmp_path)
    path = tmp_path / path_name
    path.write_text(content, encoding="utf-8")
    fake_npx = _default_npx()

    _assert_init_error_before_install(
        tmp_path,
        fake_npx=fake_npx,
        expected_output="malformed areg-managed block",
    )
    assert path.read_text(encoding="utf-8") == content
    assert not (tmp_path / "asdl.toml").exists()
    assert not (tmp_path / "areg.json").exists()


def test_init_invalid_areg_json_errors_before_install(tmp_path: Path) -> None:
    _git_init(tmp_path)
    areg_json = tmp_path / "areg.json"
    original = "{not json\n"
    areg_json.write_text(original, encoding="utf-8")
    fake_npx = _default_npx()

    result = CliRunner().invoke(main, ["init", str(tmp_path)], obj=_ctx(npx=fake_npx))

    assert result.exit_code != 0
    assert "Invalid JSON in areg.json" in result.output
    assert fake_npx.invocations == []
    assert areg_json.read_text(encoding="utf-8") == original
    assert not (tmp_path / "asdl.toml").exists()
    assert not (tmp_path / ".agents").exists()
    assert not (tmp_path / "skills-lock.json").exists()


def test_init_non_object_areg_json_errors_before_install(tmp_path: Path) -> None:
    _git_init(tmp_path)
    areg_json = tmp_path / "areg.json"
    areg_json.write_text("[]\n", encoding="utf-8")
    fake_npx = _default_npx()

    result = CliRunner().invoke(main, ["init", str(tmp_path)], obj=_ctx(npx=fake_npx))

    assert result.exit_code != 0
    assert "areg.json must contain a JSON object" in result.output
    assert fake_npx.invocations == []
    assert areg_json.read_text(encoding="utf-8") == "[]\n"
    assert not (tmp_path / "asdl.toml").exists()
    assert not (tmp_path / ".agents").exists()
    assert not (tmp_path / "skills-lock.json").exists()


def test_init_explicit_agents_ignore_invalid_legacy_areg_json(tmp_path: Path) -> None:
    _git_init(tmp_path)
    areg_json = tmp_path / "areg.json"
    original = "{not json\n"
    areg_json.write_text(original, encoding="utf-8")
    fake_npx = _default_npx()

    result = CliRunner().invoke(
        main,
        ["init", str(tmp_path), "--agent", "codex", "--agent", "windsurf"],
        obj=_ctx(npx=fake_npx),
    )

    assert result.exit_code == 0, result.output
    assert _read_toml(tmp_path / "asdl.toml") == {"areg": {"agents": ["codex", "windsurf"]}}
    assert areg_json.read_text(encoding="utf-8") == original
    assert fake_npx.invocations[0].agents == ("codex", "windsurf")


def test_init_asdl_toml_agents_ignore_invalid_legacy_areg_json(tmp_path: Path) -> None:
    _git_init(tmp_path)
    (tmp_path / "asdl.toml").write_text('[areg]\nagents = ["codex", "cursor"]\n', encoding="utf-8")
    areg_json = tmp_path / "areg.json"
    original = "{not json\n"
    areg_json.write_text(original, encoding="utf-8")
    fake_npx = _default_npx()

    result = CliRunner().invoke(main, ["init", str(tmp_path)], obj=_ctx(npx=fake_npx))

    assert result.exit_code == 0, result.output
    assert _read_toml(tmp_path / "asdl.toml") == {"areg": {"agents": ["codex", "cursor"]}}
    assert areg_json.read_text(encoding="utf-8") == original
    assert fake_npx.invocations[0].agents == ("codex", "cursor")


def test_init_invalid_asdl_toml_errors_before_install(tmp_path: Path) -> None:
    _git_init(tmp_path)
    asdl_toml = tmp_path / "asdl.toml"
    original = "[areg\n"
    asdl_toml.write_text(original, encoding="utf-8")
    fake_npx = _default_npx()

    result = CliRunner().invoke(main, ["init", str(tmp_path)], obj=_ctx(npx=fake_npx))

    assert result.exit_code != 0
    assert "Invalid TOML" in result.output
    assert fake_npx.invocations == []
    assert asdl_toml.read_text(encoding="utf-8") == original
    assert not (tmp_path / ".agents").exists()
    assert not (tmp_path / "skills-lock.json").exists()


def test_init_rejects_yes_with_no_append(tmp_path: Path) -> None:
    result = CliRunner().invoke(main, ["init", str(tmp_path), "--yes", "--no-append"], obj=_ctx())

    assert result.exit_code != 0
    assert "--yes and --no-append cannot be used together" in result.output


def test_init_npx_failure_is_non_destructive(tmp_path: Path) -> None:
    _git_init(tmp_path)
    readme = tmp_path / "README.md"
    readme.write_text("keep me\n", encoding="utf-8")

    result = CliRunner().invoke(
        main,
        ["init", str(tmp_path)],
        obj=_ctx(npx=FakeNpxSkills(raise_on_add=NpxSkillsError("boom"))),
    )

    assert result.exit_code != 0
    assert "npx skills add failed: boom" in result.output
    assert tmp_path.is_dir()
    assert readme.read_text(encoding="utf-8") == "keep me\n"
    assert not (tmp_path / "asdl.toml").exists()
    assert not (tmp_path / "areg.json").exists()
    assert not (tmp_path / "AGENTS.md").exists()
    assert not (tmp_path / "CLAUDE.md").exists()
    assert not (tmp_path / ".claude" / "settings.local.json").exists()


def test_init_npx_failure_preserves_existing_planned_files(tmp_path: Path) -> None:
    _git_init(tmp_path)
    asdl_toml = tmp_path / "asdl.toml"
    agents = tmp_path / "AGENTS.md"
    claude = tmp_path / "CLAUDE.md"
    settings = tmp_path / ".claude" / "settings.local.json"
    settings.parent.mkdir()

    original_asdl_toml = (
        '[roaster.diff]\nexclude = [".agents/skills/**/*.py"]\n\n[areg]\nagents = ["old"]\n'
    )
    original_agents = "# Existing agent instructions\n"
    original_claude = "# Existing Claude instructions\n"
    original_settings = '{"custom": true}\n'
    asdl_toml.write_text(original_asdl_toml, encoding="utf-8")
    agents.write_text(original_agents, encoding="utf-8")
    claude.write_text(original_claude, encoding="utf-8")
    settings.write_text(original_settings, encoding="utf-8")
    fake_npx = FakeNpxSkills(raise_on_add=NpxSkillsError("boom"))

    result = CliRunner().invoke(
        main,
        ["init", str(tmp_path), "--yes"],
        obj=_ctx(npx=fake_npx),
    )

    assert result.exit_code != 0
    assert "npx skills add failed: boom" in result.output
    assert len(fake_npx.invocations) == 1
    assert asdl_toml.read_text(encoding="utf-8") == original_asdl_toml
    assert agents.read_text(encoding="utf-8") == original_agents
    assert claude.read_text(encoding="utf-8") == original_claude
    assert settings.read_text(encoding="utf-8") == original_settings
    assert not (tmp_path / ".agents").exists()
    assert not (tmp_path / "skills-lock.json").exists()


def test_create_project_command_is_removed() -> None:
    result = CliRunner().invoke(main, ["create-project", "x"], obj=_ctx())

    assert result.exit_code != 0
    assert "No such command 'create-project'" in result.output
