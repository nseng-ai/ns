"""Abstract base class for GitHub check-runs API operations.

Check runs are a per-commit surface distinct from PR-scoped review threads
and discussion comments. They carry line-anchored annotations that render
in the "Files changed" view of a PR without creating review threads,
making them suitable as the primary output surface for line-local machine
feedback from tools like twerk-reviewer.

This gateway is separate from ``IssueGateway`` for two reasons:

1. **Scope**: check runs are commit-scoped, not PR-scoped. Callers that
   hold a PR number have to resolve a head SHA before they can use this
   gateway.
2. **Auth**: the Checks API requires ``checks: write`` token scope, which
   the default ``IssueGateway`` consumers do not need or request.

The same narrow-gateway argument that justifies ``PRGateway`` vs.
``IssueGateway`` applies here.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Sequence
from typing import Literal

from twerk_core.gh.types import CheckRun, CheckRunAnnotation, CheckRunOutput


class CheckRunsGateway(ABC):
    """Gateway for GitHub check-runs API operations.

    The gateway is deliberately narrow: callers can find an existing check
    run by (head_sha, name), upsert one with its annotations, and read
    annotations back. Pagination of GitHub's 50-annotation-per-request
    limit is hidden behind :meth:`upsert_check_run`; callers pass the full
    annotation list and get back a single :class:`CheckRun` regardless of
    how many REST calls were required under the hood.
    """

    @abstractmethod
    def find_check_run(self, head_sha: str, name: str) -> CheckRun | None:
        """Look up an existing check run on ``head_sha`` with exact name ``name``.

        Returns ``None`` if no matching check run exists. Used by callers
        to decide whether a publish operation should create (POST) or
        update (PATCH) — though :meth:`upsert_check_run` encapsulates that
        decision on its own and most callers won't need this directly.
        """

    @abstractmethod
    def list_check_runs(
        self,
        head_sha: str,
        *,
        name_prefix: str | None = None,
    ) -> tuple[CheckRun, ...]:
        """Return all check runs attached to ``head_sha``.

        When ``name_prefix`` is supplied, only check runs whose ``name``
        starts with the prefix are returned. Used by consumers
        (e.g. ``twerk-pr-address``) that want to ingest all reviewer check
        runs on a given commit without knowing the set of review keys up
        front — e.g. ``name_prefix="twerk-reviewer/"``.
        """

    @abstractmethod
    def upsert_check_run(
        self,
        *,
        head_sha: str,
        name: str,
        output: CheckRunOutput,
        annotations: Sequence[CheckRunAnnotation],
        conclusion: Literal["neutral"] = "neutral",
    ) -> CheckRun:
        """Create or replace a check run keyed by ``(head_sha, name)``.

        If a check run with this ``(head_sha, name)`` already exists, its
        output and annotations are replaced; otherwise a new check run is
        created. GitHub's Checks API caps each request at 50 annotations —
        when ``annotations`` exceeds that, the implementation is
        responsible for chunking the remainder across follow-up PATCH
        calls.

        ``conclusion`` is typed to the single value ``"neutral"`` for now
        because the reviewer surface is informational by design; widening
        later is a breaking change callers can opt into.
        """

    @abstractmethod
    def list_annotations(self, check_run_id: int) -> tuple[CheckRunAnnotation, ...]:
        """Return the annotations currently attached to a check run.

        Used by downstream consumers (e.g. ``twerk-pr-address``) to read
        machine feedback back out of GitHub without going through the
        reviewer's publish path.
        """
