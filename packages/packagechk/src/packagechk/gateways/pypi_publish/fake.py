from __future__ import annotations

from pathlib import Path

from packagechk.gateways.pypi_publish.gateway import PypiPublishError, PypiPublishGateway


class FakePypiPublishGateway(PypiPublishGateway):
    """In-memory PyPI publisher for scenario tests."""

    def __init__(
        self,
        *,
        tools_error: str | None = None,
        build_error: str | None = None,
        publish_error: str | None = None,
        artifacts: list[Path] | None = None,
    ) -> None:
        self._tools_error = tools_error
        self._build_error = build_error
        self._publish_error = publish_error
        self._artifacts = artifacts or []
        self._tool_checks = 0
        self._built_project_dirs: list[Path] = []
        self._published_artifacts: list[list[Path]] = []

    @property
    def tool_checks(self) -> int:
        return self._tool_checks

    @property
    def built_project_dirs(self) -> list[Path]:
        return self._built_project_dirs.copy()

    @property
    def published_artifacts(self) -> list[list[Path]]:
        return [artifacts.copy() for artifacts in self._published_artifacts]

    def ensure_publish_tools_available(self) -> str | None:
        self._tool_checks += 1
        return self._tools_error

    def build_package(self, project_dir: Path) -> list[Path]:
        self._built_project_dirs.append(project_dir)
        if self._build_error is not None:
            raise PypiPublishError(self._build_error)
        return self._artifacts.copy()

    def publish_artifacts(self, project_dir: Path, artifacts: list[Path]) -> str | None:
        self._published_artifacts.append(artifacts.copy())
        return self._publish_error
