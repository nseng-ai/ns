"""Layer 1 fake-check tests for FakeGhCli and FakeNpxSkills."""

from __future__ import annotations

from pathlib import Path

import pytest

from areg.gateways.environment.fake import FakeAregEnvironment
from areg.gateways.environment.gateway import GitRootDiscoveryError, ToolMissingError
from areg.gateways.gh.fake import FakeGhCli
from areg.gateways.gh.gateway import GhAuthError, GhNotFound
from areg.gateways.npx_skills.fake import FakeNpxSkills, NpxSkillsInvocation
from areg.gateways.npx_skills.gateway import NpxSkillsError, SkillFiles
from areg.gateways.skillx_workspace.fake import (
    FakeSkillxWorkspaceInstaller,
    SkillxWorkspaceInvocation,
)
from areg.gateways.skillx_workspace.gateway import SkillxWorkspaceError

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


def test_fake_npx_records_invocations(tmp_path: Path) -> None:
    npx = FakeNpxSkills()
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
    npx = FakeNpxSkills()
    npx.add("owner/repo", skills=["a"], agents=["codex"], cwd=tmp_path)
    snapshot = npx.invocations
    snapshot.clear()
    assert len(npx.invocations) == 1


def test_fake_npx_raise_on_add(tmp_path: Path) -> None:
    npx = FakeNpxSkills(raise_on_add=NpxSkillsError("boom"))
    with pytest.raises(NpxSkillsError, match="boom"):
        npx.add("owner/repo", skills=["a"], agents=["codex"], cwd=tmp_path)


def test_fake_npx_does_not_write_project_skill_state(tmp_path: Path) -> None:
    npx = FakeNpxSkills()

    npx.add("owner/repo", skills=["a"], agents=["codex"], cwd=tmp_path)

    assert not (tmp_path / ".agents").exists()
    assert not (tmp_path / ".claude").exists()
    assert not (tmp_path / "skills-lock.json").exists()


# ---------------------------------------------------------------------------
# FakeSkillxWorkspaceInstaller
# ---------------------------------------------------------------------------


def test_fake_skillx_workspace_selected_skill_returns_virtual_paths() -> None:
    installer = FakeSkillxWorkspaceInstaller(
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

    workspace = installer.install("owner/repo", skill="my-skill")

    assert workspace.tmp_dir == Path("/tmp/skillx.fake-1")
    assert len(workspace.skills) == 1
    installed = workspace.skills[0]
    assert installed.name == "my-skill"
    assert installed.skill_dir == Path("/tmp/skillx.fake-1/.agents/skills/my-skill")
    assert installed.skill_md == Path("/tmp/skillx.fake-1/.agents/skills/my-skill/SKILL.md")
    assert installed.files == ("SKILL.md", "references/patterns.md")
    assert installer.invocations == [SkillxWorkspaceInvocation(repo="owner/repo", skill="my-skill")]


def test_fake_skillx_workspace_skill_none_returns_all_catalog_skills_sorted() -> None:
    installer = FakeSkillxWorkspaceInstaller(
        catalog={
            "owner/repo": {
                "skill-b": SkillFiles(files={"SKILL.md": "b"}),
                "skill-a": SkillFiles(files={"SKILL.md": "a"}),
            }
        }
    )

    workspace = installer.install("owner/repo", skill=None)

    assert [installed.name for installed in workspace.skills] == ["skill-a", "skill-b"]


def test_fake_skillx_workspace_unknown_repo_raises() -> None:
    installer = FakeSkillxWorkspaceInstaller(catalog={"owner/repo": {}})

    with pytest.raises(SkillxWorkspaceError, match="unknown repo"):
        installer.install("missing/repo", skill=None)


def test_fake_skillx_workspace_unknown_skill_raises() -> None:
    installer = FakeSkillxWorkspaceInstaller(
        catalog={"owner/repo": {"known": SkillFiles(files={"SKILL.md": "known"})}}
    )

    with pytest.raises(SkillxWorkspaceError, match="unknown skill"):
        installer.install("owner/repo", skill="missing")


def test_fake_skillx_workspace_raise_on_install() -> None:
    installer = FakeSkillxWorkspaceInstaller(
        raise_on_install=SkillxWorkspaceError("install failed")
    )

    with pytest.raises(SkillxWorkspaceError, match="install failed"):
        installer.install("owner/repo", skill="a")


def test_fake_skillx_workspace_invocations_property_returns_copy() -> None:
    installer = FakeSkillxWorkspaceInstaller(catalog={"owner/repo": {}})
    installer.install("owner/repo", skill=None)

    snapshot = installer.invocations
    snapshot.clear()

    assert installer.invocations == [SkillxWorkspaceInvocation(repo="owner/repo", skill=None)]


def test_fake_skillx_workspace_does_not_write_files(tmp_path: Path) -> None:
    installer = FakeSkillxWorkspaceInstaller(
        catalog={"owner/repo": {"a": SkillFiles(files={"SKILL.md": "a"})}}
    )

    installer.install("owner/repo", skill="a")

    assert list(tmp_path.iterdir()) == []
