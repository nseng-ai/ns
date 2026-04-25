"""Tests for RealPRGateway and the shared fetch_pr_summary_for_branch helper."""

from __future__ import annotations

import json
import subprocess

import pytest

from twerk_core.gh import real_gateway_helpers
from twerk_core.gh.pr_gateway import RealPRGateway
from twerk_core.gh.types import PRLookupError


def _make_fake_run(
    *,
    response: dict[str, object] | None = None,
    returncode: int = 0,
    stderr: str = "",
    captured_cmds: list[list[str]] | None = None,
) -> object:
    payload = json.dumps(response) if response is not None else ""

    def fake_run(
        cmd: list[str],
        **kwargs: object,
    ) -> subprocess.CompletedProcess[str]:
        assert cmd[:3] == ["gh", "pr", "view"]
        if captured_cmds is not None:
            captured_cmds.append(list(cmd))
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
                "url": "https://github.com/dagster-io/twerk/pull/47",
                "headRefName": "feature",
                "baseRefName": "master",
                "state": state,
                "mergedAt": "2026-04-01T12:00:00Z" if state == "MERGED" else "",
                "mergeCommitOid": "deadbeef" if state == "MERGED" else "",
            },
        ),
    )

    result = RealPRGateway().get_pr_for_branch("feature")

    assert not isinstance(result, PRLookupError)
    assert result.number == 47
    assert result.state == state
    if state == "MERGED":
        assert result.merged_at == "2026-04-01T12:00:00Z"
        assert result.merge_commit_oid == "deadbeef"
    else:
        # gh returns empty strings for non-merged PRs; the helper coerces to None.
        assert result.merged_at is None
        assert result.merge_commit_oid is None


def test_real_pr_gateway_query_includes_merge_provenance(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: list[list[str]] = []
    monkeypatch.setattr(
        real_gateway_helpers.subprocess,
        "run",
        _make_fake_run(
            response={
                "number": 1,
                "title": "t",
                "url": "u",
                "headRefName": "h",
                "baseRefName": "b",
                "state": "OPEN",
                "mergedAt": "",
                "mergeCommitOid": "",
            },
            captured_cmds=captured,
        ),
    )

    RealPRGateway().get_pr_for_branch("feature")

    assert len(captured) == 1
    assert "--json" in captured[0]
    json_arg = captured[0][captured[0].index("--json") + 1]
    fields = set(json_arg.split(","))
    assert "mergedAt" in fields
    assert "mergeCommitOid" in fields


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
