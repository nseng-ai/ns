from __future__ import annotations

import json
from pathlib import Path

import pytest
from click.testing import CliRunner

from areg.cli import main
from areg.command_conversion import derive_pi_replacement_command
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


def _install_generic_replacement_layer(project_dir: Path) -> None:
    adapter = project_dir / ".pi" / "extensions" / "backing-skill-commands.ts"
    package_module = (
        project_dir / "ts" / "packages" / "pi-extensions" / "src" / "backing-skill-commands.ts"
    )
    adapter.parent.mkdir(parents=True, exist_ok=True)
    package_module.parent.mkdir(parents=True, exist_ok=True)
    adapter.write_text("export default function register() {}\n", encoding="utf-8")
    package_module.write_text("export default function register() {}\n", encoding="utf-8")


def _write_local_skill(project_dir: Path, name: str, skill_md: str | None = None) -> Path:
    _install_generic_replacement_layer(project_dir)
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


def _pi_settings(project_dir: Path) -> Path:
    return project_dir / ".pi" / "settings.json"


def _read_pi_settings(project_dir: Path) -> dict[str, object]:
    return json.loads(_pi_settings(project_dir).read_text(encoding="utf-8"))


@pytest.mark.parametrize(
    ("skill_name", "surface"),
    [
        ("objective-create", "objective:create"),
        ("objective-stack-impl", "objective:stack-impl"),
        ("branch-context-from-plan", "branch-context:from-plan"),
        ("branch-context-impl", "branch-context:impl"),
        ("enriched-plan-save", "enriched-plan:save"),
        ("pi-grill-with-docs-ui", "pi:grill-with-docs-ui"),
        ("foo-bar-baz", "foo:bar-baz"),
    ],
)
def test_derive_pi_replacement_command(skill_name: str, surface: str) -> None:
    derived = derive_pi_replacement_command(skill_name)

    assert derived is not None
    assert derived.surface == surface


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
    assert _read_pi_settings(tmp_path)["skills"] == ["-skills/my-skill"]
    assert "Converting my-skill" in result.output


def test_command_convert_multiple_skills(tmp_path: Path) -> None:
    _write_local_skill(tmp_path, "first-skill")
    _write_local_skill(tmp_path, "second-skill")

    result = CliRunner().invoke(
        main,
        ["command", "convert", "--path", str(tmp_path), "first-skill", "second-skill"],
        obj=_ctx(tmp_path),
    )

    assert result.exit_code == 0, result.output
    assert "disable-model-invocation: true" in (
        tmp_path / "skills" / "first-skill" / "SKILL.md"
    ).read_text(encoding="utf-8")
    assert "disable-model-invocation: true" in (
        tmp_path / "skills" / "second-skill" / "SKILL.md"
    ).read_text(encoding="utf-8")
    assert _sidecar(tmp_path, "first-skill").is_file()
    assert _sidecar(tmp_path, "second-skill").is_file()
    assert _read_pi_settings(tmp_path)["skills"] == ["-skills/first-skill", "-skills/second-skill"]


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
    assert not _pi_settings(tmp_path).exists()
    assert "Would write" in result.output


def test_command_convert_missing_replacement_fails_before_mutation(tmp_path: Path) -> None:
    skill_md = _write_local_skill(tmp_path, "my-skill")
    before = skill_md.read_text(encoding="utf-8")
    (tmp_path / ".pi" / "extensions" / "backing-skill-commands.ts").unlink()

    result = CliRunner().invoke(
        main,
        ["command", "convert", "--path", str(tmp_path), "my-skill"],
        obj=_ctx(tmp_path),
    )

    assert result.exit_code != 0
    assert "Missing Pi extension replacement" in result.output
    assert "Expected command: /my:skill" in result.output
    assert "Add a Pi extension replacement" in result.output
    assert skill_md.read_text(encoding="utf-8") == before
    assert not _sidecar(tmp_path, "my-skill").exists()


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


def test_command_convert_preserves_existing_pi_settings_and_skills_entries(tmp_path: Path) -> None:
    _write_local_skill(tmp_path, "my-skill")
    _pi_settings(tmp_path).parent.mkdir(parents=True, exist_ok=True)
    _pi_settings(tmp_path).write_text(
        json.dumps({"packages": [], "skills": ["+skills/keep"]}) + "\n", encoding="utf-8"
    )

    result = CliRunner().invoke(
        main,
        ["command", "convert", "--path", str(tmp_path), "my-skill"],
        obj=_ctx(tmp_path),
    )

    assert result.exit_code == 0, result.output
    assert _read_pi_settings(tmp_path) == {
        "packages": [],
        "skills": ["+skills/keep", "-skills/my-skill"],
    }

    second_result = CliRunner().invoke(
        main,
        ["command", "convert", "--path", str(tmp_path), "my-skill"],
        obj=_ctx(tmp_path),
    )

    assert second_result.exit_code == 0, second_result.output
    assert _read_pi_settings(tmp_path)["skills"] == ["+skills/keep", "-skills/my-skill"]


def test_command_convert_rejects_malformed_pi_settings_before_mutating(tmp_path: Path) -> None:
    skill_md = _write_local_skill(tmp_path, "my-skill")
    before = skill_md.read_text(encoding="utf-8")
    _pi_settings(tmp_path).parent.mkdir(parents=True, exist_ok=True)
    _pi_settings(tmp_path).write_text("{not json\n", encoding="utf-8")

    result = CliRunner().invoke(
        main,
        ["command", "convert", "--path", str(tmp_path), "my-skill"],
        obj=_ctx(tmp_path),
    )

    assert result.exit_code != 0
    assert "Invalid JSON" in result.output
    assert skill_md.read_text(encoding="utf-8") == before
    assert not _sidecar(tmp_path, "my-skill").exists()


def test_command_convert_rejects_non_object_pi_settings_before_mutating(tmp_path: Path) -> None:
    skill_md = _write_local_skill(tmp_path, "my-skill")
    before = skill_md.read_text(encoding="utf-8")
    _pi_settings(tmp_path).parent.mkdir(parents=True, exist_ok=True)
    _pi_settings(tmp_path).write_text("[]\n", encoding="utf-8")

    result = CliRunner().invoke(
        main,
        ["command", "convert", "--path", str(tmp_path), "my-skill"],
        obj=_ctx(tmp_path),
    )

    assert result.exit_code != 0
    assert "must contain a JSON object" in result.output
    assert skill_md.read_text(encoding="utf-8") == before
    assert not _sidecar(tmp_path, "my-skill").exists()


@pytest.mark.parametrize("skills_value", ["not-an-array", ["ok", 3]])
def test_command_convert_rejects_invalid_pi_settings_skills_before_mutating(
    tmp_path: Path, skills_value: object
) -> None:
    skill_md = _write_local_skill(tmp_path, "my-skill")
    before = skill_md.read_text(encoding="utf-8")
    _pi_settings(tmp_path).parent.mkdir(parents=True, exist_ok=True)
    _pi_settings(tmp_path).write_text(json.dumps({"skills": skills_value}) + "\n", encoding="utf-8")

    result = CliRunner().invoke(
        main,
        ["command", "convert", "--path", str(tmp_path), "my-skill"],
        obj=_ctx(tmp_path),
    )

    assert result.exit_code != 0
    assert "array of strings" in result.output
    assert skill_md.read_text(encoding="utf-8") == before
    assert not _sidecar(tmp_path, "my-skill").exists()


def test_command_convert_rejects_symlinked_pi_settings(tmp_path: Path) -> None:
    _write_local_skill(tmp_path, "my-skill")
    outside = tmp_path / "outside-settings.json"
    outside.write_text("{}\n", encoding="utf-8")
    _symlink_path(_pi_settings(tmp_path), outside, target_is_directory=False)

    result = CliRunner().invoke(
        main,
        ["command", "convert", "--path", str(tmp_path), "my-skill"],
        obj=_ctx(tmp_path),
    )

    assert result.exit_code != 0
    assert "Pi settings.json" in result.output
    assert "symlink" in result.output
    assert not _sidecar(tmp_path, "my-skill").exists()


def test_command_revert_removes_flag_sidecar_and_empty_agents_dir(tmp_path: Path) -> None:
    skill_md = _write_local_skill(
        tmp_path,
        "my-skill",
        "---\nname: my-skill\ndisable-model-invocation: true\n---\n\n# body\n",
    )
    _sidecar(tmp_path, "my-skill").parent.mkdir(parents=True)
    _sidecar(tmp_path, "my-skill").write_text(_CODEX_OPENAI_POLICY, encoding="utf-8")
    _pi_settings(tmp_path).parent.mkdir(parents=True, exist_ok=True)
    _pi_settings(tmp_path).write_text(
        json.dumps({"packages": [], "skills": ["-skills/my-skill", "-skills/other"]}) + "\n",
        encoding="utf-8",
    )

    result = CliRunner().invoke(
        main,
        ["command", "revert", "--path", str(tmp_path), "my-skill"],
        obj=_ctx(tmp_path),
    )

    assert result.exit_code == 0, result.output
    assert skill_md.read_text(encoding="utf-8") == "---\nname: my-skill\n---\n\n# body\n"
    assert not _sidecar(tmp_path, "my-skill").exists()
    assert not (tmp_path / "skills" / "my-skill" / "agents").exists()
    assert _read_pi_settings(tmp_path) == {"packages": [], "skills": ["-skills/other"]}


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
        "round-trip",
        "---\nname: round-trip\ndescription: keep me\n---\n\n# body\n",
    )
    before = skill_md.read_text(encoding="utf-8")

    convert_result = CliRunner().invoke(
        main,
        ["command", "convert", "--path", str(tmp_path), "round-trip"],
        obj=_ctx(tmp_path),
    )
    revert_result = CliRunner().invoke(
        main,
        ["command", "revert", "--path", str(tmp_path), "round-trip"],
        obj=_ctx(tmp_path),
    )

    assert convert_result.exit_code == 0, convert_result.output
    assert revert_result.exit_code == 0, revert_result.output
    assert skill_md.read_text(encoding="utf-8") == before
    assert not _sidecar(tmp_path, "round-trip").exists()
    assert _read_pi_settings(tmp_path)["skills"] == []


def test_command_revert_removes_exact_pi_exclusion_and_leaves_empty_array(
    tmp_path: Path,
) -> None:
    _write_local_skill(
        tmp_path,
        "my-skill",
        "---\nname: my-skill\ndisable-model-invocation: true\n---\n\n# body\n",
    )
    _pi_settings(tmp_path).parent.mkdir(parents=True, exist_ok=True)
    _pi_settings(tmp_path).write_text(
        json.dumps({"packages": [], "skills": ["-skills/my-skill", "!skills/my-skill"]}) + "\n",
        encoding="utf-8",
    )

    result = CliRunner().invoke(
        main,
        ["command", "revert", "--path", str(tmp_path), "my-skill"],
        obj=_ctx(tmp_path),
    )

    assert result.exit_code == 0, result.output
    assert _read_pi_settings(tmp_path) == {"packages": [], "skills": ["!skills/my-skill"]}

    _pi_settings(tmp_path).write_text(
        json.dumps({"skills": ["-skills/my-skill"]}) + "\n",
        encoding="utf-8",
    )
    second_result = CliRunner().invoke(
        main,
        ["command", "revert", "--path", str(tmp_path), "my-skill"],
        obj=_ctx(tmp_path),
    )

    assert second_result.exit_code == 0, second_result.output
    assert _read_pi_settings(tmp_path) == {"skills": []}


def test_skill_profile_help_is_wired(tmp_path: Path) -> None:
    result = CliRunner().invoke(
        main,
        ["skill", "profile", "--help"],
        obj=_ctx(tmp_path),
    )

    assert result.exit_code == 0, result.output
    assert "set" in result.output
    assert "list" in result.output
    assert "show" in result.output


def test_skill_profile_set_all_profiles_round_trip(tmp_path: Path) -> None:
    skill_md = _write_local_skill(tmp_path, "my-skill")

    invoke_result = CliRunner().invoke(
        main,
        ["skill", "profile", "set", "--path", str(tmp_path), "invoke-only", "my-skill"],
        obj=_ctx(tmp_path),
    )

    assert invoke_result.exit_code == 0, invoke_result.output
    assert "disable-model-invocation: true" in skill_md.read_text(encoding="utf-8")
    assert _sidecar(tmp_path, "my-skill").read_text(encoding="utf-8") == _CODEX_OPENAI_POLICY
    assert not _pi_settings(tmp_path).exists()

    command_result = CliRunner().invoke(
        main,
        ["skill", "profile", "set", "--path", str(tmp_path), "command-backed", "my-skill"],
        obj=_ctx(tmp_path),
    )

    assert command_result.exit_code == 0, command_result.output
    assert _read_pi_settings(tmp_path)["skills"] == ["-skills/my-skill"]

    ambient_result = CliRunner().invoke(
        main,
        ["skill", "profile", "set", "--path", str(tmp_path), "ambient-only", "my-skill"],
        obj=_ctx(tmp_path),
    )

    assert ambient_result.exit_code == 0, ambient_result.output
    assert skill_md.read_text(encoding="utf-8").startswith(
        "---\nname: my-skill\nuser-invocable: false\n---\n"
    )
    assert not _sidecar(tmp_path, "my-skill").exists()
    assert _read_pi_settings(tmp_path)["skills"] == []

    normal_result = CliRunner().invoke(
        main,
        ["skill", "profile", "set", "--path", str(tmp_path), "normal", "my-skill"],
        obj=_ctx(tmp_path),
    )

    assert normal_result.exit_code == 0, normal_result.output
    assert skill_md.read_text(encoding="utf-8") == "---\nname: my-skill\n---\n\n# my-skill\n"
    assert not _sidecar(tmp_path, "my-skill").exists()
    assert _read_pi_settings(tmp_path)["skills"] == []


def test_skill_profile_list_and_show_reports_profiles(tmp_path: Path) -> None:
    _write_local_skill(tmp_path, "ambient")
    _write_local_skill(tmp_path, "command-skill")
    _write_local_skill(tmp_path, "invoke")
    _write_local_skill(tmp_path, "normal")

    for profile, skill in [
        ("ambient-only", "ambient"),
        ("command-backed", "command-skill"),
        ("invoke-only", "invoke"),
    ]:
        result = CliRunner().invoke(
            main,
            ["skill", "profile", "set", "--path", str(tmp_path), profile, skill],
            obj=_ctx(tmp_path),
        )
        assert result.exit_code == 0, result.output

    list_result = CliRunner().invoke(
        main,
        ["skill", "profile", "list", "--path", str(tmp_path)],
        obj=_ctx(tmp_path),
    )

    assert list_result.exit_code == 0, list_result.output
    assert (
        "ambient\tambient-only\tmodel-invocation:enabled\tnative-direct:partial"
        in list_result.output
    )
    assert (
        "command-skill\tcommand-backed\tmodel-invocation:disabled\tnative-direct:partial\t"
        "pi-extension:enabled" in list_result.output
    )
    assert (
        "invoke\tinvoke-only\tmodel-invocation:disabled\tnative-direct:enabled\t"
        "pi-extension:n/a" in list_result.output
    )
    assert (
        "normal\tnormal\tmodel-invocation:enabled\tnative-direct:enabled\tpi-extension:n/a"
        in list_result.output
    )

    show_result = CliRunner().invoke(
        main,
        ["skill", "profile", "show", "--path", str(tmp_path), "ambient"],
        obj=_ctx(tmp_path),
    )

    assert show_result.exit_code == 0, show_result.output
    assert "Profile: ambient-only" in show_result.output
    assert "ambient-only: Claude native direct invocation disabled" in show_result.output
    assert "ambient-only: Pi native direct invocation not enforced" in show_result.output
    assert "ambient-only: Codex native direct invocation not enforced" in show_result.output


def test_skill_profile_set_accepts_skill_md_path(tmp_path: Path) -> None:
    skill_md = _write_local_skill(tmp_path, "md-skill")

    result = CliRunner().invoke(
        main,
        [
            "skill",
            "profile",
            "set",
            "--path",
            str(tmp_path),
            "invoke-only",
            "skills/md-skill/SKILL.md",
        ],
        obj=_ctx(tmp_path),
    )

    assert result.exit_code == 0, result.output
    assert "disable-model-invocation: true" in skill_md.read_text(encoding="utf-8")
    assert _sidecar(tmp_path, "md-skill").is_file()


def test_skill_profile_show_rejects_real_agents_skill_path(tmp_path: Path) -> None:
    _write_github_skill(tmp_path, "remote-skill")

    result = CliRunner().invoke(
        main,
        [
            "skill",
            "profile",
            "show",
            "--path",
            str(tmp_path),
            str(tmp_path / ".agents" / "skills" / "remote-skill"),
        ],
        obj=_ctx(tmp_path),
    )

    assert result.exit_code != 0
    assert "does not resolve to a local skill under skills/<name>" in result.output


def test_skill_profile_batch_failure_keeps_earlier_applied_skill(tmp_path: Path) -> None:
    first_skill_md = _write_local_skill(tmp_path, "objective-create")
    second_skill_md = _write_local_skill(tmp_path, "my-skill")
    (tmp_path / ".pi" / "extensions" / "backing-skill-commands.ts").unlink()

    result = CliRunner().invoke(
        main,
        [
            "skill",
            "profile",
            "set",
            "--path",
            str(tmp_path),
            "command-backed",
            "objective-create",
            "my-skill",
        ],
        obj=_ctx(tmp_path),
    )

    assert result.exit_code != 0
    assert "Missing Pi extension replacement" in result.output
    assert "disable-model-invocation: true" in first_skill_md.read_text(encoding="utf-8")
    assert _sidecar(tmp_path, "objective-create").is_file()
    assert _read_pi_settings(tmp_path)["skills"] == ["-skills/objective-create"]
    assert second_skill_md.read_text(encoding="utf-8") == "---\nname: my-skill\n---\n\n# my-skill\n"
    assert not _sidecar(tmp_path, "my-skill").exists()


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
    _pi_settings(tmp_path).parent.mkdir(parents=True, exist_ok=True)
    _pi_settings(tmp_path).write_text(
        json.dumps({"skills": ["-skills/invoke-only", "-skills/sidecar-only"]}) + "\n",
        encoding="utf-8",
    )

    result = CliRunner().invoke(
        main,
        ["command", "list", "--path", str(tmp_path)],
        obj=_ctx(tmp_path),
    )

    assert result.exit_code == 0, result.output
    assert "invoke-only\tcommand-backed\tpi-excluded" in result.output
    assert "normal\tnormal\tpi-visible" in result.output
    assert "missing-sidecar\tinconsistent: flag set" in result.output
    assert (
        "sidecar-only\tinconsistent: agents/openai.yaml present but flag unset\tpi-excluded"
        in result.output
    )
