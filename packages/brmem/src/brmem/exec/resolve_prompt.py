"""Resolve a brmem prompt file with project-local + global fallback."""

from __future__ import annotations

from pathlib import Path
from typing import Annotated, Literal

import click

from asdl_core.clinkr.context import load_typed_context
from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from brmem.context import BrmemCliContext


class ResolvePromptRequest(ClinkrModel):
    name: Annotated[
        str,
        click.Argument(["name"], type=click.STRING),
    ]


class ResolvePromptResult(ClinkrModel):
    path: Path
    tier: Literal["project", "global"]


def render_resolve_prompt(result: ResolvePromptResult) -> None:
    click.echo(str(result.path))
    click.echo(f"tier: {result.tier}", err=True)


@clinkr_operation(
    name="resolve-prompt",
    help=(
        "Resolve a brmem prompt file. Prefers <repo-root>/.brmem/prompts/<name>.md; "
        "falls back to ~/.brmem/prompts/<name>.md."
    ),
    human_renderer=render_resolve_prompt,
)
def run_resolve_prompt(
    ctx: click.Context,
    request: ResolvePromptRequest,
) -> ClinkrExit[ResolvePromptResult]:
    brmem_context = load_typed_context(ctx, BrmemCliContext)
    cwd = Path.cwd()

    Ensure.true(
        brmem_context.git_gateway.get_git_common_dir(cwd) is not None,
        error_type="not-a-git-repo",
        message=(
            f"Not inside a git repository: {cwd}. "
            "`brmem exec resolve-prompt` requires a git repo to resolve the project-local "
            "prompt path; run it from inside a checkout."
        ),
    )

    repo_root = brmem_context.git_gateway.get_repository_root(cwd)

    project_path = repo_root / ".brmem" / "prompts" / f"{request.name}.md"
    global_path = brmem_context.home_root / ".brmem" / "prompts" / f"{request.name}.md"

    if project_path.exists():
        return ClinkrExit.ok(ResolvePromptResult(path=project_path, tier="project"))
    if global_path.exists():
        return ClinkrExit.ok(ResolvePromptResult(path=global_path, tier="global"))

    Ensure.fail(
        error_type="prompt-not-found",
        message=(
            f"No prompt named {request.name!r} found. Checked:\n"
            f"  - {project_path} (project-local)\n"
            f"  - {global_path} (global)\n"
            "Initialize the global default by running `just install-tools` from a asdl checkout, "
            "or copy a packaged `default-prompt.md` to one of the paths above."
        ),
    )
