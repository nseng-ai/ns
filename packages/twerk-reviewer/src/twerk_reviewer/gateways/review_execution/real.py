"""Real review-execution gateway that dispatches through harness adapters."""

from __future__ import annotations

import subprocess
from collections.abc import Mapping

from twerk_reviewer.gateways.review_execution.gateway import ReviewExecutionGateway
from twerk_reviewer.harness_adapter import HarnessAdapter
from twerk_reviewer.harness_registry import HARNESS_ADAPTERS
from twerk_reviewer.models import ReviewerFailure, ReviewExecutionRequest, ReviewExecutionResponse


class RealReviewExecutionGateway(ReviewExecutionGateway):
    """Run a review by invoking the selected harness adapter via subprocess."""

    def __init__(
        self,
        *,
        adapters: Mapping[str, HarnessAdapter] = HARNESS_ADAPTERS,
    ) -> None:
        self._adapters = adapters

    def run_review(
        self,
        request: ReviewExecutionRequest,
    ) -> ReviewExecutionResponse | ReviewerFailure:
        adapter = self._adapters.get(request.adapter_name)
        if adapter is None:
            known = ", ".join(sorted(self._adapters))
            return ReviewerFailure(
                error_type="harness_unknown",
                message=(f"Unknown harness '{request.adapter_name}'. Known harnesses: {known}."),
            )

        if not adapter.supports_model(request.model):
            return ReviewerFailure(
                error_type="model_not_supported_by_harness",
                message=(f"Model {request.model!r} is not supported by harness {adapter.name!r}."),
            )

        argv = adapter.build_argv(request.model, request.prompt)

        try:
            result = subprocess.run(
                argv,
                capture_output=True,
                text=True,
                check=False,
            )
        except FileNotFoundError:
            return ReviewerFailure(
                error_type="harness_binary_missing",
                message=(
                    f"Harness binary {adapter.binary!r} is not on PATH. "
                    "Install it and re-run `reviewer harness init`."
                ),
            )
        except OSError as exc:
            return ReviewerFailure(
                error_type="harness_invocation_failed",
                message=f"Unable to invoke {adapter.binary!r}: {exc}",
            )

        if result.returncode != 0:
            stderr = result.stderr.strip()
            stdout = result.stdout.strip()
            return ReviewerFailure(
                error_type="harness_execution_failed",
                message=(
                    stderr
                    or stdout
                    or f"Harness {adapter.name!r} exited with status {result.returncode}."
                ),
            )

        return adapter.parse_stdout(result.stdout)
