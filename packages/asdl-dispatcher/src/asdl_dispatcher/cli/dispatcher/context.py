"""Build and load the typed dispatcher CLI context."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class DispatcherCliContext:
    """Typed context for the ``dispatcher`` CLI."""


def build_dispatcher_context() -> DispatcherCliContext:
    """Assemble a :class:`DispatcherCliContext` from real gateways."""
    return DispatcherCliContext()
