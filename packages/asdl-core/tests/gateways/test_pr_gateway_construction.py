"""Tests for PR gateway production construction helpers."""

from __future__ import annotations

import pytest

from asdl_core.gh.construction import build_pr_gateway
from asdl_core.gh.pr_gateway import PRGateway, RealPRGateway
from asdl_core.gh.types import PRGatewayFailure, PRLookupMiss, PRSummary


def test_build_pr_gateway_returns_real_pr_gateway() -> None:
    gateway = build_pr_gateway()

    assert isinstance(gateway, PRGateway)
    assert isinstance(gateway, RealPRGateway)


def test_build_pr_gateway_forwards_explicit_repo(monkeypatch: pytest.MonkeyPatch) -> None:
    seen_repos: list[str | None] = []

    def fake_fetch_pr_summary_for_number(
        pr_number: int, *, repo: str | None = None
    ) -> PRSummary | PRLookupMiss | PRGatewayFailure:
        seen_repos.append(repo)
        return PRSummary(
            number=pr_number,
            title="Port pr-address skill",
            url="https://github.com/octo/demo/pull/47",
            head_ref_name="feature",
            base_ref_name="master",
            state="OPEN",
        )

    monkeypatch.setattr(
        "asdl_core.gh.pr_gateway.fetch_pr_summary_for_number",
        fake_fetch_pr_summary_for_number,
    )

    gateway = build_pr_gateway(repo="octo/demo")
    result = gateway.get_pr(47)

    assert isinstance(result, PRSummary)
    assert result.number == 47
    assert seen_repos == ["octo/demo"]


def test_build_pr_gateway_preserves_implicit_repo_context(monkeypatch: pytest.MonkeyPatch) -> None:
    seen_repos: list[str | None] = []

    def fake_fetch_pr_summary_for_number(
        pr_number: int, *, repo: str | None = None
    ) -> PRSummary | PRLookupMiss | PRGatewayFailure:
        seen_repos.append(repo)
        return PRSummary(
            number=pr_number,
            title="Port pr-address skill",
            url="https://github.com/dagster-io/asdl/pull/47",
            head_ref_name="feature",
            base_ref_name="master",
            state="OPEN",
        )

    monkeypatch.setattr(
        "asdl_core.gh.pr_gateway.fetch_pr_summary_for_number",
        fake_fetch_pr_summary_for_number,
    )

    gateway = build_pr_gateway()
    result = gateway.get_pr(47)

    assert isinstance(result, PRSummary)
    assert result.number == 47
    assert seen_repos == [None]
