"""Real review-execution gateway backed by subprocess execution."""

from __future__ import annotations

import json
import shlex
import subprocess
from typing import Any

from twerk_reviewer.gateways.review_execution.gateway import ReviewExecutionGateway
from twerk_reviewer.models import (
    ReviewerFailure,
    ReviewExecutionRequest,
    ReviewExecutionResponse,
    ReviewFinding,
)


class RealReviewExecutionGateway(ReviewExecutionGateway):
    """Invoke a local review executor command and parse its JSON output."""

    def run_review(
        self,
        request: ReviewExecutionRequest,
    ) -> ReviewExecutionResponse | ReviewerFailure:
        try:
            command = shlex.split(request.executor_command)
        except ValueError as exc:
            return ReviewerFailure(
                error_type="executor_command_invalid",
                message=f"Unable to parse executor command: {exc}",
            )

        if not command:
            return ReviewerFailure(
                error_type="executor_command_missing",
                message="No executor command was provided for review execution.",
            )

        try:
            result = subprocess.run(
                command,
                input=json.dumps(request.to_json_dict()),
                capture_output=True,
                text=True,
                check=False,
            )
        except OSError as exc:
            return ReviewerFailure(
                error_type="review_execution_invocation_failed",
                message=f"Unable to run the review executor: {exc}",
            )

        if result.returncode != 0:
            stderr = result.stderr.strip()
            stdout = result.stdout.strip()
            return ReviewerFailure(
                error_type="review_execution_failed",
                message=stderr or stdout or "The review executor exited with a non-zero status.",
            )

        stdout = result.stdout.strip()
        if not stdout:
            return ReviewerFailure(
                error_type="review_execution_invalid_response",
                message="The review executor returned no JSON output.",
            )

        try:
            payload = json.loads(stdout)
        except json.JSONDecodeError as exc:
            return ReviewerFailure(
                error_type="review_execution_invalid_json",
                message=f"Unable to parse review executor output: {exc}",
            )

        return _parse_execution_response(payload)


def _parse_execution_response(
    payload: Any,
) -> ReviewExecutionResponse | ReviewerFailure:
    if not isinstance(payload, dict):
        return ReviewerFailure(
            error_type="review_execution_invalid_response",
            message="Review executor output must be a JSON object.",
        )

    if payload.get("success") is False:
        error_type = payload.get("error_type", "review_execution_failed")
        message = payload.get("message", "The review executor reported a failure.")
        return ReviewerFailure(error_type=str(error_type), message=str(message))

    findings_payload = payload.get("findings")
    if not isinstance(findings_payload, list):
        return ReviewerFailure(
            error_type="review_execution_invalid_response",
            message="Review executor output must include a `findings` array.",
        )

    findings: list[ReviewFinding] = []
    for finding_payload in findings_payload:
        if not isinstance(finding_payload, dict):
            return ReviewerFailure(
                error_type="review_execution_invalid_response",
                message="Each review finding must be a JSON object.",
            )
        try:
            findings.append(ReviewFinding.from_json_dict(finding_payload))
        except ValueError as exc:
            return ReviewerFailure(
                error_type="review_execution_invalid_response",
                message=str(exc),
            )

    return ReviewExecutionResponse(findings=tuple(findings))
