"""Runtime context for hidden root asdl exec commands."""

from __future__ import annotations

from dataclasses import dataclass

import click

from asdl_core.clinkr.context import ClinkrContextObject, load_typed_context
from asdl_tools.cmux.gateway import CmuxGateway, RealCmuxGateway


@dataclass(frozen=True)
class AsdlExecContext:
    cmux: CmuxGateway


def build_asdl_exec_context() -> AsdlExecContext:
    return AsdlExecContext(cmux=RealCmuxGateway())


def load_asdl_exec_context(ctx: click.Context) -> AsdlExecContext:
    return load_typed_context(ctx, AsdlExecContext)


def has_clinkr_context(ctx: click.Context) -> bool:
    return ctx.find_object(ClinkrContextObject) is not None
