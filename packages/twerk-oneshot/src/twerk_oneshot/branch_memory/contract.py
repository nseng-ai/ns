from __future__ import annotations

import json
from dataclasses import dataclass

BRANCH_MEMORY_ROOT = ".twerk/branch-memory"
ONESHOT_ROOT = f"{BRANCH_MEMORY_ROOT}/oneshot"
MANIFEST_PATH = f"{BRANCH_MEMORY_ROOT}/manifest.json"
PROMPT_PATH = f"{ONESHOT_ROOT}/prompt.md"
REQUEST_PATH = f"{ONESHOT_ROOT}/request.json"


@dataclass(frozen=True)
class OneshotBranchMemoryRequest:
    backend_name: str
    workflow_filename: str
    branch_name: str
    base_branch: str
    pr_title: str
    submitted_at: str
    submitted_by: str
    prompt_path: str = PROMPT_PATH


@dataclass(frozen=True)
class OneshotBranchMemoryBundle:
    files: dict[str, str]


def build_oneshot_branch_memory(
    *,
    prompt: str,
    request: OneshotBranchMemoryRequest,
) -> OneshotBranchMemoryBundle:
    manifest = {
        "schema_version": 1,
        "entries": [
            {
                "kind": "oneshot-prompt",
                "path": PROMPT_PATH,
                "media_type": "text/markdown",
            },
            {
                "kind": "oneshot-request",
                "path": REQUEST_PATH,
                "media_type": "application/json",
            },
        ],
    }
    request_payload = {
        "schema_version": 1,
        "backend_name": request.backend_name,
        "workflow_filename": request.workflow_filename,
        "branch_name": request.branch_name,
        "base_branch": request.base_branch,
        "pr_title": request.pr_title,
        "prompt_path": request.prompt_path,
        "submitted_at": request.submitted_at,
        "submitted_by": request.submitted_by,
    }
    return OneshotBranchMemoryBundle(
        files={
            MANIFEST_PATH: _json_text(manifest),
            PROMPT_PATH: f"{prompt.rstrip()}\n",
            REQUEST_PATH: _json_text(request_payload),
        }
    )


def _json_text(payload: dict[str, object]) -> str:
    return json.dumps(payload, indent=2, sort_keys=True) + "\n"
