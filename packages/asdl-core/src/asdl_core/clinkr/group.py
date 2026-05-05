from __future__ import annotations

import json
from collections.abc import Callable, Sequence
from typing import Any

import click

from asdl_core.clinkr.command import emit_machine_envelope
from asdl_core.clinkr.context import MACHINE_FORMAT_PARAM_NAME, set_machine_mode
from asdl_core.clinkr.exit import ClinkrExit, ExitStatus
from asdl_core.clinkr.failure import ClinkrFailure
from asdl_core.clinkr.json_schema import build_json_schema_document
from asdl_core.clinkr.operation import ClinkrOperationMeta, get_operation_meta
from asdl_core.clinkr.params import build_request_from_click_params, extract_click_params
from asdl_core.clinkr.rendering import default_human_renderer


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
            _register_operation(self, op_fn, meta)

    # -- alias handling (ported from AliasedGroup) --

    def add_alias(self, canonical: str, alias: str) -> None:
        self._aliases[alias] = canonical

    def get_command(self, ctx: click.Context, cmd_name: str) -> click.Command | None:
        return super().get_command(ctx, self._aliases.get(cmd_name, cmd_name))

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


def _register_operation(
    group: ClinkrGroup,
    operation: Callable[..., Any],
    meta: ClinkrOperationMeta,
) -> None:
    """Wire up human and machine Click commands for a single operation."""
    help_text = meta.help or operation.__doc__ or ""
    renderer = meta.human_renderer or default_human_renderer
    request_type = meta.request_type
    result_type = meta.result_type

    # -- build human command --
    params = extract_click_params(request_type)
    inject_format_option = not _has_option(params, "--format")

    @click.pass_context
    def human_callback(ctx: click.Context, **kwargs: Any) -> None:
        format_mode = kwargs.pop(MACHINE_FORMAT_PARAM_NAME, "human")

        request = build_request_from_click_params(request_type, kwargs)

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
                f"operation '{meta.name}' did not return a ClinkrExit; got {type(result).__name__}"
            )
        if result.status is ExitStatus.OK:
            assert result.data is not None
            renderer(result.data)
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
    params.append(_build_schema_option(request_type, result_type))

    human_cmd = click.Command(
        name=meta.name,
        callback=human_callback,
        params=params,
        help=help_text,
    )

    # -- register --
    group.add_command(human_cmd, meta.name)
    for alias in meta.aliases:
        group._aliases[alias] = meta.name


def _has_option(params: list[click.Parameter], flag: str) -> bool:
    """Return True if any param in ``params`` declares ``flag`` as an option flag."""
    for param in params:
        if isinstance(param, click.Option) and flag in param.opts:
            return True
    return False


def _build_format_option() -> click.Parameter:
    """Build the framework-injected ``--format`` option.

    ``--format json`` dispatches the operation through the machine-envelope
    path on the same command. ``--format markdown`` uses the human renderer;
    markdown-oriented commands render markdown there.
    """
    return click.Option(
        ["--format", MACHINE_FORMAT_PARAM_NAME],
        type=click.Choice(["human", "json", "markdown"]),
        default="human",
        show_default=True,
        help=(
            "Output format. 'json' emits the machine envelope for scripting; "
            "'markdown' uses the command's human renderer."
        ),
    )


def _build_schema_option(
    request_type: type,
    result_type: Any,
) -> click.Parameter:
    """Build the framework-injected ``--schema`` option.

    Eager (mirrors ``--help``): prints the JSON Schema document for the
    command's input/output shapes before required-argument validation runs,
    then exits 0.
    """

    def _print_schema(ctx: click.Context, _param: click.Parameter, value: bool) -> None:
        if not value or ctx.resilient_parsing:
            return
        schema_doc = build_json_schema_document(
            request_type=request_type,
            result_type=result_type,
        )
        click.echo(json.dumps(schema_doc, indent=2))
        ctx.exit(0)

    return click.Option(
        ["--schema"],
        is_flag=True,
        is_eager=True,
        expose_value=False,
        callback=_print_schema,
        help="Print the JSON Schema for this command's input/output and exit.",
    )
