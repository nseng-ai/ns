"""Gateway boundary for roaster stack agent runs."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, TypeAlias

AgentRunnerKind = Literal["triage", "resolver"]


@dataclass(frozen=True)
class AgentRunnerRequest:
    """Semantic request for one roaster stack agent invocation."""

    kind: AgentRunnerKind
    prompt_resource: str
    prompt_override: str | None
    model: str | None
    cwd: Path
    input_markdown: str
    allowed_tools: tuple[str, ...]


@dataclass(frozen=True)
class AgentRunCompleted:
    """Markdown emitted by the agent runner."""

    output_markdown: str


@dataclass(frozen=True)
class AgentRunnerUnavailable:
    """No supported local agent runner is available for this request."""

    message: str


@dataclass(frozen=True)
class AgentRunnerExecutionFailed:
    """The agent runner was available but failed to produce output."""

    message: str


AgentRunnerFailure: TypeAlias = AgentRunnerUnavailable | AgentRunnerExecutionFailed
AgentRunnerResult: TypeAlias = AgentRunCompleted | AgentRunnerFailure


class AgentRunnerGateway(ABC):
    """Run read-only triage or mutating resolver agents behind a narrow boundary."""

    @abstractmethod
    def run_agent(self, request: AgentRunnerRequest) -> AgentRunnerResult:
        """Run one agent request and return markdown output or a typed failure."""
