from __future__ import annotations

from pathlib import Path

from packagechk.gateways.npm_publish.gateway import NpmPublishGateway


class FakeNpmPublishGateway(NpmPublishGateway):
    """In-memory npm publisher for scenario tests."""

    def __init__(
        self,
        *,
        tools_error: str | None = None,
        publish_error: str | None = None,
    ) -> None:
        self._tools_error = tools_error
        self._publish_error = publish_error
        self._tool_checks = 0
        self._published_project_dirs: list[Path] = []

    @property
    def tool_checks(self) -> int:
        return self._tool_checks

    @property
    def published_project_dirs(self) -> list[Path]:
        return self._published_project_dirs.copy()

    def ensure_publish_tools_available(self) -> str | None:
        self._tool_checks += 1
        return self._tools_error

    def publish_project(self, project_dir: Path) -> str | None:
        self._published_project_dirs.append(project_dir)
        return self._publish_error
