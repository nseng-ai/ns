"""Tests for RealPRGateway and the shared fetch_pr_summary_for_branch helper."""

from __future__ import annotations

import json
import subprocess

import pytest

from asdl_core.gh import real_gateway_helpers
from asdl_core.gh.pr_gateway import RealPRGateway
from asdl_core.gh.types import PRCommandError, PRLookupError


def _make_fake_run(
    *,
    response: dict[str, object] | None = None,
    returncode: int = 0,
    stderr: str = "",
) -> object:
    payload = json.dumps(response) if response is not None else ""

    def fake_run(
        cmd: list[str],
        **kwargs: object,
    ) -> subprocess.CompletedProcess[str]:
        assert cmd[:3] == ["gh", "pr", "view"]
        return subprocess.CompletedProcess(cmd, returncode, stdout=payload, stderr=stderr)

    return fake_run


@pytest.mark.parametrize("state", ["OPEN", "MERGED", "CLOSED"])
def test_real_pr_gateway_returns_summary(
    monkeypatch: pytest.MonkeyPatch,
    state: str,
) -> None:
    monkeypatch.setattr(
        real_gateway_helpers.subprocess,
        "run",
        _make_fake_run(
            response={
                "number": 47,
                "title": "Port pr-address skill",
                "url": "https://github.com/dagster-io/asdl/pull/47",
                "body": "PR body text",
                "headRefName": "feature",
                "baseRefName": "master",
                "state": state,
            },
        ),
    )

    result = RealPRGateway().get_pr_for_branch("feature")

    assert not isinstance(result, PRLookupError)
    assert result.number == 47
    assert result.state == state
    assert result.body == "PR body text"


def test_real_pr_gateway_search_prs_returns_body(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[list[str]] = []

    def fake_run(
        cmd: list[str],
        **kwargs: object,
    ) -> subprocess.CompletedProcess[str]:
        seen.append(cmd)
        assert cmd[:3] == ["gh", "pr", "list"]
        return subprocess.CompletedProcess(
            cmd,
            0,
            stdout=json.dumps(
                [
                    {
                        "number": 47,
                        "title": "Port pr-address skill",
                        "url": "https://github.com/dagster-io/asdl/pull/47",
                        "body": "Search body",
                        "headRefName": "feature",
                        "baseRefName": "master",
                        "state": "MERGED",
                    }
                ]
            ),
            stderr="",
        )

    monkeypatch.setattr(real_gateway_helpers.subprocess, "run", fake_run)

    result = RealPRGateway().search_prs("Port", state="merged")

    assert not isinstance(result, PRLookupError)
    assert len(result) == 1
    assert result[0].body == "Search body"
    assert seen == [
        [
            "gh",
            "pr",
            "list",
            "--state",
            "merged",
            "--search",
            "Port",
            "--json",
            "number,title,body,url,headRefName,baseRefName,state",
        ]
    ]


def test_real_pr_gateway_returns_error_when_no_pr(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        real_gateway_helpers.subprocess,
        "run",
        _make_fake_run(returncode=1, stderr="no pull requests found for branch 'feature'\n"),
    )

    result = RealPRGateway().get_pr_for_branch("feature")

    assert isinstance(result, PRLookupError)
    assert result.returncode == 1
    assert "no pull requests found" in result.stderr


def test_real_pr_gateway_returns_details(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[list[str]] = []

    def fake_run(
        cmd: list[str],
        **kwargs: object,
    ) -> subprocess.CompletedProcess[str]:
        seen.append(cmd)
        return subprocess.CompletedProcess(
            cmd,
            0,
            stdout=json.dumps(
                {
                    "number": 48,
                    "headRefName": "feature",
                    "baseRefName": "main",
                    "headRefOid": "abc123",
                }
            ),
            stderr="",
        )

    monkeypatch.setattr(real_gateway_helpers.subprocess, "run", fake_run)

    result = RealPRGateway().get_pr_details_for_branch("feature")

    assert not isinstance(result, PRLookupError)
    assert result.number == 48
    assert result.head_ref_name == "feature"
    assert result.base_ref_name == "main"
    assert result.head_ref_oid == "abc123"
    assert seen == [
        [
            "gh",
            "pr",
            "view",
            "feature",
            "--json",
            "number,headRefName,baseRefName,headRefOid",
        ]
    ]


def test_real_pr_gateway_merge_pr_builds_expected_command(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen: list[list[str]] = []

    def fake_run(
        cmd: list[str],
        **kwargs: object,
    ) -> subprocess.CompletedProcess[str]:
        seen.append(cmd)
        return subprocess.CompletedProcess(
            cmd,
            0,
            stdout="enabled auto-merge\n",
            stderr="",
        )

    monkeypatch.setattr(real_gateway_helpers.subprocess, "run", fake_run)

    result = RealPRGateway().merge_pr(
        48,
        match_head_commit="abc123",
        admin=True,
        auto=True,
    )

    assert not isinstance(result, PRCommandError)
    assert result.number == 48
    assert result.auto is True
    assert result.stdout == "enabled auto-merge"
    assert seen == [
        [
            "gh",
            "pr",
            "merge",
            "48",
            "-s",
            "--match-head-commit",
            "abc123",
            "--admin",
            "--auto",
        ]
    ]


def test_real_pr_gateway_merge_pr_returns_command_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        real_gateway_helpers.subprocess,
        "run",
        lambda cmd, **kwargs: subprocess.CompletedProcess(
            cmd,
            1,
            stdout="",
            stderr="head commit changed\n",
        ),
    )

    result = RealPRGateway().merge_pr(
        48,
        match_head_commit="abc123",
        admin=False,
        auto=False,
    )

    assert isinstance(result, PRCommandError)
    assert result.returncode == 1
    assert result.stderr == "head commit changed"


def test_real_pr_gateway_merge_pr_handles_missing_gh(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        raise FileNotFoundError("gh: not found")

    monkeypatch.setattr(real_gateway_helpers.subprocess, "run", fake_run)

    result = RealPRGateway().merge_pr(
        48,
        match_head_commit="abc123",
        admin=False,
        auto=False,
    )

    assert isinstance(result, PRCommandError)
    assert result.returncode == 127
    assert "gh: not found" in result.stderr
