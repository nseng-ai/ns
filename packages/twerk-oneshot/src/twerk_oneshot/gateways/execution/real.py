from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

from twerk_oneshot.gateways.execution.gateway import (
    ExecutionBackend,
    WorkflowDispatchRequest,
    WorkflowRun,
)

_URL_PATTERN = re.compile(r"https://\S+")


class RealExecutionBackend(ExecutionBackend):
    def __init__(self, *, repo_root: Path | None = None) -> None:
        self._repo_root = repo_root or Path.cwd()

    def dispatch(self, request: WorkflowDispatchRequest) -> WorkflowRun:
        command = ["gh", "workflow", "run", request.workflow_filename, "--ref", request.ref]
        for key, value in sorted(request.inputs.items()):
            command.extend(["-f", f"{key}={value}"])

        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            check=True,
            cwd=self._repo_root,
        )
        run_url = _find_url(result.stdout)
        if run_url is not None:
            return WorkflowRun(url=run_url)

        fallback = subprocess.run(
            [
                "gh",
                "run",
                "list",
                "--workflow",
                request.workflow_filename,
                "--branch",
                request.ref,
                "--event",
                "workflow_dispatch",
                "--limit",
                "1",
                "--json",
                "url",
            ],
            capture_output=True,
            text=True,
            check=True,
            cwd=self._repo_root,
        )
        payload = json.loads(fallback.stdout)
        if not payload:
            raise RuntimeError("Workflow dispatch succeeded but no run URL was available.")
        return WorkflowRun(url=payload[0]["url"])


def _find_url(output: str) -> str | None:
    match = _URL_PATTERN.search(output)
    if match is None:
        return None
    return match.group(0)
