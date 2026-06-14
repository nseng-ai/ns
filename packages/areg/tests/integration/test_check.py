from __future__ import annotations

import json
from pathlib import Path

import pytest
from click.testing import CliRunner

from areg.check.checks import pairing
from areg.check.context import locally_excluded_skills
from areg.cli import main

_VALID_LOCAL_HASH = "a" * 64
_VALID_REMOTE_HASH = "b" * 64

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_lockfile(project: Path, skills: dict) -> None:
    (project / "skills-lock.json").write_text(
        json.dumps({"version": 1, "skills": skills}, indent=2), encoding="utf-8"
    )


def _make_agents_md(project: Path, _skill_names: list[str]) -> None:
    (project / "AGENTS.md").write_text(
        "# Skills\n\n"
        "Installed skills are discovered from the on-disk skill directories and "
        "`SKILL.md` frontmatter.\n",
        encoding="utf-8",
    )
    (project / "CLAUDE.md").write_text("# project\n\n@AGENTS.md\n", encoding="utf-8")


def _write_file(project: Path, relpath: str, body: str) -> None:
    path = project / relpath
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body, encoding="utf-8")


def _install_generic_replacement_layer(project: Path) -> None:
    _write_file(
        project,
        ".pi/extensions/backing-skill-commands.ts",
        "export default function register() {}\n",
    )
    _write_file(
        project,
        "ts/packages/pi-extensions/src/backing-skill-commands.ts",
        "export default function register() {}\n",
    )


def _make_local_skill(project: Path, name: str) -> None:
    """Create a properly-structured local skill with correct symlink chain."""
    skill_dir = project / "skills" / name
    skill_dir.mkdir(parents=True, exist_ok=True)
    (skill_dir / "SKILL.md").write_text(f"---\nname: {name}\n---\n", encoding="utf-8")

    agents_dir = project / ".agents" / "skills"
    agents_dir.mkdir(parents=True, exist_ok=True)
    (agents_dir / name).symlink_to(Path("../../skills") / name)

    claude_dir = project / ".claude" / "skills"
    claude_dir.mkdir(parents=True, exist_ok=True)
    (claude_dir / name).symlink_to(Path("../../.agents/skills") / name)


def _make_github_skill(project: Path, name: str) -> None:
    """Create a properly-structured GitHub-sourced skill."""
    agents_dir = project / ".agents" / "skills" / name
    agents_dir.mkdir(parents=True, exist_ok=True)
    (agents_dir / "SKILL.md").write_text(f"---\nname: {name}\n---\n", encoding="utf-8")

    claude_dir = project / ".claude" / "skills"
    claude_dir.mkdir(parents=True, exist_ok=True)
    (claude_dir / name).symlink_to(Path("../../.agents/skills") / name)


def _local_lock_entry(name: str) -> dict:
    return {"source": f"skills/{name}", "sourceType": "local", "computedHash": _VALID_LOCAL_HASH}


def _github_lock_entry(owner_repo: str) -> dict:
    return {"source": owner_repo, "sourceType": "github", "computedHash": _VALID_REMOTE_HASH}


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


def test_check_happy_local_skill(tmp_path: Path) -> None:
    _make_local_skill(tmp_path, "my-skill")
    _make_lockfile(tmp_path, {"my-skill": _local_lock_entry("my-skill")})
    _make_agents_md(tmp_path, ["my-skill"])

    result = CliRunner().invoke(main, ["check", "--path", str(tmp_path)])
    assert result.exit_code == 0
    assert "All skills OK" in result.output


def test_check_happy_github_skill(tmp_path: Path) -> None:
    _make_github_skill(tmp_path, "dignified-python")
    _make_lockfile(tmp_path, {"dignified-python": _github_lock_entry("dagster-io/asdl-tools")})
    _make_agents_md(tmp_path, ["dignified-python"])

    result = CliRunner().invoke(main, ["check", "--path", str(tmp_path)])
    assert result.exit_code == 0
    assert "All skills OK" in result.output


def test_check_happy_mixed(tmp_path: Path) -> None:
    _make_local_skill(tmp_path, "my-local")
    _make_github_skill(tmp_path, "my-remote")
    _make_lockfile(
        tmp_path,
        {
            "my-local": _local_lock_entry("my-local"),
            "my-remote": _github_lock_entry("org/repo"),
        },
    )
    _make_agents_md(tmp_path, ["my-local", "my-remote"])

    result = CliRunner().invoke(main, ["check", "--path", str(tmp_path)])
    assert result.exit_code == 0


def test_check_happy_empty_lockfile(tmp_path: Path) -> None:
    _make_lockfile(tmp_path, {})
    _make_agents_md(tmp_path, [])

    result = CliRunner().invoke(main, ["check", "--path", str(tmp_path)])
    assert result.exit_code == 0
    assert "All skills OK" in result.output


def test_check_happy_invoke_only_local_skill(tmp_path: Path) -> None:
    _make_local_skill(tmp_path, "my-skill")
    skill_md = tmp_path / "skills" / "my-skill" / "SKILL.md"
    skill_md.write_text(
        "---\nname: my-skill\ndisable-model-invocation: true\n---\n", encoding="utf-8"
    )
    sidecar = tmp_path / "skills" / "my-skill" / "agents" / "openai.yaml"
    sidecar.parent.mkdir()
    sidecar.write_text("policy:\n  allow_implicit_invocation: false\n", encoding="utf-8")
    _install_generic_replacement_layer(tmp_path)
    _write_file(tmp_path, ".pi/settings.json", json.dumps({"skills": ["-skills/my-skill"]}) + "\n")
    _make_lockfile(tmp_path, {"my-skill": _local_lock_entry("my-skill")})
    _make_agents_md(tmp_path, ["my-skill"])

    result = CliRunner().invoke(main, ["check", "--path", str(tmp_path)])

    assert result.exit_code == 0
    assert "All skills OK" in result.output


# ---------------------------------------------------------------------------
# Local skill issues
# ---------------------------------------------------------------------------


def test_check_local_missing_skills_dir(tmp_path: Path) -> None:
    # Set up .agents and .claude but no skills/<name>
    agents_dir = tmp_path / ".agents" / "skills"
    agents_dir.mkdir(parents=True)
    # Can't make a valid symlink without the target, so make a real dir
    (agents_dir / "my-skill").mkdir()
    (agents_dir / "my-skill" / "SKILL.md").write_text(
        "---\nname: my-skill\n---\n", encoding="utf-8"
    )
    claude_dir = tmp_path / ".claude" / "skills"
    claude_dir.mkdir(parents=True)
    (claude_dir / "my-skill").symlink_to(Path("../../.agents/skills/my-skill"))

    _make_lockfile(tmp_path, {"my-skill": _local_lock_entry("my-skill")})
    _make_agents_md(tmp_path, ["my-skill"])

    result = CliRunner().invoke(main, ["check", "--path", str(tmp_path)])
    assert result.exit_code == 1
    assert "skills/my-skill/ does not exist" in result.output


@pytest.mark.parametrize(
    ("bad_source", "expected_fragment"),
    [
        ("/tmp/my-skill", "found '/tmp/my-skill'"),
        ("./skills/my-skill", "found './skills/my-skill'"),
        ("skills/other-skill", "found 'skills/other-skill'"),
    ],
)
def test_check_local_lock_source_must_be_repo_relative(
    tmp_path: Path, bad_source: str, expected_fragment: str
) -> None:
    _make_local_skill(tmp_path, "my-skill")
    _make_lockfile(
        tmp_path,
        {
            "my-skill": {
                "source": bad_source,
                "sourceType": "local",
                "computedHash": _VALID_LOCAL_HASH,
            }
        },
    )
    _make_agents_md(tmp_path, ["my-skill"])

    result = CliRunner().invoke(main, ["check", "--path", str(tmp_path)])

    assert result.exit_code == 1
    assert "Local skill lockfile source must be 'skills/my-skill'" in result.output
    assert expected_fragment in result.output


def test_check_local_skills_dir_is_symlink(tmp_path: Path) -> None:
    """The backwards case: skills/<name> is a symlink into .agents/skills/."""
    agents_dir = tmp_path / ".agents" / "skills" / "my-skill"
    agents_dir.mkdir(parents=True)
    (agents_dir / "SKILL.md").write_text("---\nname: my-skill\n---\n", encoding="utf-8")

    skills_dir = tmp_path / "skills"
    skills_dir.mkdir(parents=True)
    (skills_dir / "my-skill").symlink_to(Path("../.agents/skills/my-skill"))

    claude_dir = tmp_path / ".claude" / "skills"
    claude_dir.mkdir(parents=True)
    (claude_dir / "my-skill").symlink_to(Path("../../.agents/skills/my-skill"))

    _make_lockfile(tmp_path, {"my-skill": _local_lock_entry("my-skill")})
    _make_agents_md(tmp_path, ["my-skill"])

    result = CliRunner().invoke(main, ["check", "--path", str(tmp_path)])
    assert result.exit_code == 1
    assert "symlink but should be a real directory" in result.output


def test_check_local_agents_not_symlink(tmp_path: Path) -> None:
    skill_dir = tmp_path / "skills" / "my-skill"
    skill_dir.mkdir(parents=True)
    (skill_dir / "SKILL.md").write_text("---\nname: my-skill\n---\n", encoding="utf-8")

    # .agents/skills/<name> is a real dir instead of symlink
    agents_dir = tmp_path / ".agents" / "skills" / "my-skill"
    agents_dir.mkdir(parents=True)
    (agents_dir / "SKILL.md").write_text("---\nname: my-skill\n---\n", encoding="utf-8")

    claude_dir = tmp_path / ".claude" / "skills"
    claude_dir.mkdir(parents=True)
    (claude_dir / "my-skill").symlink_to(Path("../../.agents/skills/my-skill"))

    _make_lockfile(tmp_path, {"my-skill": _local_lock_entry("my-skill")})
    _make_agents_md(tmp_path, ["my-skill"])

    result = CliRunner().invoke(main, ["check", "--path", str(tmp_path)])
    assert result.exit_code == 1
    assert "is a real directory, expected symlink" in result.output


def test_check_local_agents_wrong_target(tmp_path: Path) -> None:
    skill_dir = tmp_path / "skills" / "my-skill"
    skill_dir.mkdir(parents=True)
    (skill_dir / "SKILL.md").write_text("---\nname: my-skill\n---\n", encoding="utf-8")

    agents_dir = tmp_path / ".agents" / "skills"
    agents_dir.mkdir(parents=True)
    # Symlink points to wrong target
    (agents_dir / "my-skill").symlink_to(Path("../../wrong/my-skill"))

    claude_dir = tmp_path / ".claude" / "skills"
    claude_dir.mkdir(parents=True)
    (claude_dir / "my-skill").symlink_to(Path("../../.agents/skills/my-skill"))

    _make_lockfile(tmp_path, {"my-skill": _local_lock_entry("my-skill")})
    _make_agents_md(tmp_path, ["my-skill"])

    result = CliRunner().invoke(main, ["check", "--path", str(tmp_path)])
    assert result.exit_code == 1
    assert "symlink points to ../../wrong/my-skill" in result.output


def test_check_local_claude_not_symlink(tmp_path: Path) -> None:
    _make_local_skill(tmp_path, "my-skill")
    # Replace claude symlink with a real dir
    claude_path = tmp_path / ".claude" / "skills" / "my-skill"
    claude_path.unlink()
    claude_path.mkdir()
    (claude_path / "SKILL.md").write_text("---\nname: my-skill\n---\n", encoding="utf-8")

    _make_lockfile(tmp_path, {"my-skill": _local_lock_entry("my-skill")})
    _make_agents_md(tmp_path, ["my-skill"])

    result = CliRunner().invoke(main, ["check", "--path", str(tmp_path)])
    assert result.exit_code == 1
    assert ".claude/skills/my-skill is a real directory" in result.output


def test_check_local_claude_wrong_target(tmp_path: Path) -> None:
    _make_local_skill(tmp_path, "my-skill")
    # Replace claude symlink with wrong target
    claude_path = tmp_path / ".claude" / "skills" / "my-skill"
    claude_path.unlink()
    (claude_path).symlink_to(Path("../../skills/my-skill"))

    _make_lockfile(tmp_path, {"my-skill": _local_lock_entry("my-skill")})
    _make_agents_md(tmp_path, ["my-skill"])

    result = CliRunner().invoke(main, ["check", "--path", str(tmp_path)])
    assert result.exit_code == 1
    assert "symlink points to ../../skills/my-skill" in result.output
    assert "expected ../../.agents/skills/my-skill" in result.output


def test_check_local_agents_missing(tmp_path: Path) -> None:
    skill_dir = tmp_path / "skills" / "my-skill"
    skill_dir.mkdir(parents=True)
    (skill_dir / "SKILL.md").write_text("---\nname: my-skill\n---\n", encoding="utf-8")
    # No .agents/skills/my-skill at all

    claude_dir = tmp_path / ".claude" / "skills"
    claude_dir.mkdir(parents=True)

    _make_lockfile(tmp_path, {"my-skill": _local_lock_entry("my-skill")})
    _make_agents_md(tmp_path, ["my-skill"])

    result = CliRunner().invoke(main, ["check", "--path", str(tmp_path)])
    assert result.exit_code == 1
    assert ".agents/skills/my-skill does not exist" in result.output


def test_check_local_claude_missing(tmp_path: Path) -> None:
    skill_dir = tmp_path / "skills" / "my-skill"
    skill_dir.mkdir(parents=True)
    (skill_dir / "SKILL.md").write_text("---\nname: my-skill\n---\n", encoding="utf-8")

    agents_dir = tmp_path / ".agents" / "skills"
    agents_dir.mkdir(parents=True)
    (agents_dir / "my-skill").symlink_to(Path("../../skills/my-skill"))
    # No .claude/skills/my-skill

    _make_lockfile(tmp_path, {"my-skill": _local_lock_entry("my-skill")})
    _make_agents_md(tmp_path, ["my-skill"])

    result = CliRunner().invoke(main, ["check", "--path", str(tmp_path)])
    assert result.exit_code == 1
    assert ".claude/skills/my-skill does not exist" in result.output


def test_check_local_skill_description_too_long(tmp_path: Path) -> None:
    skill_dir = tmp_path / "skills" / "my-skill"
    skill_dir.mkdir(parents=True)
    long_description = "a" * 1025
    (skill_dir / "SKILL.md").write_text(
        f'---\nname: my-skill\ndescription: "{long_description}"\n---\n', encoding="utf-8"
    )

    agents_dir = tmp_path / ".agents" / "skills"
    agents_dir.mkdir(parents=True)
    (agents_dir / "my-skill").symlink_to(Path("../../skills/my-skill"))

    claude_dir = tmp_path / ".claude" / "skills"
    claude_dir.mkdir(parents=True)
    (claude_dir / "my-skill").symlink_to(Path("../../.agents/skills/my-skill"))

    _make_lockfile(tmp_path, {"my-skill": _local_lock_entry("my-skill")})
    _make_agents_md(tmp_path, ["my-skill"])

    result = CliRunner().invoke(main, ["check", "--path", str(tmp_path)])
    assert result.exit_code == 1
    assert "invalid description: exceeds maximum length of 1024 characters" in result.output
    assert "got 1025" in result.output


def test_check_local_invoke_only_flag_without_sidecar(tmp_path: Path) -> None:
    _make_local_skill(tmp_path, "my-skill")
    (tmp_path / "skills" / "my-skill" / "SKILL.md").write_text(
        "---\nname: my-skill\ndisable-model-invocation: true\n---\n", encoding="utf-8"
    )
    _make_lockfile(tmp_path, {"my-skill": _local_lock_entry("my-skill")})
    _make_agents_md(tmp_path, ["my-skill"])

    result = CliRunner().invoke(main, ["check", "--path", str(tmp_path)])

    assert result.exit_code == 1
    assert "skills/my-skill/agents/openai.yaml missing for invoke-only skill" in result.output


def test_check_local_sidecar_without_invoke_only_flag(tmp_path: Path) -> None:
    _make_local_skill(tmp_path, "my-skill")
    sidecar = tmp_path / "skills" / "my-skill" / "agents" / "openai.yaml"
    sidecar.parent.mkdir()
    sidecar.write_text("policy:\n  allow_implicit_invocation: false\n", encoding="utf-8")
    _make_lockfile(tmp_path, {"my-skill": _local_lock_entry("my-skill")})
    _make_agents_md(tmp_path, ["my-skill"])

    result = CliRunner().invoke(main, ["check", "--path", str(tmp_path)])

    assert result.exit_code == 1
    assert "exists but SKILL.md does not set disable-model-invocation: true" in result.output


# ---------------------------------------------------------------------------
# GitHub skill issues
# ---------------------------------------------------------------------------


def test_check_github_agents_missing(tmp_path: Path) -> None:
    # No .agents/skills/<name> at all
    claude_dir = tmp_path / ".claude" / "skills"
    claude_dir.mkdir(parents=True)

    _make_lockfile(tmp_path, {"my-remote": _github_lock_entry("org/repo")})
    _make_agents_md(tmp_path, ["my-remote"])

    result = CliRunner().invoke(main, ["check", "--path", str(tmp_path)])
    assert result.exit_code == 1
    assert ".agents/skills/my-remote/ does not exist" in result.output


def test_check_github_agents_is_symlink(tmp_path: Path) -> None:
    """GitHub skill's .agents/skills/<name> should be a real dir, not a symlink."""
    real_dir = tmp_path / "somewhere" / "my-remote"
    real_dir.mkdir(parents=True)
    (real_dir / "SKILL.md").write_text("---\nname: my-remote\n---\n", encoding="utf-8")

    agents_dir = tmp_path / ".agents" / "skills"
    agents_dir.mkdir(parents=True)
    (agents_dir / "my-remote").symlink_to(real_dir)

    claude_dir = tmp_path / ".claude" / "skills"
    claude_dir.mkdir(parents=True)
    (claude_dir / "my-remote").symlink_to(Path("../../.agents/skills/my-remote"))

    _make_lockfile(tmp_path, {"my-remote": _github_lock_entry("org/repo")})
    _make_agents_md(tmp_path, ["my-remote"])

    result = CliRunner().invoke(main, ["check", "--path", str(tmp_path)])
    assert result.exit_code == 1
    assert "symlink but should be a real directory" in result.output


def test_check_github_unexpected_skills_dir(tmp_path: Path) -> None:
    _make_github_skill(tmp_path, "my-remote")
    # Also create an unexpected skills/<name> entry
    (tmp_path / "skills" / "my-remote").mkdir(parents=True)

    _make_lockfile(tmp_path, {"my-remote": _github_lock_entry("org/repo")})
    _make_agents_md(tmp_path, ["my-remote"])

    result = CliRunner().invoke(main, ["check", "--path", str(tmp_path)])
    assert result.exit_code == 1
    assert "should not have skills/my-remote/ entry" in result.output


def test_check_github_claude_missing(tmp_path: Path) -> None:
    agents_dir = tmp_path / ".agents" / "skills" / "my-remote"
    agents_dir.mkdir(parents=True)
    (agents_dir / "SKILL.md").write_text("---\nname: my-remote\n---\n", encoding="utf-8")
    # No .claude/skills/my-remote

    _make_lockfile(tmp_path, {"my-remote": _github_lock_entry("org/repo")})
    _make_agents_md(tmp_path, ["my-remote"])

    result = CliRunner().invoke(main, ["check", "--path", str(tmp_path)])
    assert result.exit_code == 1
    assert ".claude/skills/my-remote does not exist" in result.output


# ---------------------------------------------------------------------------
# Cross-cutting / orphan checks
# ---------------------------------------------------------------------------


def test_check_orphan_in_skills_dir(tmp_path: Path) -> None:
    _make_local_skill(tmp_path, "tracked")
    # Add an untracked dir in skills/
    (tmp_path / "skills" / "orphan-skill").mkdir(parents=True)

    _make_lockfile(tmp_path, {"tracked": _local_lock_entry("tracked")})
    _make_agents_md(tmp_path, ["tracked"])

    result = CliRunner().invoke(main, ["check", "--path", str(tmp_path)])
    assert result.exit_code == 1
    assert "Orphaned directory skills/orphan-skill/" in result.output


def test_check_orphan_in_agents_dir(tmp_path: Path) -> None:
    _make_local_skill(tmp_path, "tracked")
    # Add an untracked dir in .agents/skills/
    (tmp_path / ".agents" / "skills" / "orphan-skill").mkdir(parents=True)

    _make_lockfile(tmp_path, {"tracked": _local_lock_entry("tracked")})
    _make_agents_md(tmp_path, ["tracked"])

    result = CliRunner().invoke(main, ["check", "--path", str(tmp_path)])
    assert result.exit_code == 1
    assert "Orphaned directory .agents/skills/orphan-skill/" in result.output


def test_check_orphan_dangling_lockfile(tmp_path: Path) -> None:
    _make_lockfile(tmp_path, {"ghost": _github_lock_entry("org/repo")})
    _make_agents_md(tmp_path, [])

    result = CliRunner().invoke(main, ["check", "--path", str(tmp_path)])
    assert result.exit_code == 1
    assert "no directories found on disk for ghost" in result.output


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------


def test_check_edge_no_lockfile(tmp_path: Path) -> None:
    result = CliRunner().invoke(main, ["check", "--path", str(tmp_path)])
    assert result.exit_code != 0
    assert "skills-lock.json not found" in result.output


def test_check_edge_invalid_json(tmp_path: Path) -> None:
    (tmp_path / "skills-lock.json").write_text("not valid json{{{", encoding="utf-8")

    result = CliRunner().invoke(main, ["check", "--path", str(tmp_path)])
    assert result.exit_code != 0
    assert "Invalid JSON" in result.output


@pytest.mark.parametrize(
    ("raw_lockfile", "expected"),
    [
        ([], "root must be an object"),
        ({"version": 1}, "$.skills is required"),
        ({"version": 1, "skills": []}, "$.skills must be an object"),
        ({"version": 1, "skills": {"pytest": []}}, "$.skills.pytest must be an object"),
        (
            {
                "version": 1,
                "skills": {"pytest": {"sourceType": "github", "computedHash": _VALID_REMOTE_HASH}},
            },
            "$.skills.pytest.source is required",
        ),
    ],
)
def test_check_edge_malformed_lockfile_shape_errors_cleanly(
    tmp_path: Path,
    raw_lockfile: object,
    expected: str,
) -> None:
    (tmp_path / "skills-lock.json").write_text(json.dumps(raw_lockfile), encoding="utf-8")

    result = CliRunner().invoke(main, ["check", "--path", str(tmp_path)])

    assert result.exit_code != 0
    assert "Invalid skills-lock.json" in result.output
    assert expected in result.output
    assert "Traceback" not in result.output


def test_check_reports_pending_regen_hash_as_lockfile_issue(tmp_path: Path) -> None:
    _make_local_skill(tmp_path, "my-skill")
    _make_lockfile(
        tmp_path,
        {
            "my-skill": {
                "source": "skills/my-skill",
                "sourceType": "local",
                "computedHash": "PENDING_REGEN",
            }
        },
    )
    _make_agents_md(tmp_path, ["my-skill"])

    result = CliRunner().invoke(main, ["check", "--path", str(tmp_path)])

    assert result.exit_code == 1
    assert "placeholder computedHash PENDING_REGEN" in result.output
    assert "my-skill" in result.output


def test_check_reports_invalid_short_hash_as_lockfile_issue(tmp_path: Path) -> None:
    _make_local_skill(tmp_path, "my-skill")
    _make_lockfile(
        tmp_path,
        {
            "my-skill": {
                "source": "skills/my-skill",
                "sourceType": "local",
                "computedHash": "abc123",
            }
        },
    )
    _make_agents_md(tmp_path, ["my-skill"])

    result = CliRunner().invoke(main, ["check", "--path", str(tmp_path)])

    assert result.exit_code == 1
    assert "invalid computedHash 'abc123'" in result.output
    assert "expected 64 lowercase hex characters" in result.output


def test_check_edge_no_agents_md(tmp_path: Path) -> None:
    """Missing AGENTS.md does not affect otherwise-valid skill checks."""
    _make_local_skill(tmp_path, "my-skill")
    _make_lockfile(tmp_path, {"my-skill": _local_lock_entry("my-skill")})
    # No AGENTS.md

    result = CliRunner().invoke(main, ["check", "--path", str(tmp_path)])
    assert result.exit_code == 0
    assert "All skills OK" in result.output


def test_check_edge_no_skills_dir(tmp_path: Path) -> None:
    """Project with only GitHub skills, no skills/ directory at all."""
    _make_github_skill(tmp_path, "my-remote")
    _make_lockfile(tmp_path, {"my-remote": _github_lock_entry("org/repo")})
    _make_agents_md(tmp_path, ["my-remote"])

    result = CliRunner().invoke(main, ["check", "--path", str(tmp_path)])
    assert result.exit_code == 0


def test_check_edge_multiple_issues_per_skill(tmp_path: Path) -> None:
    """A single local skill with no skills/ dir and a real dir in .agents."""
    agents_dir = tmp_path / ".agents" / "skills" / "bad-skill"
    agents_dir.mkdir(parents=True)
    (agents_dir / "SKILL.md").write_text("---\nname: bad-skill\n---\n", encoding="utf-8")

    claude_dir = tmp_path / ".claude" / "skills"
    claude_dir.mkdir(parents=True)
    (claude_dir / "bad-skill").symlink_to(Path("../../.agents/skills/bad-skill"))

    _make_lockfile(tmp_path, {"bad-skill": _local_lock_entry("bad-skill")})
    _make_agents_md(tmp_path, [])

    result = CliRunner().invoke(main, ["check", "--path", str(tmp_path)])
    assert result.exit_code == 1
    # Should have at least 2 issues: missing skills dir and agents not symlink
    output = result.output
    assert "skills/bad-skill/ does not exist" in output
    assert "is a real directory, expected symlink" in output


def test_check_edge_invalid_skill_frontmatter(tmp_path: Path) -> None:
    skill_dir = tmp_path / "skills" / "my-skill"
    skill_dir.mkdir(parents=True)
    (skill_dir / "SKILL.md").write_text("---\nname: my-skill\n", encoding="utf-8")

    agents_dir = tmp_path / ".agents" / "skills"
    agents_dir.mkdir(parents=True)
    (agents_dir / "my-skill").symlink_to(Path("../../skills/my-skill"))

    claude_dir = tmp_path / ".claude" / "skills"
    claude_dir.mkdir(parents=True)
    (claude_dir / "my-skill").symlink_to(Path("../../.agents/skills/my-skill"))

    _make_lockfile(tmp_path, {"my-skill": _local_lock_entry("my-skill")})
    _make_agents_md(tmp_path, ["my-skill"])

    result = CliRunner().invoke(main, ["check", "--path", str(tmp_path)])
    assert result.exit_code == 1
    assert "invalid frontmatter: missing closing frontmatter delimiter" in result.output


# ---------------------------------------------------------------------------
# Exit codes
# ---------------------------------------------------------------------------


def test_check_exit_zero_when_ok(tmp_path: Path) -> None:
    _make_local_skill(tmp_path, "good")
    _make_lockfile(tmp_path, {"good": _local_lock_entry("good")})
    _make_agents_md(tmp_path, ["good"])

    result = CliRunner().invoke(main, ["check", "--path", str(tmp_path)])
    assert result.exit_code == 0


def test_check_exit_one_when_errors(tmp_path: Path) -> None:
    _make_lockfile(tmp_path, {"missing": _local_lock_entry("missing")})
    _make_agents_md(tmp_path, [])

    result = CliRunner().invoke(main, ["check", "--path", str(tmp_path)])
    assert result.exit_code == 1


# ---------------------------------------------------------------------------
# --path option
# ---------------------------------------------------------------------------


def test_check_path_explicit(tmp_path: Path) -> None:
    project = tmp_path / "myproject"
    project.mkdir()
    _make_local_skill(project, "my-skill")
    _make_lockfile(project, {"my-skill": _local_lock_entry("my-skill")})
    _make_agents_md(project, ["my-skill"])

    result = CliRunner().invoke(main, ["check", "--path", str(project)])
    assert result.exit_code == 0


def test_check_path_nonexistent(tmp_path: Path) -> None:
    result = CliRunner().invoke(main, ["check", "--path", str(tmp_path / "nope")])
    assert result.exit_code != 0


# ---------------------------------------------------------------------------
# Locally excluded skills
# ---------------------------------------------------------------------------


def test_locally_excluded_skills_parses_exclude_file(tmp_path: Path) -> None:
    git_info = tmp_path / ".git" / "info"
    git_info.mkdir(parents=True)
    (git_info / "exclude").write_text(
        "# comment\n"
        ".agents/skills/foo-skill\n"
        ".claude/skills/foo-skill\n"
        ".agents/skills/bar-skill\n"
        ".claude/skills/bar-skill\n"
        "some/other/path\n",
        encoding="utf-8",
    )
    result = locally_excluded_skills(tmp_path)
    assert result == {"foo-skill", "bar-skill"}


def test_locally_excluded_skills_no_exclude_file(tmp_path: Path) -> None:
    result = locally_excluded_skills(tmp_path)
    assert result == set()


def test_check_excluded_skill_not_flagged_as_orphan(tmp_path: Path) -> None:
    """Skills listed in .git/info/exclude are not flagged as orphans."""
    _make_local_skill(tmp_path, "tracked")
    _make_lockfile(tmp_path, {"tracked": _local_lock_entry("tracked")})
    _make_agents_md(tmp_path, ["tracked"])

    # Add an unlocked skill directory (simulating local.just install)
    (tmp_path / ".agents" / "skills" / "local-only").mkdir(parents=True, exist_ok=True)

    git_info = tmp_path / ".git" / "info"
    git_info.mkdir(parents=True)
    (git_info / "exclude").write_text(
        ".agents/skills/local-only\n.claude/skills/local-only\n", encoding="utf-8"
    )

    result = CliRunner().invoke(main, ["check", "--path", str(tmp_path)])
    assert result.exit_code == 0
    assert "All skills OK" in result.output


def test_check_non_excluded_orphan_still_flagged(tmp_path: Path) -> None:
    """An orphan not in .git/info/exclude is still flagged."""
    _make_local_skill(tmp_path, "tracked")
    _make_lockfile(tmp_path, {"tracked": _local_lock_entry("tracked")})
    _make_agents_md(tmp_path, ["tracked"])

    (tmp_path / ".agents" / "skills" / "real-orphan").mkdir(parents=True, exist_ok=True)

    git_info = tmp_path / ".git" / "info"
    git_info.mkdir(parents=True)
    (git_info / "exclude").write_text(".agents/skills/other-skill\n", encoding="utf-8")

    result = CliRunner().invoke(main, ["check", "--path", str(tmp_path)])
    assert result.exit_code == 1
    assert "Orphaned directory .agents/skills/real-orphan/" in result.output


# ---------------------------------------------------------------------------
# CLAUDE.md / AGENTS.md pairing
# ---------------------------------------------------------------------------


def test_pairing_happy_root(tmp_path: Path) -> None:
    _make_lockfile(tmp_path, {})
    _write_file(tmp_path, "AGENTS.md", "# Agents\n")
    _write_file(tmp_path, "CLAUDE.md", "# project\n\n@AGENTS.md\n")

    result = CliRunner().invoke(main, ["check", "--path", str(tmp_path)])
    assert result.exit_code == 0
    assert "All skills OK" in result.output


def test_pairing_happy_nested(tmp_path: Path) -> None:
    _make_lockfile(tmp_path, {})
    _write_file(tmp_path, "AGENTS.md", "# Agents\n")
    _write_file(tmp_path, "CLAUDE.md", "# project\n\n@AGENTS.md\n")
    _write_file(tmp_path, "subpkg/AGENTS.md", "# Agents\n")
    _write_file(tmp_path, "subpkg/CLAUDE.md", "# subpkg\n\n@AGENTS.md\n")

    result = CliRunner().invoke(main, ["check", "--path", str(tmp_path)])
    assert result.exit_code == 0


def test_pairing_claude_without_agents(tmp_path: Path) -> None:
    _make_lockfile(tmp_path, {})
    _write_file(tmp_path, "CLAUDE.md", "# project\n\n@AGENTS.md\n")

    result = CliRunner().invoke(main, ["check", "--path", str(tmp_path)])
    assert result.exit_code == 1
    assert "CLAUDE.md at CLAUDE.md has no peer AGENTS.md" in result.output


def test_pairing_agents_without_claude(tmp_path: Path) -> None:
    _make_lockfile(tmp_path, {})
    _write_file(tmp_path, "AGENTS.md", "# Agents\n")

    result = CliRunner().invoke(main, ["check", "--path", str(tmp_path)])
    assert result.exit_code == 1
    assert "AGENTS.md at AGENTS.md has no peer CLAUDE.md" in result.output


def test_pairing_claude_missing_ref(tmp_path: Path) -> None:
    _make_lockfile(tmp_path, {})
    _write_file(tmp_path, "AGENTS.md", "# Agents\n")
    _write_file(tmp_path, "CLAUDE.md", "# project\n\nno reference\n")

    result = CliRunner().invoke(main, ["check", "--path", str(tmp_path)])
    assert result.exit_code == 1
    assert "does not include peer AGENTS.md via @AGENTS.md syntax" in result.output


def test_pairing_nested_violation_isolated_to_subdir(tmp_path: Path) -> None:
    _make_lockfile(tmp_path, {})
    _write_file(tmp_path, "AGENTS.md", "# Agents\n")
    _write_file(tmp_path, "CLAUDE.md", "# project\n\n@AGENTS.md\n")
    _write_file(tmp_path, "subpkg/CLAUDE.md", "# subpkg\n\n@AGENTS.md\n")

    result = CliRunner().invoke(main, ["check", "--path", str(tmp_path)])
    assert result.exit_code == 1
    assert "subpkg/CLAUDE.md" in result.output
    assert "has no peer AGENTS.md" in result.output
    assert "1 error(s)" in result.output


def test_pairing_skips_venv(tmp_path: Path) -> None:
    _make_lockfile(tmp_path, {})
    _write_file(tmp_path, "AGENTS.md", "# Agents\n")
    _write_file(tmp_path, "CLAUDE.md", "# project\n\n@AGENTS.md\n")
    _write_file(tmp_path, ".venv/lib/pkg/CLAUDE.md", "# bad\n")

    result = CliRunner().invoke(main, ["check", "--path", str(tmp_path)])
    assert result.exit_code == 0


def test_pairing_skips_git(tmp_path: Path) -> None:
    _make_lockfile(tmp_path, {})
    _write_file(tmp_path, "AGENTS.md", "# Agents\n")
    _write_file(tmp_path, "CLAUDE.md", "# project\n\n@AGENTS.md\n")
    _write_file(tmp_path, ".git/CLAUDE.md", "# bad\n")

    result = CliRunner().invoke(main, ["check", "--path", str(tmp_path)])
    assert result.exit_code == 0


def test_pairing_skips_vendored_github_skill(tmp_path: Path) -> None:
    _make_lockfile(tmp_path, {})
    _write_file(tmp_path, "AGENTS.md", "# Agents\n")
    _write_file(tmp_path, "CLAUDE.md", "# project\n\n@AGENTS.md\n")
    _write_file(tmp_path, ".agents/skills/foo/CLAUDE.md", "# bad\n")
    _write_file(tmp_path, ".git/info/exclude", ".agents/skills/foo\n")

    result = CliRunner().invoke(main, ["check", "--path", str(tmp_path)])
    assert result.exit_code == 0


def test_pairing_skips_own_templates_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _make_lockfile(tmp_path, {})
    _write_file(tmp_path, "AGENTS.md", "# Agents\n")
    _write_file(tmp_path, "CLAUDE.md", "# project\n\n@AGENTS.md\n")
    _write_file(tmp_path, "packages/areg/src/areg/_templates/CLAUDE.md", "# template\n")
    templates = (tmp_path / "packages/areg/src/areg/_templates").resolve()
    monkeypatch.setattr(pairing, "_templates_dir", lambda: templates)
    result = CliRunner().invoke(main, ["check", "--path", str(tmp_path)])
    assert result.exit_code == 0


def test_pairing_lints_coincidental_templates_dir(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _make_lockfile(tmp_path, {})
    _write_file(tmp_path, "AGENTS.md", "# Agents\n")
    _write_file(tmp_path, "CLAUDE.md", "# project\n\n@AGENTS.md\n")
    _write_file(tmp_path, "src/areg/_templates/CLAUDE.md", "# bad\n")
    monkeypatch.setattr(pairing, "_templates_dir", lambda: tmp_path / "_nonexistent")
    result = CliRunner().invoke(main, ["check", "--path", str(tmp_path)])
    assert result.exit_code == 1
    assert "src/areg/_templates/CLAUDE.md" in result.output
    assert "has no peer AGENTS.md" in result.output


def test_pairing_multiple_violations(tmp_path: Path) -> None:
    _make_lockfile(tmp_path, {})
    _write_file(tmp_path, "AGENTS.md", "# Agents\n")
    _write_file(tmp_path, "CLAUDE.md", "# project\n\n@AGENTS.md\n")
    _write_file(tmp_path, "pkg_a/AGENTS.md", "# Agents\n")
    _write_file(tmp_path, "pkg_b/CLAUDE.md", "# b\n\n@AGENTS.md\n")

    result = CliRunner().invoke(main, ["check", "--path", str(tmp_path)])
    assert result.exit_code == 1
    assert "pkg_a/AGENTS.md" in result.output
    assert "pkg_b/CLAUDE.md" in result.output
    assert "2 error(s)" in result.output
