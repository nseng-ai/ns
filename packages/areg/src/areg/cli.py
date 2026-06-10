from __future__ import annotations

import click

from asdl_core.cli_runtime import add_runtime_option
from areg.check.runner import check_cmd
from areg.context import AregContext
from areg.gateways.environment.real import RealAregEnvironment
from areg.gateways.gh.real import RealGhCli
from areg.gateways.npx_skills.real import RealNpxSkills
from areg.gateways.skillx_workspace.real import RealSkillxWorkspaceInstaller
from areg.init_project import init_project_cmd
from areg.skillx import exec_group
from areg.update_skills import update_skills_cmd


@click.group()
@click.pass_context
def main(ctx: click.Context) -> None:
    """areg CLI."""
    if ctx.obj is None:
        npx_skills = RealNpxSkills()
        ctx.obj = AregContext(
            gh=RealGhCli(),
            npx_skills=npx_skills,
            environment=RealAregEnvironment(),
            skillx_workspace=RealSkillxWorkspaceInstaller(npx_skills=npx_skills),
        )


add_runtime_option(main, runtime="python", entry_point="areg.cli:main")
main.add_command(init_project_cmd)
main.add_command(check_cmd)
main.add_command(exec_group)
main.add_command(update_skills_cmd)

if __name__ == "__main__":
    main()
