"""Real git-ref-backed branch memory gateway."""

from __future__ import annotations

import os
import subprocess
import tempfile
from pathlib import Path

from twerk_core.brmem.gateway import (
    ArtifactDiagnostic,
    BranchMemoryGateway,
    EntryDiagnostic,
    EntryRef,
    InvalidBranchNameError,
    parse_entry_ref,
    ref_name_for_entry,
    validate_artifact_path,
    validate_branch_name,
    validate_key,
    validate_namespace,
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
    """Store branch memory in ``refs/brmem/<namespace>/<key>/<encoded-branch>``."""

    def __init__(self, cwd: Path) -> None:
        self._cwd = cwd

    # -- entry-level --------------------------------------------------------

    def list_entries(
        self,
        *,
        namespace: str | None = None,
        key: str | None = None,
        branch: str | None = None,
    ) -> list[EntryRef]:
        if namespace is not None:
            validate_namespace(namespace)
        if key is not None:
            validate_key(key)
        if branch is not None:
            validate_branch_name(branch)

        result = _run(
            ["git", "for-each-ref", "--format=%(refname)", "refs/brmem/"],
            cwd=self._cwd,
            check=False,
        )
        if result.returncode != 0:
            return []

        entries: list[EntryRef] = []
        for line in result.stdout.splitlines():
            ref_name = line.strip()
            if not ref_name:
                continue
            entry = parse_entry_ref(ref_name)
            if entry is None:
                continue
            if namespace is not None and entry.namespace != namespace:
                continue
            if key is not None and entry.key != key:
                continue
            if branch is not None and entry.branch != branch:
                continue
            entries.append(entry)

        entries.sort(key=lambda e: (e.namespace, e.key, e.branch))
        return entries

    def check_entry(
        self,
        namespace: str,
        key: str,
        branch: str,
    ) -> EntryDiagnostic | None:
        ref_name = self._validated_ref_name(namespace, key, branch)
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
        artifact_count = sum(1 for line in tree.stdout.splitlines() if line)
        return EntryDiagnostic(
            head_sha=head_sha,
            head_date=head_date,
            artifact_count=artifact_count,
        )

    # -- artifact-level -----------------------------------------------------

    def put_artifact(
        self,
        namespace: str,
        key: str,
        branch: str,
        path: str,
        content: str,
    ) -> str:
        ref_name = self._validated_ref_name(namespace, key, branch)
        validate_artifact_path(path)

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

    def get_artifact(
        self,
        namespace: str,
        key: str,
        branch: str,
        path: str,
        *,
        at: str | None = None,
    ) -> str | None:
        ref_name = self._validated_ref_name(namespace, key, branch)
        validate_artifact_path(path)

        target = at if at is not None else ref_name
        result = _run(["git", "show", f"{target}:{path}"], cwd=self._cwd, check=False)
        if result.returncode != 0:
            return None
        return result.stdout

    def list_artifacts(
        self,
        namespace: str,
        key: str,
        branch: str,
        *,
        at: str | None = None,
    ) -> list[str]:
        ref_name = self._validated_ref_name(namespace, key, branch)
        target = at if at is not None else ref_name
        result = _run(
            ["git", "ls-tree", "-r", "--name-only", target],
            cwd=self._cwd,
            check=False,
        )
        if result.returncode != 0:
            return []
        return sorted(line for line in result.stdout.splitlines() if line)

    def check_artifact(
        self,
        namespace: str,
        key: str,
        branch: str,
        path: str,
        *,
        at: str | None = None,
    ) -> ArtifactDiagnostic | None:
        ref_name = self._validated_ref_name(namespace, key, branch)
        validate_artifact_path(path)

        target = at if at is not None else ref_name
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
        return ArtifactDiagnostic(
            blob_sha=blob_sha,
            size_bytes=size_bytes,
            last_commit_sha=last_sha,
            last_commit_date=last_date,
        )

    # -- internals ----------------------------------------------------------

    def _validated_ref_name(self, namespace: str, key: str, branch: str) -> str:
        ref_name = ref_name_for_entry(namespace, key, branch)
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
