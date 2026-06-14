"""Branch Memory seam owned by the handoff CLI."""

from __future__ import annotations

import json
import os
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol, cast

HANDOFF_NAMESPACE = "handoff"
BASE_NAMESPACE = "base"
BRMEM_REF_PREFIX = "refs/brmem"
BRMEM_BASE_SEGMENT = "base"
BRMEM_NS_SEGMENT = "ns"
_FLAT_SEPARATOR = "---"
_KEY_FORBIDDEN_CHARS = frozenset(" ~^?*[\\")
_KEY_SEGMENT_PATTERN = re.compile(r"[^\x00-\x1f\x7f :?*\[\\~^]+")


@dataclass(frozen=True)
class HandoffEntryRef:
    """Identifies one Branch Memory Entry used by the handoff workflow."""

    namespace: str
    key: str
    branch: str
    entry_locator: str


@dataclass(frozen=True)
class HandoffEntryDiagnostic:
    """Probe data for one Branch Memory Entry."""

    head_sha: str
    head_date: str
    blob_sha: str
    size_bytes: int


class KeyNotFoundError(Exception):
    """Raised when a handoff Branch Memory Entry disappears before deletion."""

    def __init__(self, namespace: str, key: str, branch: str) -> None:
        self.namespace = namespace
        self.key = key
        self.branch = branch
        super().__init__(f"key {key!r} not found in namespace {namespace!r} on branch {branch!r}")


@dataclass(frozen=True)
class BrmemGatewayError(Exception):
    """Stable handoff-local gateway failure."""

    error_type: str
    message: str


class HandoffBrmemGateway(Protocol):
    """Branch Memory operations required by handoff commands."""

    def list_entries(self, *, namespace: str, branch: str | None) -> list[HandoffEntryRef]:
        """List Entries in a namespace for one branch or all branches."""

    def check(self, namespace: str, key: str, branch: str) -> HandoffEntryDiagnostic | None:
        """Return Entry diagnostics, or ``None`` when the Entry is absent."""

    def delete(self, namespace: str, key: str, branch: str) -> str:
        """Delete one Entry and return the new Snapshot commit."""

    def get_entry_updated_at(self, namespace: str, key: str, branch: str) -> str | None:
        """Return the commit date where the current Entry last changed."""


class RealBrmemCliGateway:
    """Handoff adapter over the public ``brmem`` CLI plus read-only git metadata."""

    def __init__(self, cwd: Path) -> None:
        self._cwd = cwd

    def list_entries(self, *, namespace: str, branch: str | None) -> list[HandoffEntryRef]:
        validate_namespace(namespace)
        cmd = ["brmem", "list", "--namespace", namespace, "--format", "json"]
        if branch is None:
            cmd.append("--all-branches")
        else:
            validate_branch_name(branch)
            cmd.extend(["--branch", branch])

        payload = self._run_brmem_json(cmd, absent_returncodes=())
        if payload is None:
            raise BrmemGatewayError("brmem_list_failed", "brmem list returned no JSON output.")
        entries = _data_list(payload, "entries")
        return [_entry_ref_from_json(entry) for entry in entries]

    def check(self, namespace: str, key: str, branch: str) -> HandoffEntryDiagnostic | None:
        validate_namespace(namespace)
        validate_key(key)
        validate_branch_name(branch)
        cmd = [
            "brmem",
            "check",
            key,
            "--namespace",
            namespace,
            "--branch",
            branch,
            "--format",
            "json",
        ]
        payload = self._run_brmem_json(cmd, absent_returncodes=(1,))
        if payload is None:
            return None
        data = _data_dict(payload)
        if data.get("head_sha") is None:
            return None
        return HandoffEntryDiagnostic(
            head_sha=_required_str(data, "head_sha"),
            head_date=_required_str(data, "head_date"),
            blob_sha=_required_str(data, "blob_sha"),
            size_bytes=_required_int(data, "size_bytes"),
        )

    def delete(self, namespace: str, key: str, branch: str) -> str:
        validate_namespace(namespace)
        validate_key(key)
        validate_branch_name(branch)
        cmd = [
            "brmem",
            "delete",
            key,
            "--namespace",
            namespace,
            "--branch",
            branch,
            "--format",
            "json",
        ]
        payload = self._run_brmem_json(cmd, absent_returncodes=(2,))
        if payload is None:
            raise BrmemGatewayError(
                "brmem_delete_failed",
                "brmem delete failed without JSON output.",
            )
        if _json_exit_code(payload) == 2:
            error_type = payload.get("error_type")
            if error_type == "key_not_found":
                raise KeyNotFoundError(namespace, key, branch)
            raise BrmemGatewayError(
                str(error_type or "brmem_delete_failed"),
                _json_message(payload),
            )
        return _required_str(_data_dict(payload), "commit")

    def get_entry_updated_at(self, namespace: str, key: str, branch: str) -> str | None:
        validate_namespace(namespace)
        validate_key(key)
        validate_branch_name(branch)
        snapshot_ref = snapshot_ref_name(namespace, branch)
        existence = _run_git(
            ["git", "cat-file", "-e", f"{snapshot_ref}:{key}"],
            cwd=self._cwd,
            check=False,
        )
        if existence.returncode != 0:
            return None

        result = _run_git(
            ["git", "log", "-1", "--format=%cI", snapshot_ref, "--", key],
            cwd=self._cwd,
            check=False,
        )
        if result.returncode != 0:
            raise BrmemGatewayError(
                "git_failure",
                _command_failure_message("Could not resolve handoff updated timestamp", result),
            )
        updated_at = result.stdout.strip()
        if updated_at == "":
            return None
        return updated_at

    def _run_brmem_json(
        self,
        cmd: list[str],
        *,
        absent_returncodes: tuple[int, ...],
    ) -> dict[str, Any] | None:
        brmem_executable = _find_public_brmem_executable()
        result = subprocess.run(
            [brmem_executable, *cmd[1:]],
            cwd=self._cwd,
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode in absent_returncodes and result.stdout.strip() == "":
            return None
        if result.returncode != 0 and result.stdout.strip() == "":
            raise BrmemGatewayError(
                "brmem_command_failed",
                _command_failure_message("brmem command failed", result),
            )
        payload = _parse_json_output(result.stdout, cmd)
        if result.returncode == 0 or result.returncode in absent_returncodes:
            return payload
        raise BrmemGatewayError(
            str(payload.get("error_type") or "brmem_command_failed"),
            _json_message(payload) or _command_failure_message("brmem command failed", result),
        )


def _find_public_brmem_executable() -> str:
    """Find the public brmem shim, ignoring stale deleted Python venv scripts."""
    for directory in os.environ.get("PATH", "").split(os.pathsep):
        if directory == "":
            continue
        candidate = Path(directory) / "brmem"
        if not candidate.is_file() or not os.access(candidate, os.X_OK):
            continue
        if candidate.parts[-3:] == (".venv", "bin", "brmem"):
            continue
        return str(candidate)
    raise BrmemGatewayError(
        "brmem_unavailable",
        "Cannot find `brmem` on PATH. Install the TypeScript shim with "
        "`just install-brmem` or `just install-tools`.",
    )


def check_key(key: str) -> str | None:
    """Return a handoff-compatible Entry Key validation message, or ``None``."""
    reason = _key_reason(key)
    if reason is None:
        return None
    return f"Invalid key {key!r}: {reason}"


def validate_key(key: str) -> None:
    failure = check_key(key)
    if failure is not None:
        raise BrmemGatewayError("invalid_key", failure)


def check_branch_name(branch: str) -> str | None:
    """Return a Branch Memory branch validation message, or ``None``."""
    if not branch:
        return "Invalid branch name '': branch name must not be empty"
    if _FLAT_SEPARATOR in branch:
        return (
            f"Invalid branch name {branch!r}: "
            "branch names containing '---' cannot be encoded into refs/brmem"
        )
    return None


def validate_branch_name(branch: str) -> None:
    failure = check_branch_name(branch)
    if failure is not None:
        raise BrmemGatewayError("invalid_branch_name", failure)


def validate_namespace(namespace: str) -> None:
    if not namespace:
        raise BrmemGatewayError(
            "invalid_namespace",
            "Invalid namespace '': namespace must not be empty",
        )
    if "/" in namespace:
        raise BrmemGatewayError(
            "invalid_namespace",
            f"Invalid namespace {namespace!r}: namespace must not contain '/'",
        )


def ref_name_for_entry(namespace: str, key: str, branch: str) -> str:
    """Return the Branch Memory Entry Locator for one handoff Entry."""
    validate_key(key)
    return f"{snapshot_ref_name(namespace, branch)}:{key}"


def snapshot_ref_name(namespace: str, branch: str) -> str:
    """Return the Branch Memory Snapshot Ref for one namespace and branch."""
    validate_branch_name(branch)
    encoded_branch = branch.replace("/", _FLAT_SEPARATOR)
    if namespace == BASE_NAMESPACE:
        return f"{BRMEM_REF_PREFIX}/{BRMEM_BASE_SEGMENT}/{encoded_branch}"
    validate_namespace(namespace)
    return f"{BRMEM_REF_PREFIX}/{BRMEM_NS_SEGMENT}/{namespace}/{encoded_branch}"


def entry_ref_sort_key(entry: HandoffEntryRef) -> tuple[int, str, str, str]:
    namespace_rank = 0 if entry.namespace == BASE_NAMESPACE else 1
    namespace_name = "" if entry.namespace == BASE_NAMESPACE else entry.namespace
    return (namespace_rank, namespace_name, entry.key, entry.branch)


def _entry_ref_from_json(raw_entry: object) -> HandoffEntryRef:
    if not isinstance(raw_entry, dict):
        raise BrmemGatewayError("brmem_malformed_json", "brmem list returned a malformed entry.")
    entry_data = cast(dict[str, Any], raw_entry)
    namespace = _required_str(entry_data, "namespace")
    key = _required_str(entry_data, "key")
    branch = _required_str(entry_data, "branch")
    entry_locator = _required_str(entry_data, "ref_name")
    return HandoffEntryRef(
        namespace=namespace,
        key=key,
        branch=branch,
        entry_locator=entry_locator,
    )


def _run_git(
    cmd: list[str],
    *,
    cwd: Path,
    check: bool,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        cmd,
        cwd=cwd,
        capture_output=True,
        text=True,
        check=check,
    )


def _parse_json_output(stdout: str, cmd: list[str]) -> dict[str, Any]:
    stripped = stdout.strip()
    if stripped == "":
        raise BrmemGatewayError(
            "brmem_malformed_json",
            f"brmem command returned empty JSON output: {' '.join(cmd)}",
        )
    try:
        parsed = json.loads(stripped)
    except json.JSONDecodeError as exc:
        raise BrmemGatewayError(
            "brmem_malformed_json",
            f"brmem command returned malformed JSON output: {exc}",
        ) from exc
    if not isinstance(parsed, dict):
        raise BrmemGatewayError("brmem_malformed_json", "brmem command returned non-object JSON.")
    return parsed


def _json_exit_code(payload: dict[str, Any]) -> int | None:
    value = payload.get("exit_code")
    if isinstance(value, int):
        return value
    return None


def _json_message(payload: dict[str, Any]) -> str:
    message = payload.get("message")
    if isinstance(message, str) and message:
        return message
    return "brmem command failed."


def _data_dict(payload: dict[str, Any]) -> dict[str, Any]:
    data = payload.get("data")
    if not isinstance(data, dict):
        raise BrmemGatewayError("brmem_malformed_json", "brmem command returned malformed data.")
    return data


def _data_list(payload: dict[str, Any], key: str) -> list[object]:
    data = _data_dict(payload)
    value = data.get(key)
    if not isinstance(value, list):
        raise BrmemGatewayError("brmem_malformed_json", f"brmem data.{key} is not a list.")
    return value


def _required_str(data: dict[str, Any], key: str) -> str:
    value = data.get(key)
    if not isinstance(value, str) or value == "":
        raise BrmemGatewayError("brmem_malformed_json", f"brmem data.{key} is missing.")
    return value


def _required_int(data: dict[str, Any], key: str) -> int:
    value = data.get(key)
    if not isinstance(value, int):
        raise BrmemGatewayError("brmem_malformed_json", f"brmem data.{key} is missing.")
    return value


def _command_failure_message(prefix: str, result: subprocess.CompletedProcess[str]) -> str:
    details = result.stderr.strip() or result.stdout.strip() or f"exit code {result.returncode}"
    return f"{prefix}: {details}"


def _key_reason(key: str) -> str | None:
    if not key:
        return "key must not be empty"
    if key.startswith("/"):
        return "key must not start with '/'"
    if key.endswith("/"):
        return "key must not end with '/'"
    if "//" in key:
        return "key must not contain '//'"
    if ":" in key:
        return "':' is not supported in keys"
    for ch in key:
        if ch in _KEY_FORBIDDEN_CHARS:
            return f"key contains forbidden character {ch!r}"
        code = ord(ch)
        if code < 0x20 or code == 0x7F:
            return "key contains a control character"
    segments = key.split("/")
    if any(seg == ".." for seg in segments):
        return "key must not contain '..' segment"
    if any(seg.endswith(".lock") for seg in segments):
        return "key segment must not end with '.lock'"
    for seg in segments:
        if not _KEY_SEGMENT_PATTERN.fullmatch(seg):
            return f"key segment {seg!r} is not in the allowed character set"
    return None
