"""`areg update-skills` command — refresh lockfile-tracked skills one by one.

TEMPORARY WORKAROUND. Delete this command once vercel-labs/skills#915 is fixed
upstream: https://github.com/vercel-labs/skills/issues/915

The bug: both ``npx skills update`` and ``npx skills update <skill-name>``
ignore the lockfile's curated skill set and re-install every skill that
exists in the source repo. A lockfile with a curated subset from a GitHub
source can balloon to every skill in that source repo, silently adding skills
the project never asked for and rewriting ``skills-lock.json`` to match.

The workaround: walk ``skills-lock.json`` ourselves and call
``npx skills add <source> --skill <name>`` once per entry. The ``add``
path honors ``--skill`` filtering and merges into the existing lockfile,
so the curated skill set is preserved.

Once the upstream ``update`` command respects the lockfile (or a dedicated
``skills install`` / ``skills sync`` lands — see vercel-labs/skills#283,
#549), delete this module, its tests, and the registration in
``cli.py``, and update ``skills/skill-management/SKILL.md`` section 4
to point back at ``npx skills update``.
"""

from __future__ import annotations

from pathlib import Path

import click

from areg.check.context import read_lockfile
from areg.context import AregContext
from areg.gateways.npx_skills.gateway import NpxSkillsError
from areg.preconditions import requires_npx
from areg.project_agents import resolve_project_agents


@click.command("update-skills")
@click.option(
    "--path",
    type=click.Path(exists=True, file_okay=False, resolve_path=True),
    default=".",
    help="Project directory (default: current directory).",
)
@click.option(
    "--skill",
    "skill_filter",
    multiple=True,
    help="Skill name to update (repeatable). Default: all github-sourced skills.",
)
@click.option(
    "--source",
    "source_filter",
    multiple=True,
    help="Only update skills whose lockfile source matches (repeatable).",
)
@click.option(
    "--agent",
    "agents",
    multiple=True,
    help="Agent directory to populate (repeatable). Default: read asdl.toml [areg].agents, "
    "else legacy areg.json, else 'codex claude-code'.",
)
@click.option(
    "--dry-run",
    is_flag=True,
    help="Print planned invocations without calling npx.",
)
@click.pass_obj
def update_skills_cmd(
    ctx: AregContext,
    path: str,
    skill_filter: tuple[str, ...],
    source_filter: tuple[str, ...],
    agents: tuple[str, ...],
    dry_run: bool,
) -> None:
    """Refresh GitHub-sourced skills recorded in skills-lock.json."""

    project_dir = Path(path)
    lockfile = read_lockfile(project_dir)

    github_entries: dict[str, str] = {}
    for name, raw in lockfile.items():
        if raw.get("sourceType") != "github":
            continue
        source = raw.get("source")
        if not isinstance(source, str):
            continue
        github_entries[name] = source

    if skill_filter:
        unknown = [s for s in skill_filter if s not in github_entries]
        if unknown:
            raise click.ClickException(
                "Skill(s) not found in lockfile (or not github-sourced): "
                + ", ".join(sorted(unknown))
            )
        github_entries = {k: v for k, v in github_entries.items() if k in skill_filter}

    if source_filter:
        allowed = set(source_filter)
        github_entries = {k: v for k, v in github_entries.items() if v in allowed}

    if not github_entries:
        click.echo("No github-sourced skills match. Nothing to update.")
        return

    resolved_agents = resolve_project_agents(project_dir, agents)

    click.echo(
        f"Updating {len(github_entries)} skill(s) with agents "
        f"{', '.join(resolved_agents)}" + (" [dry-run]" if dry_run else "") + ":"
    )

    if not dry_run:
        requires_npx(ctx.environment)

    failures: list[tuple[str, str]] = []
    for name in sorted(github_entries):
        source = github_entries[name]
        click.echo(f"  {name}  <-  {source}")
        if dry_run:
            continue
        try:
            ctx.npx_skills.add(
                source,
                skills=[name],
                agents=list(resolved_agents),
                cwd=project_dir,
            )
        except NpxSkillsError as e:
            failures.append((name, str(e)))
            click.echo(f"    FAILED: {e}", err=True)

    if failures:
        raise click.ClickException(
            f"{len(failures)} skill(s) failed to update: " + ", ".join(name for name, _ in failures)
        )

    if dry_run:
        click.echo(f"\nPlanned: {len(github_entries)} skill(s). No changes made.")
    else:
        click.echo(f"\nUpdated {len(github_entries)} skill(s).")
