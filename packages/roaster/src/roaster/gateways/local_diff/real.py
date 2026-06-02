"""Real local-diff gateway backed by `git diff`."""

from __future__ import annotations

from pathlib import Path

from asdl_core.git.real_git_gateway import resolve_trunk_branch
from asdl_core.project_config import load_asdl_project_config
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

        config = load_asdl_project_config(repo_root)
        diff_result = run_git(
            _git_diff_command(
                base_ref=resolved_base_ref,
                exclude_globs=config.roaster.diff.exclude,
            ),
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


def _git_diff_command(*, base_ref: str, exclude_globs: tuple[str, ...]) -> list[str]:
    cmd = ["git", "diff", "--no-ext-diff", f"origin/{base_ref}...HEAD"]
    if exclude_globs:
        exclude_pathspecs = tuple(f":(exclude,glob){pattern}" for pattern in exclude_globs)
        cmd.extend(["--", ".", *exclude_pathspecs])
    return cmd
