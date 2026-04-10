"""Top-level GitHub facade composing sub-gateways."""

from dataclasses import dataclass

from twerk_core.gh.pr_gateway import PRGateway


@dataclass(frozen=True)
class GH:
    """Facade for GitHub operations, organized like the gh CLI.

    Usage:
        gh = GH(pr=some_pr_gateway)
        threads = gh.pr.get_review_threads(42)

    Extensible: future sub-gateways (issues, repos) are added as fields.
    """

    pr: PRGateway
