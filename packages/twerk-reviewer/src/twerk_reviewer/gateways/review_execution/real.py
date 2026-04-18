"""Real review-execution gateway that dispatches through harness adapters."""

from __future__ import annotations

import subprocess
from collections.abc import Callable, Mapping

from twerk_reviewer.gateways.review_execution.gateway import ReviewExecutionGateway
from twerk_reviewer.harness_adapter import HarnessAdapter
from twerk_reviewer.harness_registry import HARNESS_ADAPTERS
from twerk_reviewer.models import (
    HarnessBinaryMissing,
    HarnessExecutionFailed,
    HarnessInvocationFailed,
    HarnessUnknown,
    ModelNotSupportedByHarness,
    ReviewerFailure,
    ReviewExecutionRequest,
    ReviewExecutionResponse,
)

ProgressWriter = Callable[[str], None]


def _silent_progress(_msg: str) -> None:
    return None


class RealReviewExecutionGateway(ReviewExecutionGateway):
    """Run a review by invoking the selected harness adapter via subprocess.

    Stdout is streamed line-by-line so the adapter's ``describe_event`` hook can
    turn each streamed event into a human-readable progress string, which this
    gateway forwards to ``progress_writer``. The full stdout is still captured
    and handed to ``adapter.parse_stdout`` once the process exits.
    """

    def __init__(
        self,
        *,
        adapters: Mapping[str, HarnessAdapter] = HARNESS_ADAPTERS,
        progress_writer: ProgressWriter = _silent_progress,
    ) -> None:
        self._adapters = adapters
        self._progress_writer = progress_writer

    def run_review(
        self,
        request: ReviewExecutionRequest,
    ) -> ReviewExecutionResponse | ReviewerFailure:
        adapter = self._adapters.get(request.adapter_name)
        if adapter is None:
            known = ", ".join(sorted(self._adapters))
            return HarnessUnknown(
                message=(f"Unknown harness '{request.adapter_name}'. Known harnesses: {known}."),
            )

        if not adapter.supports_model(request.model):
            return ModelNotSupportedByHarness(
                message=(f"Model {request.model!r} is not supported by harness {adapter.name!r}."),
            )

        argv = adapter.build_argv(request.model, request.prompt)

        try:
            process = subprocess.Popen(
                argv,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
            )
        except FileNotFoundError:
            return HarnessBinaryMissing(
                message=(
                    f"Harness binary {adapter.binary!r} is not on PATH. "
                    "Install the harness or pick a different one."
                ),
            )
        except OSError as exc:
            return HarnessInvocationFailed(
                message=f"Unable to invoke {adapter.binary!r}: {exc}",
            )

        stdout_lines: list[str] = []
        assert process.stdout is not None  # PIPE guarantees this
        for line in process.stdout:
            stdout_lines.append(line)
            description = adapter.describe_event(line)
            if description is not None:
                self._progress_writer(description)

        process.wait()
        stderr_text = ""
        if process.stderr is not None:
            stderr_text = process.stderr.read()

        if process.returncode != 0:
            stderr = stderr_text.strip()
            last_line = stdout_lines[-1].strip() if stdout_lines else ""
            return HarnessExecutionFailed(
                message=(
                    stderr
                    or last_line
                    or f"Harness {adapter.name!r} exited with status {process.returncode}."
                ),
            )

        return adapter.parse_stdout("".join(stdout_lines))
