"""In-memory fake for the harness-detection gateway."""

from __future__ import annotations

from twerk_reviewer.gateways.harness_detection.gateway import (
    HarnessDetection,
    HarnessDetectionGateway,
)


class FakeHarnessDetectionGateway(HarnessDetectionGateway):
    """Return configured detection results without touching the filesystem."""

    def __init__(
        self,
        *,
        paths_by_binary: dict[str, str] | None = None,
    ) -> None:
        self._paths_by_binary = dict(paths_by_binary or {})
        self._detect_calls: list[tuple[str, str]] = []

    def detect(self, *, name: str, binary: str) -> HarnessDetection:
        self._detect_calls.append((name, binary))
        return HarnessDetection(
            name=name,
            binary=binary,
            path=self._paths_by_binary.get(binary),
        )

    @property
    def detect_calls(self) -> tuple[tuple[str, str], ...]:
        return tuple(self._detect_calls)
