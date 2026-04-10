"""Top-level GitHub facade composing sub-gateways."""

from dataclasses import dataclass

from twerk_core.gh.issue_gateway import GhIssueGateway
from twerk_core.gh.pr_gateway import PRGateway


@dataclass(frozen=True)
class GH:
    """Facade for GitHub operations, organized like the gh CLI.

    Usage:
        gh = GH(pr=some_pr_gateway, issue=some_issue_gateway)
        threads = gh.pr.get_review_threads(42)
        issues = gh.issue.list(label="twerk-objective")
    """

    pr: PRGateway
    issue: GhIssueGateway
