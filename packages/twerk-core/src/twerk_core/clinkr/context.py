"""Generic typed-context loader for ClinkrGroup-backed CLIs."""

from __future__ import annotations

from typing import TypeVar

import click

T = TypeVar("T")


def load_typed_context(ctx: click.Context, context_type: type[T]) -> T:
    """Unpack a typed CLI context from ``ctx.obj``.

    ``ctx.obj`` must be a zero-argument callable returning a ``context_type``
    instance. CLI entry points install the real factory
    (``build_cli()(obj=build_x_context)``); tests install
    ``lambda: fake_context``. Help paths never reach this function.
    """
    ctx_fn = ctx.obj
    if not callable(ctx_fn):
        raise RuntimeError(
            f"ctx.obj must be a Callable[[], {context_type.__name__}]; "
            "the CLI entry point and tests are responsible for installing it."
        )
    result = ctx_fn()
    if not isinstance(result, context_type):
        raise RuntimeError(
            f"ctx_fn returned {type(result).__name__}, expected {context_type.__name__}."
        )
    return result
