"""Real local-diff gateway backed by `git diff`."""

from __future__ import annotations

from pathlib import Path

from asdl_core.git.real_git_gateway import resolve_trunk_branch
from roaster.gateways.local_diff.gateway import LocalDiffGateway
from roaster.git_toplevel import git_toplevel, run_git
from roaster.models import BaseRefUnavailable, GitDiffFailedError, LocalDiff


class RealLocalDiffGateway(LocalDiffGateway):
    """Load the local diff against the configured base ref."""

    def __init__(self, cwd: Path) -> None:
        self._cwd = cwd

    def load_diff(self, *, base_ref: str | None) -> LocalDiff | BaseRefUnavailable:
        repo_root = self._repo_root()
        resolved_base_ref = base_ref.strip() if base_ref is not None else ""
        if not resolved_base_ref:
            resolved_base_ref = resolve_trunk_branch(repo_root) or ""
        if not resolved_base_ref:
            return BaseRefUnavailable(
                message="Unable to resolve a base branch. Pass --base-ref explicitly.",
            )

        diff_result = run_git(
            ["git", "diff", "--no-ext-diff", f"origin/{resolved_base_ref}...HEAD"],
            cwd=repo_root,
        )
        if diff_result.returncode != 0:
            stderr = diff_result.stderr.strip()
            raise GitDiffFailedError(
                stderr or f"Unable to load the local diff against origin/{resolved_base_ref}."
            )

        return LocalDiff(
            base_ref=resolved_base_ref,
            diff_text=diff_result.stdout,
        )

    def _repo_root(self) -> Path:
        return git_toplevel(cwd=self._cwd)
