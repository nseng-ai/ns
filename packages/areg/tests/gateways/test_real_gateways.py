"""Layer 2 real-sanity tests for areg real gateway implementations.

These are the only tests in the repo allowed to mock `subprocess.run` or
`shutil.which` for areg gateway behavior. They verify that real gateway
implementations build the right command and parse the right output. They do
not exercise real external systems — that's what `tests/integration/` is for.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path
from unittest.mock import patch

import pytest

from areg.gateways.environment.gateway import GitRootDiscoveryError, ToolMissingError
from areg.gateways.environment.real import RealAregEnvironment
from areg.gateways.gh.gateway import (
    GhAuthError,
    GhError,
    GhNotFound,
)
from areg.gateways.gh.real import RealGhCli
from areg.gateways.npx_skills.gateway import NpxSkills, NpxSkillsError
from areg.gateways.npx_skills.real import RealNpxSkills
from areg.gateways.skillx_workspace.gateway import SkillxWorkspaceError
from areg.gateways.skillx_workspace.real import RealSkillxWorkspaceInstaller

# ---------------------------------------------------------------------------
# RealAregEnvironment
# ---------------------------------------------------------------------------


def test_real_environment_missing_gh_raises_friendly_error() -> None:
    with patch(
        "areg.gateways.environment.real.shutil.which",
        autospec=True,
        return_value=None,
    ):
        with pytest.raises(ToolMissingError, match="gh CLI is required"):
            RealAregEnvironment().require_tool("gh")


def test_real_environment_missing_npx_raises_friendly_error() -> None:
    with patch(
        "areg.gateways.environment.real.shutil.which",
        autospec=True,
        return_value=None,
    ):
        with pytest.raises(ToolMissingError, match="npx is required"):
            RealAregEnvironment().require_tool("npx")


def test_real_environment_present_tool_does_not_raise() -> None:
    with patch(
        "areg.gateways.environment.real.shutil.which",
        autospec=True,
        return_value="/usr/bin/gh",
    ) as mock_which:
        RealAregEnvironment().require_tool("gh")

    mock_which.assert_called_once_with("gh")


def test_real_environment_git_root_success(tmp_path: Path) -> None:
    proc = subprocess.CompletedProcess(
        args=[],
        returncode=0,
        stdout=f"{tmp_path}\n",
        stderr="",
    )
    with patch(
        "areg.gateways.environment.real.subprocess.run",
        autospec=True,
        return_value=proc,
    ) as mock_run:
        root = RealAregEnvironment().require_git_root(tmp_path)

    assert root == tmp_path.resolve()
    mock_run.assert_called_once_with(
        ["git", "-C", str(tmp_path), "rev-parse", "--show-toplevel"],
        check=True,
        capture_output=True,
        text=True,
    )


def test_real_environment_missing_git_raises_git_root_error(tmp_path: Path) -> None:
    with patch(
        "areg.gateways.environment.real.subprocess.run",
        autospec=True,
        side_effect=FileNotFoundError,
    ):
        with pytest.raises(GitRootDiscoveryError, match="git is required"):
            RealAregEnvironment().require_git_root(tmp_path)


def test_real_environment_git_command_failure_raises_git_root_error(tmp_path: Path) -> None:
    err = subprocess.CalledProcessError(1, [], stderr="not a git repo")
    with patch(
        "areg.gateways.environment.real.subprocess.run",
        autospec=True,
        side_effect=err,
    ):
        with pytest.raises(GitRootDiscoveryError, match="must be a Git worktree root"):
            RealAregEnvironment().require_git_root(tmp_path)


def test_real_environment_empty_git_root_output_raises_git_root_error(tmp_path: Path) -> None:
    proc = subprocess.CompletedProcess(args=[], returncode=0, stdout="", stderr="")
    with patch(
        "areg.gateways.environment.real.subprocess.run",
        autospec=True,
        return_value=proc,
    ):
        with pytest.raises(GitRootDiscoveryError, match="must be a Git worktree root"):
            RealAregEnvironment().require_git_root(tmp_path)


# ---------------------------------------------------------------------------
# RealGhCli
# ---------------------------------------------------------------------------


def test_real_gh_builds_correct_gh_api_command() -> None:
    proc = subprocess.CompletedProcess(args=[], returncode=0, stdout="a\nb\n", stderr="")
    with patch(
        "areg.gateways.gh.real.subprocess.run",
        autospec=True,
        return_value=proc,
    ) as mock_run:
        result = RealGhCli().list_directory("owner/repo", "skills")

    assert result == ["a", "b"]
    cmd = mock_run.call_args[0][0]
    assert cmd == [
        "gh",
        "api",
        "repos/owner/repo/contents/skills",
        "--jq",
        ".[].name",
    ]
    kwargs = mock_run.call_args[1]
    assert kwargs["capture_output"] is True
    assert kwargs["text"] is True
    assert kwargs["check"] is True


def test_real_gh_strips_blank_lines() -> None:
    proc = subprocess.CompletedProcess(args=[], returncode=0, stdout=" a \n\n b \n", stderr="")
    with patch(
        "areg.gateways.gh.real.subprocess.run",
        autospec=True,
        return_value=proc,
    ):
        assert RealGhCli().list_directory("o/r", "skills") == ["a", "b"]


def test_real_gh_404_raises_not_found() -> None:
    err = subprocess.CalledProcessError(1, [], stderr="HTTP 404 Not Found")
    with patch(
        "areg.gateways.gh.real.subprocess.run",
        autospec=True,
        side_effect=err,
    ):
        with pytest.raises(GhNotFound):
            RealGhCli().list_directory("o/r", "skills")


def test_real_gh_401_raises_auth_error() -> None:
    err = subprocess.CalledProcessError(1, [], stderr="HTTP 401 Unauthorized")
    with patch(
        "areg.gateways.gh.real.subprocess.run",
        autospec=True,
        side_effect=err,
    ):
        with pytest.raises(GhAuthError):
            RealGhCli().list_directory("o/r", "skills")


def test_real_gh_403_raises_auth_error() -> None:
    err = subprocess.CalledProcessError(1, [], stderr="HTTP 403 Forbidden")
    with patch(
        "areg.gateways.gh.real.subprocess.run",
        autospec=True,
        side_effect=err,
    ):
        with pytest.raises(GhAuthError):
            RealGhCli().list_directory("o/r", "skills")


def test_real_gh_other_error_raises_gh_error() -> None:
    err = subprocess.CalledProcessError(1, [], stderr="rate limited")
    with patch(
        "areg.gateways.gh.real.subprocess.run",
        autospec=True,
        side_effect=err,
    ):
        with pytest.raises(GhError, match="rate limited"):
            RealGhCli().list_directory("o/r", "skills")


# ---------------------------------------------------------------------------
# RealNpxSkills
# ---------------------------------------------------------------------------


def test_real_npx_builds_correct_command_with_skills(tmp_path: Path) -> None:
    proc = subprocess.CompletedProcess(args=[], returncode=0, stdout="", stderr="")
    with patch(
        "areg.gateways.npx_skills.real.subprocess.run",
        autospec=True,
        return_value=proc,
    ) as mock_run:
        RealNpxSkills().add(
            "dagster-io/asdl-tools",
            skills=["skill-management", "skillx"],
            agents=["codex", "claude-code"],
            cwd=tmp_path,
        )

    cmd = mock_run.call_args[0][0]
    assert cmd == [
        "npx",
        "skills",
        "add",
        "dagster-io/asdl-tools",
        "--skill",
        "skill-management",
        "skillx",
        "--agent",
        "codex",
        "claude-code",
        "-y",
    ]
    kwargs = mock_run.call_args[1]
    assert kwargs["cwd"] == tmp_path
    assert kwargs["check"] is True
    assert kwargs["capture_output"] is True
    assert kwargs["text"] is True


def test_real_npx_builds_correct_command_without_skills(tmp_path: Path) -> None:
    proc = subprocess.CompletedProcess(args=[], returncode=0, stdout="", stderr="")
    with patch(
        "areg.gateways.npx_skills.real.subprocess.run",
        autospec=True,
        return_value=proc,
    ) as mock_run:
        RealNpxSkills().add(
            "owner/repo",
            skills=None,
            agents=["codex"],
            cwd=tmp_path,
        )

    cmd = mock_run.call_args[0][0]
    assert cmd == ["npx", "skills", "add", "owner/repo", "--agent", "codex", "-y"]


def test_real_npx_subprocess_error_raises_npx_skills_error(tmp_path: Path) -> None:
    err = subprocess.CalledProcessError(1, [], stderr="boom")
    with patch(
        "areg.gateways.npx_skills.real.subprocess.run",
        autospec=True,
        side_effect=err,
    ):
        with pytest.raises(NpxSkillsError, match="boom"):
            RealNpxSkills().add("o/r", skills=None, agents=["codex"], cwd=tmp_path)


# ---------------------------------------------------------------------------
# RealSkillxWorkspaceInstaller
# ---------------------------------------------------------------------------


class _WritingNpxSkills(NpxSkills):
    def __init__(self) -> None:
        self.invocations: list[tuple[str, tuple[str, ...] | None, tuple[str, ...], Path]] = []

    def add(
        self,
        repo: str,
        *,
        skills: list[str] | None,
        agents: list[str],
        cwd: Path,
    ) -> None:
        self.invocations.append(
            (repo, tuple(skills) if skills is not None else None, tuple(agents), cwd)
        )
        skill_names = skills or ["skill-a"]
        for skill_name in skill_names:
            skill_dir = cwd / ".agents" / "skills" / skill_name
            skill_dir.mkdir(parents=True, exist_ok=True)
            (skill_dir / "SKILL.md").write_text(
                f"---\nname: {skill_name}\n---\n",
                encoding="utf-8",
            )
            references = skill_dir / "references"
            references.mkdir()
            (references / "patterns.md").write_text("# Patterns\n", encoding="utf-8")


class _FailingNpxSkills(NpxSkills):
    def add(
        self,
        repo: str,
        *,
        skills: list[str] | None,
        agents: list[str],
        cwd: Path,
    ) -> None:
        raise NpxSkillsError("boom")


class _NoopNpxSkills(NpxSkills):
    def __init__(self) -> None:
        self.cwd: Path | None = None

    def add(
        self,
        repo: str,
        *,
        skills: list[str] | None,
        agents: list[str],
        cwd: Path,
    ) -> None:
        self.cwd = cwd


def test_real_skillx_workspace_installer_reads_installed_skill_tree() -> None:
    npx = _WritingNpxSkills()
    installer = RealSkillxWorkspaceInstaller(npx_skills=npx)

    workspace = installer.install("owner/repo", skill="my-skill")

    try:
        assert npx.invocations == [("owner/repo", ("my-skill",), ("codex",), workspace.tmp_dir)]
        assert workspace.tmp_dir.exists()
        assert len(workspace.skills) == 1
        installed = workspace.skills[0]
        assert installed.name == "my-skill"
        assert installed.skill_dir.is_dir()
        assert installed.skill_md.is_file()
        assert installed.files == ("SKILL.md", "references/patterns.md")
    finally:
        shutil.rmtree(workspace.tmp_dir, ignore_errors=True)


def test_real_skillx_workspace_installer_wraps_npx_failure() -> None:
    installer = RealSkillxWorkspaceInstaller(npx_skills=_FailingNpxSkills())

    with pytest.raises(SkillxWorkspaceError, match="npx skills add failed: boom"):
        installer.install("owner/repo", skill="my-skill")


def test_real_skillx_workspace_installer_errors_when_no_skills_installed() -> None:
    npx = _NoopNpxSkills()
    installer = RealSkillxWorkspaceInstaller(npx_skills=npx)

    with pytest.raises(SkillxWorkspaceError, match="No skills were installed"):
        installer.install("owner/repo", skill=None)

    assert npx.cwd is not None
    assert not npx.cwd.exists()
