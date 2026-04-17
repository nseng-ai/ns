"""Real local-diff gateway backed by git subprocess calls."""

from __future__ import annotations

import subprocess
from pathlib import Path

from twerk_core.git.real_git_gateway import resolve_trunk_branch
from twerk_reviewer.gateways.local_diff.gateway import LocalDiffGateway
from twerk_reviewer.models import LocalDiff, ReviewerFailure


class RealLocalDiffGateway(LocalDiffGateway):
    """Load the current branch diff from the local git repository."""

    def __init__(self, *, cwd: Path) -> None:
        self._cwd = cwd

    def load_diff(self, *, base_ref: str | None) -> LocalDiff | ReviewerFailure:
        repo_root_result = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            cwd=self._cwd,
            capture_output=True,
            text=True,
            check=False,
        )
        if repo_root_result.returncode != 0:
            stderr = repo_root_result.stderr.strip()
            return ReviewerFailure(
                error_type="repo_root_unavailable",
                message=stderr or "Unable to resolve the current git repository root.",
            )

        repo_root = Path(repo_root_result.stdout.strip())
        resolved_base_ref = base_ref.strip() if base_ref is not None else ""
        if not resolved_base_ref:
            resolved_base_ref = resolve_trunk_branch(repo_root) or ""
        if not resolved_base_ref:
            return ReviewerFailure(
                error_type="base_ref_unavailable",
                message="Unable to resolve a base branch. Pass --base-ref explicitly.",
            )

        diff_result = subprocess.run(
            ["git", "diff", "--no-ext-diff", f"origin/{resolved_base_ref}...HEAD"],
            cwd=repo_root,
            capture_output=True,
            text=True,
            check=False,
        )
        if diff_result.returncode != 0:
            stderr = diff_result.stderr.strip()
            return ReviewerFailure(
                error_type="git_diff_failed",
                message=(
                    stderr or f"Unable to load the local diff against origin/{resolved_base_ref}."
                ),
            )

        return LocalDiff(
            base_ref=resolved_base_ref,
            diff_text=diff_result.stdout,
        )
