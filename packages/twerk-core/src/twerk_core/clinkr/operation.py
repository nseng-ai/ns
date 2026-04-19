from __future__ import annotations

import inspect
import types
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Union, get_args, get_origin, get_type_hints

import click

from twerk_core.clinkr.command import ClinkrCommandError

_META_ATTR = "_clinkr_operation_meta"


@dataclass(frozen=True)
class ClinkrOperationMeta:
    """Metadata attached to a decorated operation function."""

    name: str
    help: str
    request_type: type
    result_types: tuple[type, ...]
    aliases: tuple[str, ...]
    human_renderer: Callable[..., None] | None
    exit_false_field: str | None = None


def clinkr_operation(
    *,
    name: str,
    help: str = "",
    aliases: tuple[str, ...] = (),
    human_renderer: Callable[..., None] | None = None,
    exit_false_field: str | None = None,
) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    """Decorator that marks a function as a clinkr operation.

    The decorated function must accept exactly two parameters:
    ``(ctx: click.Context, request: <RequestType>)``. Clinkr threads the
    active Click context in; operations must never fetch it from globals.
    ``request_type`` and ``result_types`` are inferred from the function's
    type annotations.

    When ``exit_false_field`` is provided, the human-mode dispatcher gives
    the operation grep/diff/test exit semantics: exit 0 when the named
    boolean field on the result is ``True``, exit 1 (silent stdout, stderr
    line drawn from ``result.absent_message``) when it is ``False``, and
    exit 2 on :class:`ClinkrCommandError`. JSON mode is unchanged.
    """

    def decorator(fn: Callable[..., Any]) -> Callable[..., Any]:
        request_type, result_types = _extract_types_from_hints(fn)
        setattr(
            fn,
            _META_ATTR,
            ClinkrOperationMeta(
                name=name,
                help=help,
                request_type=request_type,
                result_types=result_types,
                aliases=aliases,
                human_renderer=human_renderer,
                exit_false_field=exit_false_field,
            ),
        )
        return fn

    return decorator


def get_operation_meta(fn: Any) -> ClinkrOperationMeta | None:
    """Retrieve clinkr operation metadata from a function, if present."""
    return getattr(fn, _META_ATTR, None)


def _extract_types_from_hints(
    fn: Callable[..., Any],
) -> tuple[type, tuple[type, ...]]:
    """Infer ``(request_type, result_types)`` from a function's type annotations.

    The function must accept exactly two parameters — ``ctx: click.Context``
    followed by the request dataclass — and have a return annotation.  If the
    return type is a Union containing ``ClinkrCommandError``, the error type
    is filtered out and the remaining types become ``result_types``.
    """
    fn_name = getattr(fn, "__qualname__", repr(fn))
    hints = get_type_hints(fn)
    params = list(inspect.signature(fn).parameters.values())

    if len(params) != 2:
        raise TypeError(
            f"clinkr_operation function {fn_name} must accept "
            f"exactly two parameters (click.Context, request), got {len(params)}"
        )

    ctx_param, request_param = params
    if ctx_param.name not in hints:
        raise TypeError(
            f"clinkr_operation function {fn_name}: "
            f"parameter '{ctx_param.name}' must have a type annotation"
        )
    if hints[ctx_param.name] is not click.Context:
        raise TypeError(
            f"clinkr_operation function {fn_name}: first parameter "
            f"'{ctx_param.name}' must be annotated as click.Context, "
            f"got {hints[ctx_param.name]!r}"
        )

    if request_param.name not in hints:
        raise TypeError(
            f"clinkr_operation function {fn_name}: "
            f"parameter '{request_param.name}' must have a type annotation"
        )
    request_type = hints[request_param.name]

    if "return" not in hints:
        raise TypeError(f"clinkr_operation function {fn_name} must have a return type annotation")

    return_hint = hints["return"]
    origin = get_origin(return_hint)

    if origin is Union or origin is types.UnionType:
        args = get_args(return_hint)
        result_types = tuple(a for a in args if a is not ClinkrCommandError)
        if not result_types:
            raise TypeError(
                f"clinkr_operation function {fn_name}: "
                "return type union contains only ClinkrCommandError"
            )
    elif isinstance(return_hint, type) and return_hint is not ClinkrCommandError:
        result_types = (return_hint,)
    else:
        raise TypeError(
            f"clinkr_operation function {fn_name}: "
            f"cannot infer result_types from return annotation {return_hint}"
        )

    return request_type, result_types
