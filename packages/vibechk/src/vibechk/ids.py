from __future__ import annotations

import secrets


def generate_run_id() -> str:
    """Generate an 8-character lowercase hex run id."""
    return secrets.token_hex(4)
