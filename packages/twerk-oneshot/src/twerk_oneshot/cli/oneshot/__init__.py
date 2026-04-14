"""Queue one-shot remote work."""

from __future__ import annotations

import subprocess

import click

from twerk_core.clinkr.group import ClinkrGroup, clinkr_group
from twerk_oneshot.cli.oneshot.gateway_access import (
    get_execution_backend,
    get_now,
    get_queue_gateway,
)
from twerk_oneshot.queue_service import QueueOneshotRequest, queue_oneshot


@clinkr_group(help="Queue one-shot remote work.")
def oneshot() -> ClinkrGroup:
    """Return the `twerk oneshot` subgroup."""
    group = ClinkrGroup(
        invoke_without_command=True,
        no_args_is_help=True,
        callback=click.pass_context(_run_oneshot),
        params=[
            click.Option(
                ["-p", "--prompt"],
                type=str,
                help="Prompt to queue for remote execution.",
            ),
        ],
    )
    group._json_group.hidden = True
    return group


def _run_oneshot(ctx: click.Context, prompt: str | None) -> None:
    ctx.ensure_object(dict)
    if ctx.invoked_subcommand is not None:
        return
    if prompt is None:
        raise click.UsageError("Provide `-p` or `--prompt` to queue remote work.")

    try:
        result = queue_oneshot(
            QueueOneshotRequest(prompt=prompt),
            queue_gateway=get_queue_gateway(),
            execution_backend=get_execution_backend(),
            now=get_now(),
        )
    except ValueError as error:
        raise click.ClickException(str(error)) from error
    except subprocess.CalledProcessError as error:
        stderr = error.stderr.strip() if error.stderr else str(error)
        raise click.ClickException(stderr) from error
    except RuntimeError as error:
        raise click.ClickException(str(error)) from error

    click.echo("Queued oneshot.")
    click.echo(f"Branch: {result.branch_name}")
    click.echo(f"PR: {result.pr_url}")
    click.echo(f"Run: {result.run_url}")
