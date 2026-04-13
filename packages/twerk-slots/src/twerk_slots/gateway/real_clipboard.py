"""Real ClipboardGateway backed by ``pbcopy``."""

from __future__ import annotations

import subprocess

from twerk_slots.gateway.clipboard import (
    ClipboardCopyFailure,
    ClipboardCopyResult,
    ClipboardCopySuccess,
    ClipboardGateway,
)


class RealClipboardGateway(ClipboardGateway):
    """ClipboardGateway that shells out to ``pbcopy`` (macOS).

    Returns a :class:`ClipboardCopyFailure` carrying the reason and a
    human-readable detail when the binary is missing (non-macOS hosts) or
    exits non-zero, so callers can surface a useful warning without
    crashing.
    """

    def copy(self, text: str) -> ClipboardCopyResult:
        try:
            subprocess.run(
                ["pbcopy"],
                input=text,
                text=True,
                check=True,
                capture_output=True,
            )
        except FileNotFoundError:
            return ClipboardCopyFailure(
                reason="backend_missing",
                detail="`pbcopy` not found on PATH (clipboard requires macOS).",
            )
        except subprocess.CalledProcessError as exc:
            stderr = (exc.stderr or "").strip() or "<no stderr>"
            return ClipboardCopyFailure(
                reason="subprocess_error",
                detail=f"`pbcopy` exited with code {exc.returncode}: {stderr}",
            )
        return ClipboardCopySuccess()
