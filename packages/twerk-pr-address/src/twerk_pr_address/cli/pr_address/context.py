"""Build the typed pr-address CLI context."""

from __future__ import annotations

from dataclasses import dataclass

from twerk_core.gh.check_runs_gateway import CheckRunsGateway
from twerk_core.gh.issue_gateway import IssueGateway
from twerk_core.gh.real_check_runs_gateway import RealCheckRunsGateway
from twerk_core.gh.real_issue_gateway import RealIssueGateway
from twerk_core.git.git_gateway import GitGateway
from twerk_core.git.real_git_gateway import RealGitGateway


@dataclass(frozen=True)
class PrAddressCliContext:
    """Typed context for the ``pr-address`` CLI."""

    gh_issue_gateway: IssueGateway
    git_gateway: GitGateway
    check_runs: CheckRunsGateway


def build_pr_address_context() -> PrAddressCliContext:
    """Assemble a :class:`PrAddressCliContext` from real gateways."""
    return PrAddressCliContext(
        gh_issue_gateway=RealIssueGateway(),
        git_gateway=RealGitGateway(),
        check_runs=RealCheckRunsGateway(),
    )
