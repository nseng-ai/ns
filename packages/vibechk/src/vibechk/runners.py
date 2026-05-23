from __future__ import annotations

import subprocess
import sys
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from typing import TextIO

from vibechk.errors import VibechkError
from vibechk.models import Metrics, RunnerResult


@dataclass(frozen=True)
class RunnerRequest:
    plan_text: str
    workdir: Path
    model: str | None
    run_id: str
    artifacts_dir: Path


class Runner(ABC):
    @property
    @abstractmethod
    def name(self) -> str:
        """Stable runner name used by the CLI."""

    @abstractmethod
    def run(self, request: RunnerRequest, transcript_sink: TextIO) -> RunnerResult:
        """Run the agent and write raw output to transcript_sink."""


class RunnerRegistry:
    def __init__(self, runners: list[Runner]) -> None:
        self._runners = {runner.name: runner for runner in runners}

    def get(self, name: str) -> Runner:
        if name in self._runners:
            return self._runners[name]
        available = ", ".join(self.names()) or "none"
        raise VibechkError(f"Unsupported runner '{name}'. Available runners: {available}.")

    def names(self) -> list[str]:
        return sorted(self._runners)


class ClaudeRunner(Runner):
    @property
    def name(self) -> str:
        return "claude"

    def run(self, request: RunnerRequest, transcript_sink: TextIO) -> RunnerResult:
        command = self._command(request)
        started = time.monotonic()
        try:
            process = subprocess.Popen(
                command,
                cwd=request.workdir,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
            )
        except FileNotFoundError as error:
            raise VibechkError("Runner 'claude' is not installed or not on PATH.") from error

        if process.stdout is not None:
            for line in process.stdout:
                sys.stdout.write(line)
                sys.stdout.flush()
                transcript_sink.write(line)
                transcript_sink.flush()

        exit_code = process.wait()
        wall_time_seconds = round(time.monotonic() - started, 3)
        return RunnerResult(
            exit_code=exit_code,
            transcript="",
            metrics=Metrics(wall_time_seconds=wall_time_seconds),
            artifacts={},
            runner_version=None,
        )

    def _command(self, request: RunnerRequest) -> list[str]:
        command = [
            "claude",
            "--bare",
            "--print",
            "--permission-mode",
            "acceptEdits",
        ]
        if request.model is not None:
            command.extend(["--model", request.model])
        command.append(request.plan_text)
        return command


def build_production_runner_registry() -> RunnerRegistry:
    return RunnerRegistry([ClaudeRunner()])
