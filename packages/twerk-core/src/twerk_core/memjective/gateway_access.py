"""Memjective-specific constants used by the memjective CLI.

Gateway accessors are reused directly from ``twerk_core.brmem.gateway_access``;
memjective is a namespace-pinned veneer over brmem and keeps no separate
gateway wiring.
"""

from __future__ import annotations

MEMJECTIVE_NAMESPACE = "memjectives"
