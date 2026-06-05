from __future__ import annotations

import json
from pathlib import Path

import pytest
from click.testing import CliRunner

from areg.cli import main
from areg.context import AregContext
from areg.gateways.environment.fake import FakeAregEnvironment
from areg.gateways.gh.fake import FakeGhCli
from areg.gateways.npx_skills.fake import FakeNpxSkills
from areg.gateways.npx_skills.gateway import NpxSkillsError
from areg.gateways.skillx_workspace.fake import FakeSkillxWorkspaceInstaller

DEFAULT_REPO = "dagster-io/asdl-tools"
OTHER = "someone/other-repo"
_VALID_GITHUB_HASH = "b" * 64
_VALID_LOCAL_HASH = "a" * 64


def _ctx(npx: FakeNpxSkills | None = None) -> AregContext:
    return AregContext(
        gh=FakeGhCli(),
        npx_skills=npx or FakeNpxSkills(),
        environment=FakeAregEnvironment(),
        skillx_workspace=FakeSkillxWorkspaceInstaller(),
    )


def _write_lockfile(project_dir: Path, entries: dict[str, dict]) -> None:
    _write_raw_lockfile(project_dir, {"version": 1, "skills": entries})


def _write_raw_lockfile(project_dir: Path, raw_lockfile: object) -> None:
    project_dir.mkdir(parents=True, exist_ok=True)
    (project_dir / "skills-lock.json").write_text(
        json.dumps(raw_lockfile, indent=2), encoding="utf-8"
    )


def _github_entry(source: str = DEFAULT_REPO, computed_hash: str = _VALID_GITHUB_HASH) -> dict:
    return {"source": source, "sourceType": "github", "computedHash": computed_hash}


def _local_entry(name: str) -> dict:
    return {"source": f"skills/{name}", "sourceType": "local", "computedHash": _VALID_LOCAL_HASH}


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


def test_update_skills_calls_npx_per_skill(tmp_path) -> None:
    project = tmp_path / "proj"
    _write_lockfile(
        project,
        {
            "pytest": _github_entry(),
            "skill-audit": _github_entry(),
            "skillx": _github_entry(),
        },
    )
    fake = FakeNpxSkills()

    result = CliRunner().invoke(main, ["update-skills", "--path", str(project)], obj=_ctx(fake))

    assert result.exit_code == 0, result.output
    assert len(fake.invocations) == 3
    # Deterministic order (sorted by name)
    assert [inv.skills for inv in fake.invocations] == [
        ("pytest",),
        ("skill-audit",),
        ("skillx",),
    ]
    for inv in fake.invocations:
        assert inv.repo == DEFAULT_REPO
        assert inv.agents == ("codex", "claude-code")
        assert inv.cwd == project


def test_update_skills_skips_local_entries(tmp_path) -> None:
    project = tmp_path / "proj"
    _write_lockfile(
        project,
        {
            "pytest": _github_entry(),
            "my-local": _local_entry("my-local"),
        },
    )
    fake = FakeNpxSkills()

    result = CliRunner().invoke(main, ["update-skills", "--path", str(project)], obj=_ctx(fake))

    assert result.exit_code == 0, result.output
    assert [inv.skills for inv in fake.invocations] == [("pytest",)]


# ---------------------------------------------------------------------------
# Filtering
# ---------------------------------------------------------------------------


def test_update_skills_filter_by_skill_name(tmp_path) -> None:
    project = tmp_path / "proj"
    _write_lockfile(
        project,
        {
            "pytest": _github_entry(),
            "skill-audit": _github_entry(),
            "skillx": _github_entry(),
        },
    )
    fake = FakeNpxSkills()

    result = CliRunner().invoke(
        main,
        ["update-skills", "--path", str(project), "--skill", "skillx", "--skill", "pytest"],
        obj=_ctx(fake),
    )

    assert result.exit_code == 0, result.output
    assert [inv.skills for inv in fake.invocations] == [("pytest",), ("skillx",)]


def test_update_skills_unknown_skill_name_errors(tmp_path) -> None:
    project = tmp_path / "proj"
    _write_lockfile(project, {"pytest": _github_entry()})
    fake = FakeNpxSkills()

    result = CliRunner().invoke(
        main,
        ["update-skills", "--path", str(project), "--skill", "does-not-exist"],
        obj=_ctx(fake),
    )

    assert result.exit_code != 0
    assert "does-not-exist" in result.output
    assert fake.invocations == []


def test_update_skills_filter_by_source(tmp_path) -> None:
    project = tmp_path / "proj"
    _write_lockfile(
        project,
        {
            "pytest": _github_entry(DEFAULT_REPO),
            "other-skill": _github_entry(OTHER),
        },
    )
    fake = FakeNpxSkills()

    result = CliRunner().invoke(
        main,
        ["update-skills", "--path", str(project), "--source", DEFAULT_REPO],
        obj=_ctx(fake),
    )

    assert result.exit_code == 0, result.output
    assert [inv.repo for inv in fake.invocations] == [DEFAULT_REPO]
    assert [inv.skills for inv in fake.invocations] == [("pytest",)]


# ---------------------------------------------------------------------------
# Dry run
# ---------------------------------------------------------------------------


def test_update_skills_dry_run_makes_no_calls(tmp_path) -> None:
    project = tmp_path / "proj"
    _write_lockfile(
        project,
        {
            "pytest": _github_entry(),
            "skillx": _github_entry(),
        },
    )
    fake = FakeNpxSkills()

    result = CliRunner().invoke(
        main,
        ["update-skills", "--path", str(project), "--dry-run"],
        obj=_ctx(fake),
    )

    assert result.exit_code == 0, result.output
    assert fake.invocations == []
    assert "pytest" in result.output
    assert "skillx" in result.output
    assert "dry-run" in result.output


# ---------------------------------------------------------------------------
# Agents resolution
# ---------------------------------------------------------------------------


def test_update_skills_reads_agents_from_asdl_toml(tmp_path) -> None:
    project = tmp_path / "proj"
    _write_lockfile(project, {"pytest": _github_entry()})
    (project / "asdl.toml").write_text('[areg]\nagents = ["codex", "cursor"]\n', encoding="utf-8")
    fake = FakeNpxSkills()

    result = CliRunner().invoke(main, ["update-skills", "--path", str(project)], obj=_ctx(fake))

    assert result.exit_code == 0, result.output
    assert fake.invocations[0].agents == ("codex", "cursor")


def test_update_skills_reads_agents_from_legacy_areg_json(tmp_path) -> None:
    project = tmp_path / "proj"
    _write_lockfile(project, {"pytest": _github_entry()})
    (project / "areg.json").write_text(
        json.dumps({"agents": ["codex", "cursor"]}), encoding="utf-8"
    )
    fake = FakeNpxSkills()

    result = CliRunner().invoke(main, ["update-skills", "--path", str(project)], obj=_ctx(fake))

    assert result.exit_code == 0, result.output
    assert fake.invocations[0].agents == ("codex", "cursor")


def test_update_skills_asdl_toml_overrides_legacy_areg_json(tmp_path) -> None:
    project = tmp_path / "proj"
    _write_lockfile(project, {"pytest": _github_entry()})
    (project / "asdl.toml").write_text('[areg]\nagents = ["codex", "cursor"]\n', encoding="utf-8")
    (project / "areg.json").write_text(
        json.dumps({"agents": ["codex", "windsurf"]}), encoding="utf-8"
    )
    fake = FakeNpxSkills()

    result = CliRunner().invoke(main, ["update-skills", "--path", str(project)], obj=_ctx(fake))

    assert result.exit_code == 0, result.output
    assert fake.invocations[0].agents == ("codex", "cursor")


def test_update_skills_explicit_agent_overrides_asdl_toml(tmp_path) -> None:
    project = tmp_path / "proj"
    _write_lockfile(project, {"pytest": _github_entry()})
    (project / "asdl.toml").write_text('[areg]\nagents = ["codex", "cursor"]\n', encoding="utf-8")
    fake = FakeNpxSkills()

    result = CliRunner().invoke(
        main,
        ["update-skills", "--path", str(project), "--agent", "claude-code"],
        obj=_ctx(fake),
    )

    assert result.exit_code == 0, result.output
    assert fake.invocations[0].agents == ("claude-code",)


def test_update_skills_explicit_agent_ignores_invalid_legacy_areg_json(tmp_path) -> None:
    project = tmp_path / "proj"
    _write_lockfile(project, {"pytest": _github_entry()})
    (project / "areg.json").write_text("{not json\n", encoding="utf-8")
    fake = FakeNpxSkills()

    result = CliRunner().invoke(
        main,
        ["update-skills", "--path", str(project), "--agent", "claude-code"],
        obj=_ctx(fake),
    )

    assert result.exit_code == 0, result.output
    assert fake.invocations[0].agents == ("claude-code",)


def test_update_skills_asdl_toml_ignores_invalid_legacy_areg_json(tmp_path) -> None:
    project = tmp_path / "proj"
    _write_lockfile(project, {"pytest": _github_entry()})
    (project / "asdl.toml").write_text('[areg]\nagents = ["codex", "cursor"]\n', encoding="utf-8")
    (project / "areg.json").write_text("{not json\n", encoding="utf-8")
    fake = FakeNpxSkills()

    result = CliRunner().invoke(main, ["update-skills", "--path", str(project)], obj=_ctx(fake))

    assert result.exit_code == 0, result.output
    assert fake.invocations[0].agents == ("codex", "cursor")


def test_update_skills_invalid_asdl_toml_errors(tmp_path) -> None:
    project = tmp_path / "proj"
    _write_lockfile(project, {"pytest": _github_entry()})
    (project / "asdl.toml").write_text("[areg\n", encoding="utf-8")
    fake = FakeNpxSkills()

    result = CliRunner().invoke(main, ["update-skills", "--path", str(project)], obj=_ctx(fake))

    assert result.exit_code != 0
    assert "Invalid TOML" in result.output
    assert fake.invocations == []


def test_update_skills_default_agents_when_no_project_config(tmp_path) -> None:
    project = tmp_path / "proj"
    _write_lockfile(project, {"pytest": _github_entry()})
    fake = FakeNpxSkills()

    result = CliRunner().invoke(main, ["update-skills", "--path", str(project)], obj=_ctx(fake))

    assert result.exit_code == 0, result.output
    assert fake.invocations[0].agents == ("codex", "claude-code")


# ---------------------------------------------------------------------------
# Error paths
# ---------------------------------------------------------------------------


def test_update_skills_no_lockfile(tmp_path) -> None:
    project = tmp_path / "proj"
    project.mkdir()

    result = CliRunner().invoke(main, ["update-skills", "--path", str(project)], obj=_ctx())

    assert result.exit_code != 0
    assert "skills-lock.json" in result.output


@pytest.mark.parametrize(
    ("raw_lockfile", "expected"),
    [
        ([], "root must be an object"),
        ({"version": 1, "skills": {"pytest": []}}, "$.skills.pytest must be an object"),
        (
            {
                "version": 1,
                "skills": {
                    "pytest": {
                        "source": 1,
                        "sourceType": "github",
                        "computedHash": _VALID_GITHUB_HASH,
                    }
                },
            },
            "$.skills.pytest.source must be a string",
        ),
        (
            {
                "version": 1,
                "skills": {"pytest": {"source": DEFAULT_REPO, "sourceType": "github"}},
            },
            "$.skills.pytest.computedHash is required",
        ),
    ],
)
def test_update_skills_malformed_lockfile_shape_errors_without_npx_calls(
    tmp_path,
    raw_lockfile: object,
    expected: str,
) -> None:
    project = tmp_path / "proj"
    _write_raw_lockfile(project, raw_lockfile)
    fake = FakeNpxSkills()

    result = CliRunner().invoke(main, ["update-skills", "--path", str(project)], obj=_ctx(fake))

    assert result.exit_code != 0
    assert "Invalid skills-lock.json" in result.output
    assert expected in result.output
    assert fake.invocations == []


def test_update_skills_empty_after_filter(tmp_path) -> None:
    project = tmp_path / "proj"
    _write_lockfile(project, {"my-local": _local_entry("my-local")})

    result = CliRunner().invoke(main, ["update-skills", "--path", str(project)], obj=_ctx())

    assert result.exit_code == 0, result.output
    assert "Nothing to update" in result.output


def test_update_skills_propagates_npx_failure(tmp_path) -> None:
    project = tmp_path / "proj"
    _write_lockfile(project, {"pytest": _github_entry()})
    fake = FakeNpxSkills(raise_on_add=NpxSkillsError("boom"))

    result = CliRunner().invoke(main, ["update-skills", "--path", str(project)], obj=_ctx(fake))

    assert result.exit_code != 0
    assert "pytest" in result.output
    assert "failed" in result.output.lower()
