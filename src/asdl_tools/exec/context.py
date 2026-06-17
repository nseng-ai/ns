"""Runtime context for hidden root asdl exec commands."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

import click

from asdl_core.clinkr.context import ClinkrContextObject, load_typed_context
from asdl_core.gh.pr_gateway import PRGateway, RealPRGateway
from asdl_tools.cmux.gateway import CmuxGateway, RealCmuxGateway


def _real_pr_gateway(repo: str | None) -> PRGateway:
    return RealPRGateway(repo=repo)


@dataclass(frozen=True)
class AsdlExecContext:
    cmux: CmuxGateway
    pr_gateway: Callable[[str | None], PRGateway] = _real_pr_gateway


def build_asdl_exec_context() -> AsdlExecContext:
    return AsdlExecContext(cmux=RealCmuxGateway())


def load_asdl_exec_context(ctx: click.Context) -> AsdlExecContext:
    return load_typed_context(ctx, AsdlExecContext)


def has_clinkr_context(ctx: click.Context) -> bool:
    return ctx.find_object(ClinkrContextObject) is not None
