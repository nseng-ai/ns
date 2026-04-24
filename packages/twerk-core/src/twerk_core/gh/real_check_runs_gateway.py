"""Real ``CheckRunsGateway`` implementation backed by the ``gh`` CLI.

All REST calls flow through ``gh api`` with ``--input -`` (stdin JSON),
which is the ergonomic way to pass nested arrays of objects (the
annotations list) to the GitHub API. GraphQL is not used here: the
Checks API exposes no GraphQL mutation for creating or updating check
runs, only REST.

The 50-annotation-per-request limit is GitHub-enforced. This
implementation batches transparently: the initial POST carries up to 50
annotations alongside the output; each subsequent 50-chunk is appended
via PATCH on the same check run.
"""

from __future__ import annotations

import json
import subprocess
from collections.abc import Sequence
from typing import Any, Literal, cast

from twerk_core.gh.check_runs_gateway import CheckRunsGateway
from twerk_core.gh.real_gateway_helpers import fetch_owner_repo
from twerk_core.gh.types import (
    AnnotationLevel,
    CheckRun,
    CheckRunAnnotation,
    CheckRunConclusion,
    CheckRunOutput,
    CheckRunStatus,
)

# GitHub's per-request limit for annotations on a check-run create or update.
_ANNOTATIONS_PER_REQUEST = 50


def _annotation_to_api(annotation: CheckRunAnnotation) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "path": annotation.path,
        "start_line": annotation.start_line,
        "end_line": annotation.end_line,
        "annotation_level": annotation.annotation_level,
        "message": annotation.message,
    }
    if annotation.title is not None:
        payload["title"] = annotation.title
    if annotation.raw_details is not None:
        payload["raw_details"] = annotation.raw_details
    return payload


def _annotation_from_api(raw: dict[str, Any]) -> CheckRunAnnotation:
    level: AnnotationLevel = cast(AnnotationLevel, raw["annotation_level"])
    return CheckRunAnnotation(
        path=raw["path"],
        start_line=raw["start_line"],
        end_line=raw["end_line"],
        annotation_level=level,
        message=raw["message"],
        title=raw.get("title"),
        raw_details=raw.get("raw_details"),
    )


def _check_run_from_api(raw: dict[str, Any]) -> CheckRun:
    status: CheckRunStatus = cast(CheckRunStatus, raw["status"])
    conclusion_raw = raw.get("conclusion")
    conclusion: CheckRunConclusion | None = (
        cast(CheckRunConclusion, conclusion_raw) if conclusion_raw is not None else None
    )
    return CheckRun(
        id=raw["id"],
        name=raw["name"],
        head_sha=raw["head_sha"],
        status=status,
        conclusion=conclusion,
        html_url=raw["html_url"],
    )


def _run_gh_api(
    *,
    method: str,
    path: str,
    body: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Execute a ``gh api`` REST call and return the parsed JSON object.

    Uses ``--input -`` (stdin JSON) when a body is supplied so nested
    arrays of objects round-trip faithfully; the ``-f`` / ``-F`` flags
    would force the body into a flat form.
    """
    cmd = ["gh", "api", "--method", method, path]
    if body is not None:
        cmd.extend(["--input", "-"])
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=True,
            input=json.dumps(body),
        )
    else:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
    return cast(dict[str, Any], json.loads(result.stdout))


class RealCheckRunsGateway(CheckRunsGateway):
    """CheckRunsGateway implemented by shelling out to the ``gh`` CLI."""

    def find_check_run(self, head_sha: str, name: str) -> CheckRun | None:
        owner, repo = fetch_owner_repo()
        result = subprocess.run(
            [
                "gh",
                "api",
                f"repos/{owner}/{repo}/commits/{head_sha}/check-runs",
                "--paginate",
            ],
            capture_output=True,
            text=True,
            check=True,
        )
        # The list endpoint returns `{"total_count": N, "check_runs": [...]}`
        # per page. `--paginate` concatenates pages, which is not valid JSON
        # as a whole — decode each page and flatten.
        decoder = json.JSONDecoder()
        stdout = result.stdout
        index = 0
        runs: list[dict[str, Any]] = []
        while index < len(stdout):
            while index < len(stdout) and stdout[index].isspace():
                index += 1
            if index >= len(stdout):
                break
            raw_page, index = decoder.raw_decode(stdout, index)
            page = cast(dict[str, Any], raw_page)
            runs.extend(page.get("check_runs", []))
        for run in runs:
            if run["name"] == name:
                return _check_run_from_api(run)
        return None

    def upsert_check_run(
        self,
        *,
        head_sha: str,
        name: str,
        output: CheckRunOutput,
        annotations: Sequence[CheckRunAnnotation],
        conclusion: Literal["neutral"] = "neutral",
    ) -> CheckRun:
        owner, repo = fetch_owner_repo()
        existing = self.find_check_run(head_sha, name)
        annotation_list = list(annotations)
        first_chunk = annotation_list[:_ANNOTATIONS_PER_REQUEST]
        remaining_chunks = [
            annotation_list[i : i + _ANNOTATIONS_PER_REQUEST]
            for i in range(_ANNOTATIONS_PER_REQUEST, len(annotation_list), _ANNOTATIONS_PER_REQUEST)
        ]

        output_body: dict[str, Any] = {
            "title": output.title,
            "summary": output.summary,
            "annotations": [_annotation_to_api(a) for a in first_chunk],
        }
        if output.text is not None:
            output_body["text"] = output.text

        body: dict[str, Any] = {
            "name": name,
            "head_sha": head_sha,
            "status": "completed",
            "conclusion": conclusion,
            "output": output_body,
        }

        if existing is None:
            path = f"repos/{owner}/{repo}/check-runs"
            response = _run_gh_api(method="POST", path=path, body=body)
        else:
            path = f"repos/{owner}/{repo}/check-runs/{existing.id}"
            response = _run_gh_api(method="PATCH", path=path, body=body)

        check_run = _check_run_from_api(response)

        # Append the remaining annotations in 50-chunks via PATCH on the
        # check run's own endpoint. GitHub's Checks API treats additional
        # annotations as additive rather than replacing, so chunked PATCH
        # is the canonical way to go over 50.
        for chunk in remaining_chunks:
            chunk_body: dict[str, Any] = {
                "output": {
                    "title": output.title,
                    "summary": output.summary,
                    "annotations": [_annotation_to_api(a) for a in chunk],
                },
            }
            if output.text is not None:
                chunk_body["output"]["text"] = output.text
            _run_gh_api(
                method="PATCH",
                path=f"repos/{owner}/{repo}/check-runs/{check_run.id}",
                body=chunk_body,
            )

        return check_run

    def list_annotations(self, check_run_id: int) -> tuple[CheckRunAnnotation, ...]:
        owner, repo = fetch_owner_repo()
        result = subprocess.run(
            [
                "gh",
                "api",
                f"repos/{owner}/{repo}/check-runs/{check_run_id}/annotations",
                "--paginate",
            ],
            capture_output=True,
            text=True,
            check=True,
        )
        decoder = json.JSONDecoder()
        stdout = result.stdout
        index = 0
        raw_annotations: list[dict[str, Any]] = []
        while index < len(stdout):
            while index < len(stdout) and stdout[index].isspace():
                index += 1
            if index >= len(stdout):
                break
            raw_page, index = decoder.raw_decode(stdout, index)
            # The annotations endpoint returns a flat array per page.
            page = cast(list[dict[str, Any]], raw_page)
            raw_annotations.extend(page)
        return tuple(_annotation_from_api(raw) for raw in raw_annotations)
