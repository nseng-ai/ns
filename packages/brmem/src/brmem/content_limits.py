"""Ingestion-time guardrails for branch-memory entries.

`brmem put` is intended for text artifacts (plan documents, objective state,
short notes). Two cheap checks at the door keep stray binaries and oversized
files out of the ref pack, where they would otherwise become hard-to-reclaim
storage weight once a brmem ref pinned them.

Helpers here are pure (`bytes -> str | None`); the caller wraps the returned
fragment with `source_file` context and the `-f / --force` override hint.
"""

from __future__ import annotations

from typing import Final

MAX_ENTRY_BYTES: Final = 1 << 20  # 1 MiB
BINARY_SNIFF_BYTES: Final = 8 * 1024  # 8 KiB


def check_entry_size(raw: bytes) -> str | None:
    if len(raw) > MAX_ENTRY_BYTES:
        return f"is {format_bytes(len(raw))}; brmem entries are capped at 1 MiB"
    return None


def check_entry_not_binary(raw: bytes) -> str | None:
    head = raw[:BINARY_SNIFF_BYTES]
    offset = head.find(b"\x00")
    if offset == -1:
        return None
    return f"appears to be binary (NUL byte at offset {offset})"


def format_bytes(n: int) -> str:
    if n < 1024:
        return f"{n} B"
    if n < 1024 * 1024:
        return f"{n // 1024} KiB"
    if n < 1024**3:
        return f"{n / (1024 * 1024):.1f} MiB"
    return f"{n / (1024**3):.1f} GiB"
