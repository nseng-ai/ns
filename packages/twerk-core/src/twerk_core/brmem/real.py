"""Real git-ref-backed branch memory gateway."""

from __future__ import annotations

import os
import subprocess
import tempfile
from pathlib import Path

from twerk_core.brmem.gateway import (
    BranchDiagnostic,
    BranchMemoryGateway,
    InvalidBranchNameError,
    PathDiagnostic,
    _PathList,
    ref_name_for_branch,
    validate_memory_path,
)


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


class RealBranchMemoryGateway(BranchMemoryGateway):
    """Store branch memory in ``refs/brmem/brs/<encoded-branch>`` refs."""

    def __init__(self, cwd: Path) -> None:
        self._cwd = cwd

    def put(self, branch: str, path: str, content: str) -> str:
        ref_name = self._validated_ref_name(branch)
        validate_memory_path(path)

        parent_result = _run(["git", "rev-parse", "--verify", ref_name], cwd=self._cwd, check=False)
        parent_sha = parent_result.stdout.strip() if parent_result.returncode == 0 else None

        tmp_fd, tmp_index = tempfile.mkstemp(suffix=".idx", prefix="twerk-brmem-")
        os.close(tmp_fd)
        try:
            Path(tmp_index).unlink(missing_ok=True)
            env = os.environ.copy()
            env["GIT_INDEX_FILE"] = tmp_index

            if parent_sha is not None:
                _run(["git", "read-tree", parent_sha], cwd=self._cwd, env=env)

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
            commit_cmd = ["git", "commit-tree", tree_sha, "-m", f"brmem put {path}"]
            if parent_sha is not None:
                commit_cmd[2:2] = ["-p", parent_sha]
            commit_sha = _run(commit_cmd, cwd=self._cwd).stdout.strip()
            _run(["git", "update-ref", ref_name, commit_sha], cwd=self._cwd)
            return commit_sha
        finally:
            Path(tmp_index).unlink(missing_ok=True)

    def get(self, branch: str, path: str, *, at: str | None = None) -> str | None:
        self._validated_ref_name(branch)
        validate_memory_path(path)

        target = at if at is not None else ref_name_for_branch(branch)
        result = _run(["git", "show", f"{target}:{path}"], cwd=self._cwd, check=False)
        if result.returncode != 0:
            return None
        return result.stdout

    def list(self, branch: str, *, at: str | None = None) -> _PathList:
        self._validated_ref_name(branch)
        target = at if at is not None else ref_name_for_branch(branch)
        result = _run(
            ["git", "ls-tree", "-r", "--name-only", target],
            cwd=self._cwd,
            check=False,
        )
        if result.returncode != 0:
            return []
        return sorted(line for line in result.stdout.splitlines() if line)

    def check_path(self, branch: str, path: str, *, at: str | None = None) -> PathDiagnostic | None:
        self._validated_ref_name(branch)
        validate_memory_path(path)

        target = at if at is not None else ref_name_for_branch(branch)
        existence = _run(
            ["git", "cat-file", "-e", f"{target}:{path}"],
            cwd=self._cwd,
            check=False,
        )
        if existence.returncode != 0:
            return None

        blob_sha = _run(
            ["git", "rev-parse", f"{target}:{path}"],
            cwd=self._cwd,
        ).stdout.strip()
        size_bytes = int(
            _run(
                ["git", "cat-file", "-s", f"{target}:{path}"],
                cwd=self._cwd,
            ).stdout.strip()
        )
        log = _run(
            ["git", "log", "-1", "--format=%H%x09%cI", target, "--", path],
            cwd=self._cwd,
            check=False,
        )
        last_sha, _, last_date = log.stdout.strip().partition("\t")
        return PathDiagnostic(
            blob_sha=blob_sha,
            size_bytes=size_bytes,
            last_commit_sha=last_sha,
            last_commit_date=last_date,
        )

    def check_branch(self, branch: str) -> BranchDiagnostic | None:
        ref_name = self._validated_ref_name(branch)
        existence = _run(
            ["git", "show-ref", "--verify", "--quiet", ref_name],
            cwd=self._cwd,
            check=False,
        )
        if existence.returncode != 0:
            return None

        log = _run(
            ["git", "log", "-1", "--format=%H%x09%cI", ref_name],
            cwd=self._cwd,
        )
        head_sha, _, head_date = log.stdout.strip().partition("\t")
        tree = _run(
            ["git", "ls-tree", "-r", "--name-only", ref_name],
            cwd=self._cwd,
        )
        path_count = sum(1 for line in tree.stdout.splitlines() if line)
        return BranchDiagnostic(
            head_sha=head_sha,
            head_date=head_date,
            path_count=path_count,
        )

    def _validated_ref_name(self, branch: str) -> str:
        ref_name = ref_name_for_branch(branch)
        validation = _run(
            ["git", "check-ref-format", "--branch", branch],
            cwd=self._cwd,
            check=False,
        )
        if validation.returncode != 0:
            details = (
                validation.stderr.strip() or validation.stdout.strip() or "invalid git branch name"
            )
            raise InvalidBranchNameError(branch, details)
        return ref_name
