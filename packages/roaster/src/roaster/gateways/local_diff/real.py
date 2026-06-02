"""Real local-diff gateway backed by `git diff`."""

from __future__ import annotations

from pathlib import Path

from asdl_core.git.real_git_gateway import resolve_trunk_branch
from roaster.gateways.local_diff.gateway import LocalDiffGateway
from roaster.git_toplevel import git_toplevel, run_git
from roaster.models import BaseRefUnavailable, GitDiffFailedError, LocalDiff

_VENDORED_SKILL_PYTHON_PATH_PREFIXES = (".agents/skills", ".claude/skills")


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
            _git_diff_command(
                base_ref=resolved_base_ref,
                repo_root=repo_root,
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


def _git_diff_command(*, base_ref: str, repo_root: Path) -> list[str]:
    cmd = ["git", "diff", "--no-ext-diff", f"origin/{base_ref}...HEAD"]
    pathspecs = _vendored_skill_python_exclude_pathspecs(repo_root)
    if pathspecs:
        cmd.extend(["--", ".", *pathspecs])
    return cmd


def _vendored_skill_python_exclude_pathspecs(repo_root: Path) -> tuple[str, ...]:
    skill_names = _vendored_skill_names(repo_root)
    return tuple(
        f":(exclude,glob){prefix}/{skill_name}/**/*.py"
        for skill_name in skill_names
        for prefix in _VENDORED_SKILL_PYTHON_PATH_PREFIXES
    )


def _vendored_skill_names(repo_root: Path) -> tuple[str, ...]:
    skill_names = set(_real_skill_directory_names(repo_root / ".agents" / "skills"))
    skill_names.update(_real_skill_directory_names(repo_root / ".claude" / "skills"))
    return tuple(sorted(skill_names))


def _real_skill_directory_names(skills_dir: Path) -> tuple[str, ...]:
    if not skills_dir.exists() or not skills_dir.is_dir():
        return ()

    return tuple(
        entry.name for entry in skills_dir.iterdir() if not entry.is_symlink() and entry.is_dir()
    )
