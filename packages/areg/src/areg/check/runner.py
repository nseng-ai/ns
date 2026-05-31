from __future__ import annotations

from collections.abc import Sequence
from pathlib import Path

import click

from areg.check.base import ProjectCheck, SkillCheck
from areg.check.context import build_context
from areg.check.models import CheckResult, SkillIssue
from areg.check.registry import DEFAULT_PROJECT_CHECKS, DEFAULT_SKILL_CHECKS


def check_project(
    project_dir: Path,
    skill_checks: Sequence[SkillCheck],
    project_checks: Sequence[ProjectCheck],
) -> CheckResult:
    ctx = build_context(project_dir)
    issues: list[SkillIssue] = []
    for skill in ctx.skills:
        for chk in skill_checks:
            if skill.source_type in chk.source_types:
                issues.extend(chk.run(ctx, skill))
    for chk in project_checks:
        issues.extend(chk.run(ctx))
    return CheckResult(issues=issues)


def format_result(result: CheckResult) -> None:
    if result.ok:
        click.echo("All skills OK.")
        return

    by_skill: dict[str, list[SkillIssue]] = {}
    for issue in result.issues:
        by_skill.setdefault(issue.skill_name, []).append(issue)

    for skill_name, issues in sorted(by_skill.items()):
        click.echo(f"\n{skill_name}:")
        for issue in issues:
            click.echo(f"  {issue.message}")

    click.echo(f"\n{len(result.issues)} error(s)")


@click.command("check")
@click.option(
    "--path",
    type=click.Path(exists=True, file_okay=False, resolve_path=True),
    default=".",
    help="Project directory to check (default: current directory).",
)
def check_cmd(path: str) -> None:
    """Check that skills follow areg conventions."""
    result = check_project(Path(path), DEFAULT_SKILL_CHECKS, DEFAULT_PROJECT_CHECKS)
    format_result(result)
    if not result.ok:
        raise SystemExit(1)
