from __future__ import annotations

import json

from click.testing import CliRunner

from areg.cli import main
from areg.context import AregContext
from areg.gateways.gh.fake import FakeGhCli
from areg.gateways.npx_skills.fake import FakeNpxSkills
from areg.gateways.npx_skills.gateway import NpxSkillsError, SkillFiles

DEFAULT_REPO = "dagster-io/asdl-tools"
OTHER = "someone/other-repo"


def _catalog_all_default() -> dict[str, dict[str, SkillFiles]]:
    names = [
        "dignified-python",
        "pytest",
        "skill-audit",
        "skill-management",
        "skillx",
    ]
    return {
        DEFAULT_REPO: {n: SkillFiles(files={"SKILL.md": f"---\nname: {n}\n---\n"}) for n in names},
        OTHER: {"other-skill": SkillFiles(files={"SKILL.md": "---\nname: other-skill\n---\n"})},
    }


def _ctx(npx: FakeNpxSkills | None = None) -> AregContext:
    return AregContext(
        gh=FakeGhCli(),
        npx_skills=npx or FakeNpxSkills(catalog=_catalog_all_default()),
    )


def _write_lockfile(project_dir, entries: dict[str, dict]) -> None:
    project_dir.mkdir(parents=True, exist_ok=True)
    (project_dir / "skills-lock.json").write_text(
        json.dumps({"version": 1, "skills": entries}, indent=2), encoding="utf-8"
    )


def _github_entry(source: str = DEFAULT_REPO, hash_suffix: str = "abc") -> dict:
    return {"source": source, "sourceType": "github", "computedHash": hash_suffix}


def _local_entry(name: str) -> dict:
    return {"source": f"skills/{name}", "sourceType": "local", "computedHash": "xxx"}


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
    fake = FakeNpxSkills(catalog=_catalog_all_default())

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
    fake = FakeNpxSkills(catalog=_catalog_all_default())

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
    fake = FakeNpxSkills(catalog=_catalog_all_default())

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
    fake = FakeNpxSkills(catalog=_catalog_all_default())

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
    fake = FakeNpxSkills(catalog=_catalog_all_default())

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
    fake = FakeNpxSkills(catalog=_catalog_all_default())

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


def test_update_skills_reads_agents_from_areg_json(tmp_path) -> None:
    project = tmp_path / "proj"
    _write_lockfile(project, {"pytest": _github_entry()})
    (project / "areg.json").write_text(
        json.dumps({"agents": ["codex", "cursor"]}), encoding="utf-8"
    )
    fake = FakeNpxSkills(catalog=_catalog_all_default())

    result = CliRunner().invoke(main, ["update-skills", "--path", str(project)], obj=_ctx(fake))

    assert result.exit_code == 0, result.output
    assert fake.invocations[0].agents == ("codex", "cursor")


def test_update_skills_explicit_agent_overrides_areg_json(tmp_path) -> None:
    project = tmp_path / "proj"
    _write_lockfile(project, {"pytest": _github_entry()})
    (project / "areg.json").write_text(
        json.dumps({"agents": ["codex", "cursor"]}), encoding="utf-8"
    )
    fake = FakeNpxSkills(catalog=_catalog_all_default())

    result = CliRunner().invoke(
        main,
        ["update-skills", "--path", str(project), "--agent", "claude-code"],
        obj=_ctx(fake),
    )

    assert result.exit_code == 0, result.output
    assert fake.invocations[0].agents == ("claude-code",)


def test_update_skills_default_agents_when_no_areg_json(tmp_path) -> None:
    project = tmp_path / "proj"
    _write_lockfile(project, {"pytest": _github_entry()})
    fake = FakeNpxSkills(catalog=_catalog_all_default())

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
