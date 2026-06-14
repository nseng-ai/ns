from __future__ import annotations

from pathlib import Path

from click.testing import CliRunner

from areg.cli import main
from areg.context import AregContext
from areg.gateways.environment.fake import FakeAregEnvironment
from areg.gateways.gh.fake import FakeGhCli
from areg.gateways.npx_skills.fake import FakeNpxSkills
from areg.gateways.skillx_workspace.fake import FakeSkillxWorkspaceInstaller
from areg.invoke_only import CODEX_OPENAI_POLICY as _CODEX_OPENAI_POLICY
from asdl_core.testing import symlink_or_skip


def _ctx(project_dir: Path) -> AregContext:
    resolved_project_dir = project_dir.resolve()
    return AregContext(
        gh=FakeGhCli(),
        npx_skills=FakeNpxSkills(),
        environment=FakeAregEnvironment(git_roots={resolved_project_dir: resolved_project_dir}),
        skillx_workspace=FakeSkillxWorkspaceInstaller(),
    )


def _write_local_skill(project_dir: Path, name: str, skill_md: str | None = None) -> Path:
    skill_dir = project_dir / "skills" / name
    skill_dir.mkdir(parents=True, exist_ok=True)
    skill_md_path = skill_dir / "SKILL.md"
    skill_md_path.write_text(skill_md or f"---\nname: {name}\n---\n\n# {name}\n", encoding="utf-8")
    return skill_md_path


def _write_github_skill(project_dir: Path, name: str) -> None:
    skill_dir = project_dir / ".agents" / "skills" / name
    skill_dir.mkdir(parents=True)
    (skill_dir / "SKILL.md").write_text(f"---\nname: {name}\n---\n", encoding="utf-8")


def _symlink_path(link_path: Path, target: Path, *, target_is_directory: bool) -> None:
    link_path.parent.mkdir(parents=True, exist_ok=True)
    symlink_or_skip(link_path, target, target_is_directory=target_is_directory)


def _install_agents_skill_symlink(project_dir: Path, name: str) -> Path:
    link_path = project_dir / ".agents" / "skills" / name
    _symlink_path(link_path, Path("..") / ".." / "skills" / name, target_is_directory=True)
    return link_path


def _install_claude_skill_symlink(project_dir: Path, name: str) -> Path:
    link_path = project_dir / ".claude" / "skills" / name
    _symlink_path(
        link_path,
        Path("..") / ".." / ".agents" / "skills" / name,
        target_is_directory=True,
    )
    return link_path


def _sidecar(project_dir: Path, name: str) -> Path:
    return project_dir / "skills" / name / "agents" / "openai.yaml"


def test_command_convert_single_skill(tmp_path: Path) -> None:
    skill_md = _write_local_skill(tmp_path, "my-skill")

    result = CliRunner().invoke(
        main,
        ["command", "convert", "--path", str(tmp_path), "my-skill"],
        obj=_ctx(tmp_path),
    )

    assert result.exit_code == 0, result.output
    assert skill_md.read_text(encoding="utf-8").startswith(
        "---\nname: my-skill\ndisable-model-invocation: true\n---\n"
    )
    assert _sidecar(tmp_path, "my-skill").read_text(encoding="utf-8") == _CODEX_OPENAI_POLICY
    assert "Converting my-skill" in result.output


def test_command_convert_multiple_skills(tmp_path: Path) -> None:
    _write_local_skill(tmp_path, "first")
    _write_local_skill(tmp_path, "second")

    result = CliRunner().invoke(
        main,
        ["command", "convert", "--path", str(tmp_path), "first", "second"],
        obj=_ctx(tmp_path),
    )

    assert result.exit_code == 0, result.output
    assert "disable-model-invocation: true" in (
        tmp_path / "skills" / "first" / "SKILL.md"
    ).read_text(encoding="utf-8")
    assert "disable-model-invocation: true" in (
        tmp_path / "skills" / "second" / "SKILL.md"
    ).read_text(encoding="utf-8")
    assert _sidecar(tmp_path, "first").is_file()
    assert _sidecar(tmp_path, "second").is_file()


def test_command_convert_is_idempotent(tmp_path: Path) -> None:
    skill_md = _write_local_skill(
        tmp_path,
        "my-skill",
        "---\nname: my-skill\ndisable-model-invocation: true\n---\n\n# body\n",
    )
    _sidecar(tmp_path, "my-skill").parent.mkdir(parents=True)
    _sidecar(tmp_path, "my-skill").write_text(_CODEX_OPENAI_POLICY, encoding="utf-8")
    before = skill_md.read_text(encoding="utf-8")

    result = CliRunner().invoke(
        main,
        ["command", "convert", "--path", str(tmp_path), "my-skill"],
        obj=_ctx(tmp_path),
    )

    assert result.exit_code == 0, result.output
    assert skill_md.read_text(encoding="utf-8") == before
    assert _sidecar(tmp_path, "my-skill").read_text(encoding="utf-8") == _CODEX_OPENAI_POLICY
    assert "Skipped" in result.output


def test_command_convert_preserves_complex_frontmatter(tmp_path: Path) -> None:
    content = (
        "---\n"
        "name: complex-skill\n"
        "# keep this comment\n"
        "description: |\n"
        "  First line.\n"
        "  Second line.\n"
        "allowed-tools:\n"
        "  - Bash\n"
        "  - Read\n"
        "---\n"
        "\n"
        "# Body\n"
    )
    skill_md = _write_local_skill(tmp_path, "complex-skill", content)

    result = CliRunner().invoke(
        main,
        ["command", "convert", "--path", str(tmp_path), "complex-skill"],
        obj=_ctx(tmp_path),
    )

    assert result.exit_code == 0, result.output
    assert skill_md.read_text(encoding="utf-8") == content.replace(
        "name: complex-skill\n",
        "name: complex-skill\ndisable-model-invocation: true\n",
        1,
    )


def test_command_convert_dry_run_writes_nothing(tmp_path: Path) -> None:
    skill_md = _write_local_skill(tmp_path, "my-skill")
    before = skill_md.read_text(encoding="utf-8")

    result = CliRunner().invoke(
        main,
        ["command", "convert", "--dry-run", "--path", str(tmp_path), "my-skill"],
        obj=_ctx(tmp_path),
    )

    assert result.exit_code == 0, result.output
    assert skill_md.read_text(encoding="utf-8") == before
    assert not _sidecar(tmp_path, "my-skill").exists()
    assert "Would write" in result.output


def test_command_convert_accepts_canonical_skill_dir_path(tmp_path: Path) -> None:
    skill_md = _write_local_skill(tmp_path, "dir-skill")

    result = CliRunner().invoke(
        main,
        ["command", "convert", "--path", str(tmp_path), str(tmp_path / "skills" / "dir-skill")],
        obj=_ctx(tmp_path),
    )

    assert result.exit_code == 0, result.output
    assert "disable-model-invocation: true" in skill_md.read_text(encoding="utf-8")
    assert _sidecar(tmp_path, "dir-skill").read_text(encoding="utf-8") == _CODEX_OPENAI_POLICY
    assert "Converting dir-skill" in result.output


def test_command_convert_accepts_project_relative_skill_dir_path(tmp_path: Path) -> None:
    skill_md = _write_local_skill(tmp_path, "relative-skill")

    result = CliRunner().invoke(
        main,
        ["command", "convert", "--path", str(tmp_path), "skills/relative-skill"],
        obj=_ctx(tmp_path),
    )

    assert result.exit_code == 0, result.output
    assert "disable-model-invocation: true" in skill_md.read_text(encoding="utf-8")
    assert _sidecar(tmp_path, "relative-skill").is_file()
    assert "Converting relative-skill" in result.output


def test_command_convert_accepts_skill_md_path(tmp_path: Path) -> None:
    skill_md = _write_local_skill(tmp_path, "md-skill")

    result = CliRunner().invoke(
        main,
        ["command", "convert", "--path", str(tmp_path), "skills/md-skill/SKILL.md"],
        obj=_ctx(tmp_path),
    )

    assert result.exit_code == 0, result.output
    assert "disable-model-invocation: true" in skill_md.read_text(encoding="utf-8")
    assert _sidecar(tmp_path, "md-skill").is_file()
    assert "Converting md-skill" in result.output


def test_command_convert_accepts_agents_symlink_path(tmp_path: Path) -> None:
    skill_md = _write_local_skill(tmp_path, "agents-skill")
    agents_skill_dir = _install_agents_skill_symlink(tmp_path, "agents-skill")

    result = CliRunner().invoke(
        main,
        ["command", "convert", "--path", str(tmp_path), str(agents_skill_dir)],
        obj=_ctx(tmp_path),
    )

    assert result.exit_code == 0, result.output
    assert "disable-model-invocation: true" in skill_md.read_text(encoding="utf-8")
    assert _sidecar(tmp_path, "agents-skill").is_file()
    assert "Converting agents-skill" in result.output
    assert agents_skill_dir.is_symlink()


def test_command_convert_accepts_claude_symlink_path(tmp_path: Path) -> None:
    skill_md = _write_local_skill(tmp_path, "claude-skill")
    _install_agents_skill_symlink(tmp_path, "claude-skill")
    claude_skill_dir = _install_claude_skill_symlink(tmp_path, "claude-skill")

    result = CliRunner().invoke(
        main,
        ["command", "convert", "--path", str(tmp_path), str(claude_skill_dir)],
        obj=_ctx(tmp_path),
    )

    assert result.exit_code == 0, result.output
    assert "disable-model-invocation: true" in skill_md.read_text(encoding="utf-8")
    assert _sidecar(tmp_path, "claude-skill").is_file()
    assert "Converting claude-skill" in result.output
    assert claude_skill_dir.is_symlink()


def test_command_convert_rejects_real_agents_skill_path(tmp_path: Path) -> None:
    _write_github_skill(tmp_path, "remote-skill")

    result = CliRunner().invoke(
        main,
        [
            "command",
            "convert",
            "--path",
            str(tmp_path),
            str(tmp_path / ".agents" / "skills" / "remote-skill"),
        ],
        obj=_ctx(tmp_path),
    )

    assert result.exit_code != 0
    assert "does not resolve to a local skill under skills/<name>" in result.output
    assert not (tmp_path / ".agents" / "skills" / "remote-skill" / "agents").exists()


def test_command_convert_rejects_symlinked_canonical_skill_dir_path(tmp_path: Path) -> None:
    _write_local_skill(tmp_path, "target-skill")
    _symlink_path(
        tmp_path / "skills" / "linked-skill",
        Path("target-skill"),
        target_is_directory=True,
    )

    result = CliRunner().invoke(
        main,
        ["command", "convert", "--path", str(tmp_path), "skills/linked-skill"],
        obj=_ctx(tmp_path),
    )

    assert result.exit_code != 0
    assert "is a symlink; refusing to edit it" in result.output
    assert not _sidecar(tmp_path, "target-skill").exists()


def test_command_convert_rejects_symlinked_canonical_skill_md_path(tmp_path: Path) -> None:
    _write_local_skill(tmp_path, "target-md")
    linked_dir = tmp_path / "skills" / "linked-md"
    linked_dir.mkdir(parents=True)
    _symlink_path(
        linked_dir / "SKILL.md",
        Path("..") / "target-md" / "SKILL.md",
        target_is_directory=False,
    )

    result = CliRunner().invoke(
        main,
        ["command", "convert", "--path", str(tmp_path), "skills/linked-md/SKILL.md"],
        obj=_ctx(tmp_path),
    )

    assert result.exit_code != 0
    assert "SKILL.md" in result.output
    assert "symlink" in result.output
    assert not _sidecar(tmp_path, "target-md").exists()


def test_command_convert_help_describes_path_arguments(tmp_path: Path) -> None:
    result = CliRunner().invoke(
        main,
        ["command", "convert", "--help"],
        obj=_ctx(tmp_path),
    )

    assert result.exit_code == 0, result.output
    assert "SKILL may be a local skill name or a path" in result.output
    assert "skills/pr-address/SKILL.md" in result.output
    assert ".agents/skills/pr-address" in result.output


def test_command_convert_rejects_github_skill(tmp_path: Path) -> None:
    _write_github_skill(tmp_path, "remote-skill")

    result = CliRunner().invoke(
        main,
        ["command", "convert", "--path", str(tmp_path), "remote-skill"],
        obj=_ctx(tmp_path),
    )

    assert result.exit_code != 0
    assert "not a local skill" in result.output
    assert not (tmp_path / ".agents" / "skills" / "remote-skill" / "agents").exists()


def test_command_convert_rejects_missing_skill(tmp_path: Path) -> None:
    result = CliRunner().invoke(
        main,
        ["command", "convert", "--path", str(tmp_path), "missing-skill"],
        obj=_ctx(tmp_path),
    )

    assert result.exit_code != 0
    assert "Local skill missing-skill not found" in result.output


def test_command_revert_removes_flag_sidecar_and_empty_agents_dir(tmp_path: Path) -> None:
    skill_md = _write_local_skill(
        tmp_path,
        "my-skill",
        "---\nname: my-skill\ndisable-model-invocation: true\n---\n\n# body\n",
    )
    _sidecar(tmp_path, "my-skill").parent.mkdir(parents=True)
    _sidecar(tmp_path, "my-skill").write_text(_CODEX_OPENAI_POLICY, encoding="utf-8")

    result = CliRunner().invoke(
        main,
        ["command", "revert", "--path", str(tmp_path), "my-skill"],
        obj=_ctx(tmp_path),
    )

    assert result.exit_code == 0, result.output
    assert skill_md.read_text(encoding="utf-8") == "---\nname: my-skill\n---\n\n# body\n"
    assert not _sidecar(tmp_path, "my-skill").exists()
    assert not (tmp_path / "skills" / "my-skill" / "agents").exists()


def test_command_revert_accepts_skill_dir_path(tmp_path: Path) -> None:
    skill_md = _write_local_skill(
        tmp_path,
        "path-revert",
        "---\nname: path-revert\ndisable-model-invocation: true\n---\n\n# body\n",
    )
    _sidecar(tmp_path, "path-revert").parent.mkdir(parents=True)
    _sidecar(tmp_path, "path-revert").write_text(_CODEX_OPENAI_POLICY, encoding="utf-8")

    result = CliRunner().invoke(
        main,
        ["command", "revert", "--path", str(tmp_path), "skills/path-revert"],
        obj=_ctx(tmp_path),
    )

    assert result.exit_code == 0, result.output
    assert skill_md.read_text(encoding="utf-8") == "---\nname: path-revert\n---\n\n# body\n"
    assert not _sidecar(tmp_path, "path-revert").exists()
    assert "Reverting path-revert" in result.output


def test_command_revert_is_idempotent(tmp_path: Path) -> None:
    skill_md = _write_local_skill(tmp_path, "my-skill")
    before = skill_md.read_text(encoding="utf-8")

    result = CliRunner().invoke(
        main,
        ["command", "revert", "--path", str(tmp_path), "my-skill"],
        obj=_ctx(tmp_path),
    )

    assert result.exit_code == 0, result.output
    assert skill_md.read_text(encoding="utf-8") == before
    assert not _sidecar(tmp_path, "my-skill").exists()
    assert "Skipped" in result.output


def test_command_round_trip_restores_skill_md_byte_for_byte(tmp_path: Path) -> None:
    skill_md = _write_local_skill(
        tmp_path,
        "roundtrip",
        "---\nname: roundtrip\ndescription: keep me\n---\n\n# body\n",
    )
    before = skill_md.read_text(encoding="utf-8")

    convert_result = CliRunner().invoke(
        main,
        ["command", "convert", "--path", str(tmp_path), "roundtrip"],
        obj=_ctx(tmp_path),
    )
    revert_result = CliRunner().invoke(
        main,
        ["command", "revert", "--path", str(tmp_path), "roundtrip"],
        obj=_ctx(tmp_path),
    )

    assert convert_result.exit_code == 0, convert_result.output
    assert revert_result.exit_code == 0, revert_result.output
    assert skill_md.read_text(encoding="utf-8") == before
    assert not _sidecar(tmp_path, "roundtrip").exists()


def test_command_list_reports_statuses(tmp_path: Path) -> None:
    _write_local_skill(tmp_path, "normal")
    _write_local_skill(
        tmp_path,
        "invoke-only",
        "---\nname: invoke-only\ndisable-model-invocation: true\n---\n",
    )
    _sidecar(tmp_path, "invoke-only").parent.mkdir(parents=True)
    _sidecar(tmp_path, "invoke-only").write_text(_CODEX_OPENAI_POLICY, encoding="utf-8")
    _write_local_skill(
        tmp_path,
        "missing-sidecar",
        "---\nname: missing-sidecar\ndisable-model-invocation: true\n---\n",
    )
    _write_local_skill(tmp_path, "sidecar-only")
    _sidecar(tmp_path, "sidecar-only").parent.mkdir(parents=True)
    _sidecar(tmp_path, "sidecar-only").write_text(_CODEX_OPENAI_POLICY, encoding="utf-8")

    result = CliRunner().invoke(
        main,
        ["command", "list", "--path", str(tmp_path)],
        obj=_ctx(tmp_path),
    )

    assert result.exit_code == 0, result.output
    assert "invoke-only\tinvoke-only" in result.output
    assert "normal\tnormal" in result.output
    assert "missing-sidecar\tinconsistent: flag set" in result.output
    assert "sidecar-only\tinconsistent: agents/openai.yaml present" in result.output
