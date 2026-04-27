"""Real review-execution gateway that dispatches through harness adapters."""

from __future__ import annotations

import subprocess
import threading
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

        argv = adapter.build_argv(request)
        stdin_payload = adapter.build_stdin(request)
        stdin_arg = subprocess.PIPE if stdin_payload is not None else subprocess.DEVNULL

        try:
            process = subprocess.Popen(
                argv,
                stdin=stdin_arg,
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

        # Pump stdin from a daemon thread so we can keep streaming stdout.
        # Writing inline would deadlock once the prompt exceeds the OS pipe
        # buffer (~64KB) since nothing would be draining stdout in parallel.
        writer_thread: threading.Thread | None = None
        if stdin_payload is not None:
            assert process.stdin is not None  # PIPE guarantees this
            stdin_stream = process.stdin

            def _pump_stdin() -> None:
                try:
                    stdin_stream.write(stdin_payload)
                except BrokenPipeError:
                    pass
                finally:
                    stdin_stream.close()

            writer_thread = threading.Thread(target=_pump_stdin, daemon=True)
            writer_thread.start()

        stdout_lines: list[str] = []
        assert process.stdout is not None  # PIPE guarantees this
        for line in process.stdout:
            stdout_lines.append(line)
            description = adapter.describe_event(line)
            if description is not None:
                self._progress_writer(description)

        process.wait()
        if writer_thread is not None:
            writer_thread.join(timeout=5.0)
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

        return adapter.parse_stdout(request, "".join(stdout_lines))
