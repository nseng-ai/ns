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
