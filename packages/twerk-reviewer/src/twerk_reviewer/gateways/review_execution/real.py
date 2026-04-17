"""Real review-execution gateway backed by subprocess execution."""

from __future__ import annotations

import json
import shlex
import subprocess
from typing import Any

from twerk_reviewer.gateways.review_execution.gateway import (
    ReviewExecutionFailure,
    ReviewExecutionGateway,
)
from twerk_reviewer.models import (
    ExecutorCommandInvalid,
    ExecutorCommandMissing,
    ReviewExecutionFailed,
    ReviewExecutionInvalidJson,
    ReviewExecutionInvalidResponse,
    ReviewExecutionRequest,
    ReviewExecutionResponse,
    ReviewExecutorInvocationError,
    ReviewFinding,
)

_EXECUTOR_ERROR_CLASSES: tuple[type[ReviewExecutionFailure], ...] = (
    ExecutorCommandInvalid,
    ExecutorCommandMissing,
    ReviewExecutionFailed,
    ReviewExecutionInvalidJson,
    ReviewExecutionInvalidResponse,
)
_EXECUTOR_ERROR_BY_TYPE: dict[str, type[ReviewExecutionFailure]] = {
    cls.ERROR_TYPE: cls for cls in _EXECUTOR_ERROR_CLASSES
}


class RealReviewExecutionGateway(ReviewExecutionGateway):
    """Invoke a local review executor command and parse its JSON output."""

    def run_review(
        self,
        request: ReviewExecutionRequest,
    ) -> ReviewExecutionResponse | ReviewExecutionFailure:
        try:
            command = shlex.split(request.executor_command)
        except ValueError as exc:
            return ExecutorCommandInvalid(
                message=f"Unable to parse executor command: {exc}",
            )

        if not command:
            return ExecutorCommandMissing(
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
            raise ReviewExecutorInvocationError(
                f"Unable to run the review executor: {exc}"
            ) from exc

        if result.returncode != 0:
            stderr = result.stderr.strip()
            stdout = result.stdout.strip()
            return ReviewExecutionFailed(
                message=stderr or stdout or "The review executor exited with a non-zero status.",
            )

        stdout = result.stdout.strip()
        if not stdout:
            return ReviewExecutionInvalidResponse(
                message="The review executor returned no JSON output.",
            )

        try:
            payload = json.loads(stdout)
        except json.JSONDecodeError as exc:
            return ReviewExecutionInvalidJson(
                message=f"Unable to parse review executor output: {exc}",
            )

        return _parse_execution_response(payload)


def _parse_execution_response(
    payload: Any,
) -> ReviewExecutionResponse | ReviewExecutionFailure:
    if not isinstance(payload, dict):
        return ReviewExecutionInvalidResponse(
            message="Review executor output must be a JSON object.",
        )

    if payload.get("success") is False:
        raw_error_type = payload.get("error_type", "review_execution_failed")
        message = payload.get("message", "The review executor reported a failure.")
        if isinstance(raw_error_type, str) and raw_error_type in _EXECUTOR_ERROR_BY_TYPE:
            failure_cls = _EXECUTOR_ERROR_BY_TYPE[raw_error_type]
            return failure_cls(message=str(message))
        return ReviewExecutionFailed(
            message=f"Review executor reported error_type={raw_error_type!r}: {message}",
        )

    findings_payload = payload.get("findings")
    if not isinstance(findings_payload, list):
        return ReviewExecutionInvalidResponse(
            message="Review executor output must include a `findings` array.",
        )

    findings: list[ReviewFinding] = []
    for finding_payload in findings_payload:
        if not isinstance(finding_payload, dict):
            return ReviewExecutionInvalidResponse(
                message="Each review finding must be a JSON object.",
            )
        try:
            findings.append(ReviewFinding.from_json_dict(finding_payload))
        except ValueError as exc:
            return ReviewExecutionInvalidResponse(
                message=str(exc),
            )

    return ReviewExecutionResponse(findings=tuple(findings))
