"""Hidden exec operation for resolving repo-local asdl prompt content."""

from __future__ import annotations

from pathlib import Path
from typing import Annotated

import click

from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_core.git.construction import resolve_repo_root
from asdl_core.prompts.errors import PromptError
from asdl_core.prompts.models import PromptResolution
from asdl_core.prompts.resolver import resolve_prompt


class ResolvePromptRequest(ClinkrModel):
    name: Annotated[
        str,
        click.Argument(["name"], type=click.STRING),
    ]
    repo_root: Annotated[
        Path | None,
        click.Option(
            ["--repo-root"],
            type=click.Path(path_type=Path, file_okay=False, dir_okay=True),
            default=None,
            help="Repository root containing .asdl/prompts. Defaults to the current git repo root.",
        ),
    ] = None


class ResolvePromptProvenanceDto(ClinkrModel):
    source: str
    repo_prompt_path: str
    prompt_path: str | None
    default_name: str | None


class ResolvePromptResult(ClinkrModel):
    name: str
    content: str
    provenance: ResolvePromptProvenanceDto


def render_resolve_prompt(result: ResolvePromptResult) -> None:
    click.echo(result.content, nl=False)
    click.echo(f"source: {result.provenance.source}", err=True)


@clinkr_operation(
    name="resolve-prompt",
    help="Resolve a checked-in .asdl prompt document with embedded fallback support.",
    human_renderer=render_resolve_prompt,
)
def run_resolve_prompt(
    ctx: click.Context,
    request: ResolvePromptRequest,
) -> ClinkrExit[ResolvePromptResult]:
    del ctx
    repo_root = _resolve_requested_repo_root(request.repo_root)
    try:
        resolution = resolve_prompt(request.name, repo_root=repo_root)
    except PromptError as error:
        raise click.ClickException(f"{error.error_type}: {error.message}") from error

    return ClinkrExit.ok(_result_dto(resolution))


def _resolve_requested_repo_root(explicit_repo_root: Path | None) -> Path:
    if explicit_repo_root is not None:
        return explicit_repo_root

    cwd = Path.cwd()
    repo_root = resolve_repo_root(cwd)
    if repo_root is not None:
        return repo_root

    raise click.ClickException(
        f"not_a_git_repo: Not inside a git repository: {cwd}. "
        "Run from a checkout or pass --repo-root."
    )


def _result_dto(resolution: PromptResolution) -> ResolvePromptResult:
    prompt_path = resolution.provenance.prompt_path
    return ResolvePromptResult(
        name=resolution.name,
        content=resolution.content,
        provenance=ResolvePromptProvenanceDto(
            source=resolution.provenance.source,
            repo_prompt_path=str(resolution.provenance.repo_prompt_path),
            prompt_path=str(prompt_path) if prompt_path is not None else None,
            default_name=resolution.provenance.default_name,
        ),
    )
