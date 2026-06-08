"""Production construction helpers for shared PR gateways."""

from __future__ import annotations

from asdl_core.gh.pr_gateway import PRGateway, RealPRGateway


def build_pr_gateway(*, repo: str | None = None) -> PRGateway:
    """Construct the production PR gateway for GitHub pull-request workflows."""
    return RealPRGateway(repo=repo)
