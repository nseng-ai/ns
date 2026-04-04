from __future__ import annotations

import inspect
import types
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Union, get_args, get_origin, get_type_hints

from clinkr.command import ClinkrCommandError

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


def clinkr_operation(
    *,
    name: str,
    help: str = "",
    aliases: tuple[str, ...] = (),
    human_renderer: Callable[..., None] | None = None,
) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    """Decorator that marks a function as a clinkr operation.

    ``request_type`` and ``result_types`` are inferred from the function's
    type annotations.
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

    The function must have exactly one parameter (the request) and a return
    annotation.  If the return type is a Union containing
    ``ClinkrCommandError``, the error type is filtered out and the remaining
    types become ``result_types``.
    """
    hints = get_type_hints(fn)
    params = list(inspect.signature(fn).parameters.values())

    if len(params) != 1:
        raise TypeError(
            f"clinkr_operation function {fn.__qualname__} must accept "
            f"exactly one parameter (the request), got {len(params)}"
        )

    request_param = params[0]
    if request_param.name not in hints:
        raise TypeError(
            f"clinkr_operation function {fn.__qualname__}: "
            f"parameter '{request_param.name}' must have a type annotation"
        )
    request_type = hints[request_param.name]

    if "return" not in hints:
        raise TypeError(
            f"clinkr_operation function {fn.__qualname__} must have a return type annotation"
        )

    return_hint = hints["return"]
    origin = get_origin(return_hint)

    if origin is Union or origin is types.UnionType:
        args = get_args(return_hint)
        result_types = tuple(a for a in args if a is not ClinkrCommandError)
        if not result_types:
            raise TypeError(
                f"clinkr_operation function {fn.__qualname__}: "
                "return type union contains only ClinkrCommandError"
            )
    elif isinstance(return_hint, type) and return_hint is not ClinkrCommandError:
        result_types = (return_hint,)
    else:
        raise TypeError(
            f"clinkr_operation function {fn.__qualname__}: "
            f"cannot infer result_types from return annotation {return_hint}"
        )

    return request_type, result_types
