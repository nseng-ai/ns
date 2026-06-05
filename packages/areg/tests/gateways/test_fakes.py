"""Layer 1 fake-check tests for FakeGhCli and FakeNpxSkills."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from areg.gateways.environment.fake import FakeAregEnvironment
from areg.gateways.environment.gateway import GitRootDiscoveryError, ToolMissingError
from areg.gateways.gh.fake import FakeGhCli
from areg.gateways.gh.gateway import GhAuthError, GhNotFound
from areg.gateways.npx_skills.fake import FakeNpxSkills, NpxSkillsInvocation
from areg.gateways.npx_skills.gateway import NpxSkillsError, SkillFiles

# ---------------------------------------------------------------------------
# FakeAregEnvironment
# ---------------------------------------------------------------------------


def test_fake_environment_available_tools_succeed() -> None:
    environment = FakeAregEnvironment()

    environment.require_tool("gh")
    environment.require_tool("npx")

    assert environment.tool_checks == ["gh", "npx"]


def test_fake_environment_missing_tools_raise_friendly_errors() -> None:
    environment = FakeAregEnvironment(available_tools=set())

    with pytest.raises(ToolMissingError, match="gh CLI is required"):
        environment.require_tool("gh")
    with pytest.raises(ToolMissingError, match="npx is required"):
        environment.require_tool("npx")


def test_fake_environment_tool_checks_property_returns_copy() -> None:
    environment = FakeAregEnvironment()
    environment.require_tool("gh")

    snapshot = environment.tool_checks
    snapshot.append("npx")

    assert environment.tool_checks == ["gh"]


def test_fake_environment_configured_git_root_returns_path(tmp_path: Path) -> None:
    project = tmp_path / "project"
    environment = FakeAregEnvironment(git_roots={project: project})

    assert environment.require_git_root(project) == project
    assert environment.git_root_checks == [project]


def test_fake_environment_missing_git_root_mapping_raises_standard_error(tmp_path: Path) -> None:
    with pytest.raises(GitRootDiscoveryError, match="must be a Git worktree root"):
        FakeAregEnvironment().require_git_root(tmp_path)


def test_fake_environment_git_root_checks_property_returns_copy(tmp_path: Path) -> None:
    environment = FakeAregEnvironment(git_roots={tmp_path: tmp_path})
    environment.require_git_root(tmp_path)

    snapshot = environment.git_root_checks
    snapshot.clear()

    assert environment.git_root_checks == [tmp_path]


def test_fake_environment_configured_git_root_error_overrides_root(tmp_path: Path) -> None:
    environment = FakeAregEnvironment(
        git_roots={tmp_path: tmp_path},
        git_root_errors={tmp_path: GitRootDiscoveryError("boom")},
    )

    with pytest.raises(GitRootDiscoveryError, match="boom"):
        environment.require_git_root(tmp_path)


# ---------------------------------------------------------------------------
# FakeGhCli
# ---------------------------------------------------------------------------


def test_fake_gh_returns_catalog_entries() -> None:
    gh = FakeGhCli(catalog={"owner/repo": {"skills": ["a", "b"]}})
    assert gh.list_directory("owner/repo", "skills") == ["a", "b"]


def test_fake_gh_returns_a_copy() -> None:
    gh = FakeGhCli(catalog={"owner/repo": {"skills": ["a"]}})
    result = gh.list_directory("owner/repo", "skills")
    result.append("mutated")
    assert gh.list_directory("owner/repo", "skills") == ["a"]


def test_fake_gh_records_calls() -> None:
    gh = FakeGhCli(catalog={"r": {"skills": []}})
    gh.list_directory("r", "skills")
    gh.list_directory("r", "skills")
    assert gh.calls == [("r", "skills"), ("r", "skills")]


def test_fake_gh_calls_property_returns_copy() -> None:
    gh = FakeGhCli(catalog={"r": {"skills": []}})
    gh.list_directory("r", "skills")
    snapshot = gh.calls
    snapshot.append(("x", "y"))
    assert gh.calls == [("r", "skills")]


def test_fake_gh_unknown_repo_raises_not_found() -> None:
    gh = FakeGhCli(catalog={"owner/repo": {"skills": []}})
    with pytest.raises(GhNotFound):
        gh.list_directory("missing/repo", "skills")


def test_fake_gh_unknown_path_raises_not_found() -> None:
    gh = FakeGhCli(catalog={"owner/repo": {"skills": []}})
    with pytest.raises(GhNotFound):
        gh.list_directory("owner/repo", "elsewhere")


def test_fake_gh_raise_for_overrides_catalog() -> None:
    gh = FakeGhCli(
        catalog={"owner/repo": {"skills": ["a"]}},
        raise_for={("owner/repo", "skills"): GhAuthError("forbidden")},
    )
    with pytest.raises(GhAuthError):
        gh.list_directory("owner/repo", "skills")


def test_fake_gh_default_empty_catalog_raises() -> None:
    with pytest.raises(GhNotFound):
        FakeGhCli().list_directory("any/repo", "skills")


# ---------------------------------------------------------------------------
# FakeNpxSkills
# ---------------------------------------------------------------------------


def test_fake_npx_writes_skill_files_into_cwd(tmp_path: Path) -> None:
    npx = FakeNpxSkills(
        catalog={
            "owner/repo": {
                "my-skill": SkillFiles(
                    files={
                        "SKILL.md": "---\nname: my-skill\n---\n",
                        "references/patterns.md": "# Patterns\n",
                    }
                ),
            }
        }
    )
    npx.add("owner/repo", skills=["my-skill"], agents=["codex"], cwd=tmp_path)

    skill_dir = tmp_path / ".agents" / "skills" / "my-skill"
    assert (skill_dir / "SKILL.md").read_text() == "---\nname: my-skill\n---\n"
    assert (skill_dir / "references" / "patterns.md").read_text() == "# Patterns\n"


def test_fake_npx_writes_claude_symlinks_by_default(tmp_path: Path) -> None:
    npx = FakeNpxSkills(catalog={"owner/repo": {"my-skill": SkillFiles(files={"SKILL.md": "x"})}})
    npx.add("owner/repo", skills=["my-skill"], agents=["codex"], cwd=tmp_path)

    link = tmp_path / ".claude" / "skills" / "my-skill"
    assert link.is_symlink()


def test_fake_npx_writes_lock_file_by_default(tmp_path: Path) -> None:
    npx = FakeNpxSkills(catalog={"owner/repo": {"my-skill": SkillFiles(files={"SKILL.md": "x"})}})
    npx.add("owner/repo", skills=["my-skill"], agents=["codex"], cwd=tmp_path)

    lock = json.loads((tmp_path / "skills-lock.json").read_text())
    assert lock["version"] == 1
    assert "my-skill" in lock["skills"]
    assert lock["skills"]["my-skill"]["source"] == "owner/repo"


def test_fake_npx_merges_lock_file_entries(tmp_path: Path) -> None:
    (tmp_path / "skills-lock.json").write_text(
        json.dumps(
            {
                "version": 1,
                "skills": {
                    "existing-skill": {
                        "source": "someone/else",
                        "sourceType": "github",
                        "computedHash": "old",
                    }
                },
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    npx = FakeNpxSkills(catalog={"owner/repo": {"my-skill": SkillFiles(files={"SKILL.md": "x"})}})

    npx.add("owner/repo", skills=["my-skill"], agents=["codex"], cwd=tmp_path)

    lock = json.loads((tmp_path / "skills-lock.json").read_text(encoding="utf-8"))
    assert lock["skills"]["existing-skill"]["source"] == "someone/else"
    assert lock["skills"]["my-skill"]["source"] == "owner/repo"


def test_fake_npx_skip_lock_and_symlinks_when_disabled(tmp_path: Path) -> None:
    npx = FakeNpxSkills(
        catalog={"owner/repo": {"my-skill": SkillFiles(files={"SKILL.md": "x"})}},
        write_lock=False,
        write_claude_symlinks=False,
    )
    npx.add("owner/repo", skills=["my-skill"], agents=["codex"], cwd=tmp_path)
    assert not (tmp_path / "skills-lock.json").exists()
    assert not (tmp_path / ".claude").exists()


def test_fake_npx_skills_none_installs_all(tmp_path: Path) -> None:
    npx = FakeNpxSkills(
        catalog={
            "owner/repo": {
                "a": SkillFiles(files={"SKILL.md": "a"}),
                "b": SkillFiles(files={"SKILL.md": "b"}),
            }
        }
    )
    npx.add("owner/repo", skills=None, agents=["codex"], cwd=tmp_path)
    assert (tmp_path / ".agents" / "skills" / "a" / "SKILL.md").exists()
    assert (tmp_path / ".agents" / "skills" / "b" / "SKILL.md").exists()


def test_fake_npx_records_invocations(tmp_path: Path) -> None:
    npx = FakeNpxSkills(catalog={"owner/repo": {"a": SkillFiles(files={"SKILL.md": "a"})}})
    npx.add("owner/repo", skills=["a"], agents=["codex", "claude-code"], cwd=tmp_path)

    assert npx.invocations == [
        NpxSkillsInvocation(
            repo="owner/repo",
            skills=("a",),
            agents=("codex", "claude-code"),
            cwd=tmp_path,
        )
    ]


def test_fake_npx_invocations_property_returns_copy(tmp_path: Path) -> None:
    npx = FakeNpxSkills(catalog={"owner/repo": {"a": SkillFiles(files={"SKILL.md": "a"})}})
    npx.add("owner/repo", skills=["a"], agents=["codex"], cwd=tmp_path)
    snapshot = npx.invocations
    snapshot.clear()
    assert len(npx.invocations) == 1


def test_fake_npx_raise_on_add(tmp_path: Path) -> None:
    npx = FakeNpxSkills(raise_on_add=NpxSkillsError("boom"))
    with pytest.raises(NpxSkillsError, match="boom"):
        npx.add("owner/repo", skills=["a"], agents=["codex"], cwd=tmp_path)


def test_fake_npx_unknown_repo_raises(tmp_path: Path) -> None:
    npx = FakeNpxSkills(catalog={"owner/repo": {"a": SkillFiles()}})
    with pytest.raises(NpxSkillsError, match="unknown repo"):
        npx.add("nope/missing", skills=["a"], agents=["codex"], cwd=tmp_path)


def test_fake_npx_unknown_skill_raises(tmp_path: Path) -> None:
    npx = FakeNpxSkills(catalog={"owner/repo": {"a": SkillFiles()}})
    with pytest.raises(NpxSkillsError, match="unknown skill"):
        npx.add("owner/repo", skills=["b"], agents=["codex"], cwd=tmp_path)
