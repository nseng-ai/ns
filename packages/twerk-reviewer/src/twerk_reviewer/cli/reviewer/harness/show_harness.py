from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import click

from twerk_core.clinkr.command import ClinkrCommandError
from twerk_core.clinkr.operation import clinkr_operation
from twerk_reviewer.cli.reviewer.context import load_reviewer_context
from twerk_reviewer.gateways.harness_config.gateway import config_path
from twerk_reviewer.git_toplevel import git_toplevel
from twerk_reviewer.models import ReviewerFailure


@dataclass(frozen=True)
class HarnessShowRequest:
    pass


@dataclass(frozen=True)
class HarnessShowResult:
    harness_name: str
    config_path: str

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "harness_name": self.harness_name,
            "config_path": self.config_path,
        }


def render_harness_show(result: HarnessShowResult) -> None:
    click.echo(f"Harness: {result.harness_name}")
    click.echo(f"Config: {result.config_path}")


@clinkr_operation(
    name="show",
    help="Print the persisted harness selection.",
    human_renderer=render_harness_show,
)
def run_harness_show_command(
    ctx: click.Context,
    request: HarnessShowRequest,
) -> HarnessShowResult | ClinkrCommandError:
    reviewer_context = load_reviewer_context(ctx)

    repo_root = git_toplevel(cwd=reviewer_context.cwd)
    if isinstance(repo_root, ReviewerFailure):
        return ClinkrCommandError(error_type=repo_root.error_type, message=repo_root.message)

    config = reviewer_context.harness_config.load(repo_root)
    if isinstance(config, ReviewerFailure):
        return ClinkrCommandError(error_type=config.error_type, message=config.message)

    return HarnessShowResult(
        harness_name=config.harness_name,
        config_path=str(config_path(repo_root)),
    )
