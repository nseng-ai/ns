"""Subprocess-backed helpers shared across the real gh gateways.

The real ``PRGateway`` and ``IssueGateway`` implementations both need to
resolve a PR from a branch name via ``gh pr view``. Keeping that helper in
its own module (rather than inside either gateway) makes its role
explicit: it's production plumbing shared by the ``Real*Gateway`` classes,
not part of either gateway's public surface.
"""

from __future__ import annotations

import json
import subprocess

from twerk_core.gh.types import (
    PRCommandError,
    PRDetails,
    PRLookupError,
    PRMergeResult,
    PRState,
    PRStateFilter,
    PRSummary,
)


def _run_gh(args: list[str]) -> subprocess.CompletedProcess[str]:
    cmd = ["gh", *args]
    try:
        return subprocess.run(
            cmd,
            capture_output=True,
            text=True,
        )
    except FileNotFoundError as exc:
        return subprocess.CompletedProcess(
            cmd,
            127,
            stdout="",
            stderr=str(exc),
        )


def fetch_pr_summary_for_branch(branch: str) -> PRSummary | PRLookupError:
    """Shell out to ``gh pr view <branch>`` and return a ``PRSummary``."""
    result = _run_gh(
        [
            "pr",
            "view",
            branch,
            "--json",
            "number,title,url,headRefName,baseRefName,state",
        ],
    )
    if result.returncode != 0:
        return PRLookupError(
            stderr=result.stderr.strip(),
            returncode=result.returncode,
        )
    data = json.loads(result.stdout)
    state: PRState = data["state"]
    return PRSummary(
        number=data["number"],
        title=data["title"],
        url=data["url"],
        head_ref_name=data["headRefName"],
        base_ref_name=data["baseRefName"],
        state=state,
    )


def fetch_pr_details_for_branch(branch: str) -> PRDetails | PRLookupError:
    """Shell out to ``gh pr view <branch>`` and return guarded-merge metadata."""
    result = _run_gh(
        [
            "pr",
            "view",
            branch,
            "--json",
            "number,headRefName,baseRefName,headRefOid",
        ],
    )
    if result.returncode != 0:
        return PRLookupError(
            stderr=result.stderr.strip(),
            returncode=result.returncode,
        )
    data = json.loads(result.stdout)
    return PRDetails(
        number=data["number"],
        head_ref_name=data["headRefName"],
        base_ref_name=data["baseRefName"],
        head_ref_oid=data["headRefOid"],
    )


def search_prs(query: str, *, state: PRStateFilter) -> tuple[PRSummary, ...] | PRLookupError:
    """Shell out to ``gh pr list --state <state> --search <query>``."""
    result = _run_gh(
        [
            "pr",
            "list",
            "--state",
            state,
            "--search",
            query,
            "--json",
            "number,title,url,headRefName,baseRefName,state",
        ],
    )
    if result.returncode != 0:
        return PRLookupError(
            stderr=result.stderr.strip(),
            returncode=result.returncode,
        )
    items = json.loads(result.stdout)
    summaries: list[PRSummary] = []
    for item in items:
        state: PRState = item["state"]
        summaries.append(
            PRSummary(
                number=item["number"],
                title=item["title"],
                url=item["url"],
                head_ref_name=item["headRefName"],
                base_ref_name=item["baseRefName"],
                state=state,
            )
        )
    return tuple(summaries)


def merge_pr(
    pr_number: int,
    *,
    match_head_commit: str,
    admin: bool,
    auto: bool,
) -> PRMergeResult | PRCommandError:
    """Shell out to ``gh pr merge`` using squash merge and a head-commit guard."""
    args = [
        "pr",
        "merge",
        str(pr_number),
        "-s",
        "--match-head-commit",
        match_head_commit,
    ]
    if admin:
        args.append("--admin")
    if auto:
        args.append("--auto")
    result = _run_gh(args)
    if result.returncode != 0:
        return PRCommandError(
            stderr=result.stderr.strip(),
            returncode=result.returncode,
        )
    return PRMergeResult(
        number=pr_number,
        auto=auto,
        stdout=result.stdout.strip(),
        stderr=result.stderr.strip(),
    )
