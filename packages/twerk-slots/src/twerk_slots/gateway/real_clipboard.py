"""Real ClipboardGateway backed by ``pbcopy``."""

from __future__ import annotations

import subprocess

from twerk_slots.gateway.clipboard import ClipboardGateway


class RealClipboardGateway(ClipboardGateway):
    """ClipboardGateway that shells out to ``pbcopy`` (macOS).

    Returns False on any failure — missing binary (non-macOS hosts) or a
    non-zero exit — so callers can surface a warning without crashing.
    """

    def copy(self, text: str) -> bool:
        try:
            subprocess.run(
                ["pbcopy"],
                input=text,
                text=True,
                check=True,
            )
        except (FileNotFoundError, subprocess.CalledProcessError):
            return False
        return True
