from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass(frozen=True)
class WorkflowDispatchRequest:
    workflow_filename: str
    ref: str
    inputs: dict[str, str]


@dataclass(frozen=True)
class WorkflowRun:
    url: str


class ExecutionBackend(ABC):
    @abstractmethod
    def dispatch(self, request: WorkflowDispatchRequest) -> WorkflowRun:
        """Dispatch remote execution for a queued oneshot request."""
