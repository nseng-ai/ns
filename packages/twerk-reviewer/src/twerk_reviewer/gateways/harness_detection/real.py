"""Real harness-detection gateway backed by :func:`shutil.which`."""

from __future__ import annotations

import shutil

from twerk_reviewer.gateways.harness_detection.gateway import (
    HarnessDetection,
    HarnessDetectionGateway,
)


class RealHarnessDetectionGateway(HarnessDetectionGateway):
    """Look up harness binaries on the local ``PATH``."""

    def detect(self, *, name: str, binary: str) -> HarnessDetection:
        path = shutil.which(binary)
        return HarnessDetection(name=name, binary=binary, path=path)
