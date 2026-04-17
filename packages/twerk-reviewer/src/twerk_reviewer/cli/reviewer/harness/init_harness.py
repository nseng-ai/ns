"""Interactive ``reviewer harness init`` command.

This is a plain ``click.command``, not a ``clinkr_operation``, because it
prompts the user. Keeping it off clinkr's operation scanner also keeps it
out of the auto-mounted ``json`` subgroup.
"""

from __future__ import annotations

import click

from twerk_reviewer.cli.reviewer.context import load_reviewer_context
from twerk_reviewer.gateways.harness_config.gateway import ReviewerConfig, config_path
from twerk_reviewer.git_toplevel import git_toplevel
from twerk_reviewer.harness_registry import HARNESS_ADAPTERS
from twerk_reviewer.models import ReviewerFailure


@click.command(name="init", help="Detect harnesses, prompt for a choice, and persist it.")
@click.option(
    "--harness",
    "requested_name",
    default=None,
    help="Skip the prompt and persist this harness name directly.",
)
@click.pass_context
def init_harness(ctx: click.Context, requested_name: str | None) -> None:
    reviewer_context = load_reviewer_context(ctx)

    repo_root = git_toplevel(cwd=reviewer_context.cwd)
    if isinstance(repo_root, ReviewerFailure):
        raise click.ClickException(repo_root.message)

    detections = []
    for adapter in HARNESS_ADAPTERS.values():
        detection = reviewer_context.harness_detection.detect(
            name=adapter.name,
            binary=adapter.binary,
        )
        detections.append((adapter, detection))

    available_names = [adapter.name for adapter, detection in detections if detection.available]

    if requested_name is not None:
        chosen = requested_name.strip()
        if chosen not in HARNESS_ADAPTERS:
            known = ", ".join(sorted(HARNESS_ADAPTERS))
            raise click.ClickException(f"Unknown harness {chosen!r}. Known: {known}.")
    else:
        click.echo("Detected harnesses:")
        for adapter, detection in detections:
            status = detection.path or "not found"
            click.echo(f"  - {adapter.name} ({adapter.binary}): {status}")

        if not available_names:
            raise click.ClickException(
                "No harnesses detected on PATH. Install one (e.g. Claude Code) and re-run."
            )

        if len(available_names) == 1:
            chosen = available_names[0]
            click.echo(f"Selecting the only available harness: {chosen}")
        else:
            chosen = click.prompt(
                "Select a harness",
                type=click.Choice(available_names),
                default=available_names[0],
            )

    save_result = reviewer_context.harness_config.save(
        repo_root,
        ReviewerConfig(harness_name=chosen),
    )
    if isinstance(save_result, ReviewerFailure):
        raise click.ClickException(save_result.message)

    click.echo(f"Persisted harness {chosen!r} to {config_path(repo_root)}.")
