"""Gateway for detecting harness binaries available on the local machine."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass(frozen=True)
class HarnessDetection:
    """Whether a harness binary is installed, and where it lives on PATH."""

    name: str
    binary: str
    path: str | None

    @property
    def available(self) -> bool:
        return self.path is not None


class HarnessDetectionGateway(ABC):
    """Probe the local system for installed harness binaries."""

    @abstractmethod
    def detect(self, *, name: str, binary: str) -> HarnessDetection:
        """Return a :class:`HarnessDetection` for one harness binary."""
