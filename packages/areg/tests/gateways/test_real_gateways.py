"""Layer 2 real-sanity tests for RealGhCli and RealNpxSkills.

These are the only tests in the repo allowed to mock `subprocess.run`.
They verify that the real gateway implementations build the right command
and parse the right output. They do not exercise real external systems —
that's what `tests/integration/` is for.
"""

from __future__ import annotations

import subprocess
from pathlib import Path
from unittest.mock import patch

import pytest

from areg.gateways.gh.gateway import (
    GhAuthError,
    GhError,
    GhNotFound,
)
from areg.gateways.gh.real import RealGhCli
from areg.gateways.npx_skills.gateway import NpxSkillsError
from areg.gateways.npx_skills.real import RealNpxSkills

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
