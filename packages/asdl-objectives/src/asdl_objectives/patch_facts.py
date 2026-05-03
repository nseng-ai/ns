"""Shared patch-id fact gathering for objective commands."""

from __future__ import annotations

from dataclasses import dataclass

from asdl_core.git.git_gateway import GitGateway
from asdl_core.git.types import CommitSummary, GitCommandFailure


@dataclass(frozen=True)
class BranchPatchFacts:
    """Commit log plus optional patch-id lookup for one git range."""

    commits: tuple[CommitSummary, ...]
    pid_by_sha: dict[str, str | None] | None

    @property
    def commit_patch_ids(self) -> tuple[str | None, ...] | None:
        """Return patch IDs aligned to ``commits``, or ``None`` if unavailable."""
        if self.pid_by_sha is None:
            if not self.commits:
                return ()
            return None
        return tuple(self.pid_by_sha.get(commit.sha) for commit in self.commits)


def load_branch_patch_facts(
    git: GitGateway,
    range_spec: str,
    *,
    require_patch_ids: bool,
) -> BranchPatchFacts | GitCommandFailure:
    """Load newest-first commits and patch IDs for ``range_spec``.

    ``git log`` failures are always fatal because callers cannot enumerate
    branch work without commits. ``git patch-id`` failures are fatal only when
    ``require_patch_ids`` is set; otherwise callers receive commits with a
    ``None`` patch-id lookup and can conservatively classify freshness.
    """
    commits = git.log_range(range_spec)
    if isinstance(commits, GitCommandFailure):
        return commits

    patch_ids = git.patch_ids_for_range(range_spec)
    if isinstance(patch_ids, GitCommandFailure):
        if require_patch_ids:
            return patch_ids
        return BranchPatchFacts(commits=commits, pid_by_sha=None)

    return BranchPatchFacts(commits=commits, pid_by_sha=dict(patch_ids))
