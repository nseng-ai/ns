"""Real git-backed working memory gateway."""

from __future__ import annotations

import os
import subprocess
import tempfile
from pathlib import Path

from twerk_core.working_memory.gateway import WorkingMemoryGateway


def _run(
    cmd: list[str],
    *,
    cwd: Path,
    check: bool = True,
    env: dict[str, str] | None = None,
    input: str | None = None,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        cmd,
        cwd=cwd,
        capture_output=True,
        text=True,
        check=check,
        env=env,
        input=input,
    )


class RealWorkingMemoryGateway(WorkingMemoryGateway):
    """Working memory stored in ``refs/working-memory/branches/*`` refs."""

    def __init__(self, cwd: Path) -> None:
        self._cwd = cwd

    def write(self, branch: str, files: dict[str, str]) -> None:
        ref = self._ref_for_branch(branch)
        parent_result = _run(["git", "rev-parse", "--verify", ref], cwd=self._cwd, check=False)
        parent_sha = parent_result.stdout.strip() if parent_result.returncode == 0 else None

        tmp_fd, tmp_index = tempfile.mkstemp(suffix=".idx", prefix="twerk-wm-")
        os.close(tmp_fd)
        try:
            Path(tmp_index).unlink(missing_ok=True)
            env = os.environ.copy()
            env["GIT_INDEX_FILE"] = tmp_index

            if parent_sha is not None:
                _run(["git", "read-tree", parent_sha], cwd=self._cwd, env=env)

            for path, content in files.items():
                blob_sha = _run(
                    ["git", "hash-object", "-w", "--stdin"],
                    cwd=self._cwd,
                    input=content,
                ).stdout.strip()
                cacheinfo = f"100644,{blob_sha},{path}"
                _run(
                    ["git", "update-index", "--add", "--cacheinfo", cacheinfo],
                    cwd=self._cwd,
                    env=env,
                )

            tree_sha = _run(["git", "write-tree"], cwd=self._cwd, env=env).stdout.strip()
            commit_cmd = ["git", "commit-tree", tree_sha]
            if parent_sha is not None:
                commit_cmd.extend(["-p", parent_sha])
                commit_cmd.extend(["-m", "working memory update"])
            else:
                commit_cmd.extend(["-m", "working memory init"])
            commit_sha = _run(commit_cmd, cwd=self._cwd).stdout.strip()
            _run(["git", "update-ref", ref, commit_sha], cwd=self._cwd)
        finally:
            Path(tmp_index).unlink(missing_ok=True)

    def read(self, branch: str, path: str) -> str | None:
        ref = self._ref_for_branch(branch)
        result = _run(["git", "show", f"{ref}:{path}"], cwd=self._cwd, check=False)
        if result.returncode != 0:
            return None
        return result.stdout

    def exists(self, branch: str) -> bool:
        ref = self._ref_for_branch(branch)
        result = _run(["git", "rev-parse", "--verify", ref], cwd=self._cwd, check=False)
        return result.returncode == 0

    @staticmethod
    def _ref_for_branch(branch: str) -> str:
        return f"refs/working-memory/branches/{branch}"
