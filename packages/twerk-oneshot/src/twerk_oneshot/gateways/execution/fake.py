from __future__ import annotations

from collections.abc import Sequence

from twerk_oneshot.gateways.execution.gateway import (
    ExecutionBackend,
    WorkflowDispatchRequest,
    WorkflowRun,
)

DEFAULT_WORKFLOW_RUN = WorkflowRun(url="https://github.com/dagster-io/twerk/actions/runs/9001")


class FakeExecutionBackend(ExecutionBackend):
    def __init__(
        self,
        *,
        workflow_run: WorkflowRun = DEFAULT_WORKFLOW_RUN,
    ) -> None:
        self._workflow_run = workflow_run
        self._dispatch_requests: list[WorkflowDispatchRequest] = []

    @property
    def dispatch_requests(self) -> Sequence[WorkflowDispatchRequest]:
        return tuple(self._dispatch_requests)

    def dispatch(self, request: WorkflowDispatchRequest) -> WorkflowRun:
        self._dispatch_requests.append(request)
        return self._workflow_run
