"""Resolve a brmem prompt file with project-local + global fallback."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Annotated, Any, Literal

import click

from brmem.gateway_access import get_git_gateway, get_home_root
from twerk_core.clinkr.dataclass_json import JsonSerializable
from twerk_core.clinkr.ensure import Ensure
from twerk_core.clinkr.exit import ClinkrExit
from twerk_core.clinkr.operation import clinkr_operation


@dataclass(frozen=True)
class ResolvePromptRequest:
    name: Annotated[
        str,
        click.Argument(["name"], type=click.STRING),
    ]


@dataclass(frozen=True)
class ResolvePromptResult(JsonSerializable):
    path: Path
    tier: Literal["project", "global"]

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "path": str(self.path),
            "tier": self.tier,
        }


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
    git_gateway = get_git_gateway(ctx)
    cwd = Path.cwd()

    Ensure.true(
        git_gateway.get_git_common_dir(cwd) is not None,
        error_type="not-a-git-repo",
        message=(
            f"Not inside a git repository: {cwd}. "
            "`brmem exec resolve-prompt` requires a git repo to resolve the project-local "
            "prompt path; run it from inside a checkout."
        ),
    )

    repo_root = git_gateway.get_repository_root(cwd)
    home_root = get_home_root(ctx)

    project_path = repo_root / ".brmem" / "prompts" / f"{request.name}.md"
    global_path = home_root / ".brmem" / "prompts" / f"{request.name}.md"

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
            "Initialize the global default by running `just install-tools` from a twerk checkout, "
            "or copy a packaged `default-prompt.md` to one of the paths above."
        ),
    )
