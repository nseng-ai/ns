"""Tests for RealPRGateway."""

from __future__ import annotations

import json
import subprocess

import pytest

from twerk_core.gh import real_pr_gateway
from twerk_core.gh.real_pr_gateway import RealPRGateway
from twerk_core.gh.types import PRLookupError


def test_find_prs_for_branch_parses_multiple_prs(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = json.dumps(
        [
            {
                "number": 47,
                "title": "Port pr-address skill",
                "url": "https://github.com/dagster-io/twerk/pull/47",
                "headRefName": "feature/x",
                "headRefOid": "abc123",
                "baseRefName": "main",
                "state": "OPEN",
                "updatedAt": "2026-04-10T12:00:00Z",
            },
            {
                "number": 12,
                "title": "Old branch reuse",
                "url": "https://github.com/dagster-io/twerk/pull/12",
                "headRefName": "feature/x",
                "headRefOid": "def456",
                "baseRefName": "main",
                "state": "MERGED",
                "updatedAt": "2026-04-01T12:00:00Z",
            },
        ]
    )

    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        assert cmd == [
            "gh",
            "pr",
            "list",
            "--head",
            "feature/x",
            "--state",
            "all",
            "--json",
            "number,title,url,headRefName,headRefOid,baseRefName,state,updatedAt",
            "--limit",
            "1000",
        ]
        return subprocess.CompletedProcess(cmd, 0, stdout=payload, stderr="")

    monkeypatch.setattr(real_pr_gateway.subprocess, "run", fake_run)

    result = RealPRGateway().find_prs_for_branch("feature/x", state="all")

    assert isinstance(result, tuple)
    assert tuple(pr.number for pr in result) == (47, 12)
    assert result[0].head_ref_oid == "abc123"
    assert result[0].state == "OPEN"
    assert result[1].state == "MERGED"


def test_find_prs_for_branch_returns_empty_tuple(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        return subprocess.CompletedProcess(cmd, 0, stdout="[]", stderr="")

    monkeypatch.setattr(real_pr_gateway.subprocess, "run", fake_run)

    assert RealPRGateway().find_prs_for_branch("feature/x", state="all") == ()


def test_find_prs_for_branch_returns_lookup_error_on_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        return subprocess.CompletedProcess(cmd, 1, stdout="", stderr="gh auth failed")

    monkeypatch.setattr(real_pr_gateway.subprocess, "run", fake_run)

    result = RealPRGateway().find_prs_for_branch("feature/x", state="all")

    assert isinstance(result, PRLookupError)
    assert result.returncode == 1
    assert result.stderr == "gh auth failed"
