"""In-memory fake for the roaster stack agent-runner gateway."""

from __future__ import annotations

from roaster.gateways.agent_runner.gateway import (
    AgentRunCompleted,
    AgentRunnerFailure,
    AgentRunnerGateway,
    AgentRunnerRequest,
    AgentRunnerResult,
)


class FakeAgentRunnerGateway(AgentRunnerGateway):
    """Record agent requests and return constructor-seeded results."""

    def __init__(
        self,
        *,
        responses: tuple[AgentRunCompleted, ...] | None = None,
        errors: tuple[AgentRunnerFailure, ...] | None = None,
        default_response: AgentRunCompleted | None = None,
    ) -> None:
        self._responses = tuple(responses or ())
        self._errors = tuple(errors or ())
        self._default_response = default_response or AgentRunCompleted(output_markdown="")
        self._requests: list[AgentRunnerRequest] = []

    def run_agent(self, request: AgentRunnerRequest) -> AgentRunnerResult:
        self._requests.append(request)
        call_index = len(self._requests) - 1
        if call_index < len(self._errors):
            return self._errors[call_index]
        if call_index < len(self._responses):
            return self._responses[call_index]
        return self._default_response

    @property
    def requests(self) -> tuple[AgentRunnerRequest, ...]:
        """Return recorded agent requests."""
        return tuple(self._requests)

    @property
    def responses(self) -> tuple[AgentRunCompleted, ...]:
        """Return configured success responses."""
        return self._responses

    @property
    def errors(self) -> tuple[AgentRunnerFailure, ...]:
        """Return configured error responses."""
        return self._errors
