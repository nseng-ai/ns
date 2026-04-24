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
                "url": "https://github.com/dagster-io/twerk/pull/47",
                "headRefName": "feature",
                "headRefOid": "fakesha",
                "baseRefName": "master",
                "state": state,
            },
        ),
    )

    result = RealPRGateway().get_pr_for_branch("feature")

    assert not isinstance(result, PRLookupError)
    assert result.number == 47
    assert result.state == state


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
