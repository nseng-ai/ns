"""Guarded real adapter for roaster stack agent runs."""

from __future__ import annotations

from roaster.gateways.agent_runner.gateway import (
    AgentRunnerGateway,
    AgentRunnerRequest,
    AgentRunnerResult,
    AgentRunnerUnavailable,
)


class RealAgentRunnerGateway(AgentRunnerGateway):
    """Real agent runner adapter.

    Resolver execution will eventually need mutating tool permissions and
    branch-safety orchestration. Until that is implemented explicitly, the real
    adapter fails closed instead of guessing a local runner command.
    """

    def run_agent(self, request: AgentRunnerRequest) -> AgentRunnerResult:
        return AgentRunnerUnavailable(
            message=(
                "Roaster stack agent runner is not wired to a supported local runner yet "
                f"for {request.kind!r}; the real adapter fails closed before model or "
                "repository mutation. Use --dry-run with a test/fake runner for automated "
                "checks, or implement an explicit guarded runner adapter before invoking "
                "this workflow for real."
            )
        )
