from __future__ import annotations

import copy
import json
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from functools import cache
from typing import Annotated, Any, TypeGuard, get_args, get_origin, get_type_hints

import click
from pydantic import BaseModel

from asdl_core.clinkr.command import emit_machine_envelope
from asdl_core.clinkr.context import MACHINE_FORMAT_PARAM_NAME, set_machine_mode
from asdl_core.clinkr.exit import ClinkrExit, ExitStatus
from asdl_core.clinkr.failure import ClinkrFailure
from asdl_core.clinkr.json_schema import build_json_schema_document
from asdl_core.clinkr.operation import ClinkrOperationMeta, get_operation_meta
from asdl_core.clinkr.rendering import default_human_renderer

_PYTHON_TO_CLICK_TYPE: dict[type, click.ParamType] = {
    str: click.STRING,
    int: click.INT,
    float: click.FLOAT,
    bool: click.BOOL,
}

_MISSING = object()


@dataclass(frozen=True)
class RequestField:
    name: str
    has_default: bool
    default: Any = _MISSING


class ClinkrGroup(click.Group):
    """A Click group that registers clinkr operations and supports command aliases.

    All operations must be provided at construction time via the
    ``operations`` parameter. The group is immutable after ``__init__``.
    """

    def __init__(
        self,
        name: str | None = None,
        *,
        operations: Sequence[Callable[..., Any]] = (),
        hidden: bool = False,
        **kwargs: Any,
    ) -> None:
        super().__init__(name, hidden=hidden, **kwargs)
        self._aliases: dict[str, str] = {}

        for op_fn in operations:
            meta = get_operation_meta(op_fn)
            if meta is None:
                raise TypeError(f"{op_fn!r} is not decorated with @clinkr_operation")
            self._register_operation(op_fn, meta)

    # -- alias handling (ported from AliasedGroup) --

    def add_alias(self, canonical: str, alias: str) -> None:
        self._aliases[alias] = canonical

    def get_command(self, ctx: click.Context, cmd_name: str) -> click.Command | None:
        return super().get_command(ctx, self._aliases.get(cmd_name, cmd_name))

    # -- operation registration --

    def _register_operation(
        self,
        operation: Callable[..., Any],
        meta: ClinkrOperationMeta,
    ) -> None:
        """Wire up human and machine Click commands for a single operation."""
        help_text = meta.help or operation.__doc__ or ""
        human_renderer = meta.human_renderer or default_human_renderer
        markdown_renderer = meta.markdown_renderer
        request_type = meta.request_type
        result_type = meta.result_type

        params = _build_click_params(request_type)
        inject_format_option = not _has_option(params, "--format")

        @click.pass_context
        def human_callback(ctx: click.Context, **kwargs: Any) -> None:
            format_mode = kwargs.pop(MACHINE_FORMAT_PARAM_NAME, "human")

            request = _build_request_from_click_params(request_type, kwargs)

            if format_mode == "json":
                set_machine_mode(ctx)
                try:
                    result = operation(ctx, request)
                except ClinkrFailure as fail:
                    result = ClinkrExit.failure(error_type=fail.error_type, message=fail.message)
                except ClinkrExit as exit_result:
                    result = exit_result
                emit_machine_envelope(result)
                return

            try:
                result = operation(ctx, request)
            except ClinkrFailure as fail:
                result = ClinkrExit.failure(error_type=fail.error_type, message=fail.message)
            except ClinkrExit as exit_result:
                result = exit_result
            if not isinstance(result, ClinkrExit):
                raise click.ClickException(
                    f"operation '{meta.name}' did not return a ClinkrExit; "
                    f"got {type(result).__name__}"
                )
            if result.status is ExitStatus.OK:
                assert result.data is not None
                if format_mode in ("markdown", "md") and markdown_renderer is not None:
                    markdown_renderer(result.data)
                else:
                    human_renderer(result.data)
                return
            if result.status is ExitStatus.NEGATIVE:
                if result.message is not None:
                    click.echo(result.message, err=True)
                ctx.exit(1)
            # FAILURE
            click.echo(f"error: {result.message}", err=True)
            ctx.exit(2)

        if inject_format_option:
            params.append(_build_format_option())
        if not _has_option(params, "--json-schema"):
            params.append(_build_json_schema_option(request_type, result_type))

        human_cmd = click.Command(
            name=meta.name,
            callback=human_callback,
            params=params,
            help=help_text,
        )

        self.add_command(human_cmd, meta.name)
        for alias in meta.aliases:
            self.add_alias(meta.name, alias)

    # -- help formatting with aliases --

    def format_commands(self, ctx: click.Context, formatter: click.HelpFormatter) -> None:
        reverse: dict[str, list[str]] = {}
        for alias, canonical in self._aliases.items():
            reverse.setdefault(canonical, []).append(alias)

        rows = []
        for subcommand in self.list_commands(ctx):
            if subcommand in self._aliases:
                continue
            cmd = self.get_command(ctx, subcommand)
            if cmd is None or cmd.hidden:
                continue
            aliases = reverse.get(subcommand, [])
            label = f"{subcommand} ({', '.join(aliases)})" if aliases else subcommand
            rows.append((label, cmd.get_short_help_str(limit=150)))

        if rows:
            with formatter.section("Commands"):
                formatter.write_dl(rows)


# -- private helpers ----------------------------------------------------------


def _build_click_params(request_type: type) -> list[click.Parameter]:
    fields = _request_fields(request_type)
    hints = _request_type_hints(request_type)

    arguments: list[click.Parameter] = []
    options: list[click.Parameter] = []

    for field in fields:
        hint = hints.get(field.name, str)
        param = _extract_annotated_param(field, hint)
        if param is None:
            param = _infer_param(field, hint)

        if isinstance(param, click.Argument):
            arguments.append(param)
        else:
            options.append(param)

    return [*arguments, *options]


def _build_request_from_click_params(request_type: type, kwargs: dict[str, Any]) -> Any:
    field_names = {field.name for field in _request_fields(request_type)}
    mapped = {}
    for key, value in kwargs.items():
        name = key.replace("-", "_")
        if name in field_names:
            mapped[name] = value

    if not _is_pydantic_model_type(request_type):
        raise TypeError(
            f"request type {request_type.__name__} must be a Pydantic BaseModel subclass"
        )
    return request_type.model_validate(mapped)


def _request_fields(request_type: type) -> tuple[RequestField, ...]:
    if not _is_pydantic_model_type(request_type):
        raise TypeError(
            f"request type {request_type.__name__} must be a Pydantic BaseModel subclass"
        )

    return tuple(
        RequestField(
            name=name,
            has_default=not field_info.is_required(),
            default=(
                field_info.get_default(call_default_factory=True)
                if not field_info.is_required()
                else _MISSING
            ),
        )
        for name, field_info in request_type.model_fields.items()
    )


@cache
def _request_type_hints(request_type: type) -> dict[str, Any]:
    return get_type_hints(request_type, include_extras=True)


def _extract_annotated_param(field: RequestField, hint: Any) -> click.Parameter | None:
    if get_origin(hint) is not Annotated:
        return None

    args = get_args(hint)
    for meta in args[1:]:
        if isinstance(meta, (click.Argument, click.Option)):
            param = copy.copy(meta)
            param.name = field.name
            inner_type = args[0]
            if param.type is None or isinstance(param.type, click.STRING.__class__):
                inferred = _PYTHON_TO_CLICK_TYPE.get(inner_type)
                if inferred is not None and inferred is not click.STRING:
                    param.type = inferred
            if param.default is None and field.has_default:
                param.default = field.default
            return param
    return None


def _infer_param(field: RequestField, hint: Any) -> click.Parameter:
    inner_type = _unwrap_annotated(hint)
    click_type = _PYTHON_TO_CLICK_TYPE.get(inner_type, click.STRING)

    if field.has_default:
        default = field.default
        if inner_type is bool and default is False:
            return click.Option(
                [f"--{field.name.replace('_', '-')}"],
                is_flag=True,
                default=False,
                help=None,
            )
        return click.Option(
            [f"--{field.name.replace('_', '-')}"],
            type=click_type,
            default=default,
            help=None,
        )

    return click.Argument(
        [field.name],
        type=click_type,
    )


def _unwrap_annotated(hint: Any) -> Any:
    if get_origin(hint) is Annotated:
        return get_args(hint)[0]
    return hint


def _has_option(params: list[click.Parameter], flag: str) -> bool:
    """Return True if any param in ``params`` declares ``flag`` as an option flag."""
    for param in params:
        if isinstance(param, click.Option) and flag in param.opts:
            return True
    return False


def _build_format_option() -> click.Parameter:
    """Build the framework-injected ``--format`` option.

    ``--format json`` dispatches the operation through the machine-envelope
    path on the same command. ``--format markdown`` and its ``md`` alias use
    the command's ``markdown_renderer`` when one is registered; otherwise
    they fall back to the human renderer (preserving the behavior of commands
    that render Markdown directly from their human renderer).
    """
    return click.Option(
        ["--format", MACHINE_FORMAT_PARAM_NAME],
        type=click.Choice(["human", "json", "markdown", "md"]),
        default="human",
        show_default=True,
        help=(
            "Output format. 'json' emits the machine envelope for scripting; "
            "'markdown'/'md' uses the command's markdown renderer when set, "
            "otherwise falls back to the human renderer."
        ),
    )


def _build_json_schema_option(
    request_type: type,
    result_type: Any,
) -> click.Parameter:
    """Build the framework-injected ``--json-schema`` option.

    Eager (mirrors ``--help``): prints the JSON Schema document for the
    command's input/output shapes before required-argument validation runs,
    then exits 0.
    """

    def _print_json_schema(ctx: click.Context, _param: click.Parameter, value: bool) -> None:
        if not value or ctx.resilient_parsing:
            return
        json_schema_doc = build_json_schema_document(
            request_type=request_type,
            result_type=result_type,
        )
        click.echo(json.dumps(json_schema_doc, indent=2))
        ctx.exit(0)

    return click.Option(
        ["--json-schema"],
        is_flag=True,
        is_eager=True,
        expose_value=False,
        callback=_print_json_schema,
        help="Print the JSON Schema for this command's input/output and exit.",
    )


def _is_pydantic_model_type(value: Any) -> TypeGuard[type[BaseModel]]:
    return isinstance(value, type) and issubclass(value, BaseModel)
