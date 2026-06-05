# External boundary host environment gateway slice

Implemented a focused row-3 remediation slice for areg host-tool and Git-root boundaries.

## What changed

- Added an injectable `AregEnvironment` gateway with real and fake implementations.
- `AregContext` now carries `environment` alongside `GhCli` and `NpxSkills`.
- `preconditions.py` no longer calls global `shutil.which`; command preconditions require `gh`/`npx` through the injected environment gateway.
- `init_project.py` no longer shells out to Git directly; Git-root discovery is delegated to `ctx.environment.require_git_root(...)` while the root-equality policy remains in init business logic.
- Scenario precondition/init/skillx/update-skills tests now inject `FakeAregEnvironment` instead of patching global process state or running `git init` during scenario setup.
- Real gateway sanity tests cover missing `gh`, missing `npx`, missing `git`, Git command failure, empty Git root output, and successful Git-root discovery.

## Validation

- `uv run pytest packages/areg/tests/gateways/test_fakes.py packages/areg/tests/gateways/test_real_gateways.py packages/areg/tests/scenario/test_cli_preconditions.py packages/areg/tests/scenario/test_init_project.py packages/areg/tests/scenario/test_skillx_cli.py packages/areg/tests/scenario/test_update_skills.py` — passed, 119 tests.
- `uv run ruff check packages/areg/src/areg packages/areg/tests` — passed.
- `uv run ruff format --check packages/areg/src/areg packages/areg/tests` — passed.
- `uv run ty check` — passed.
- `just` — passed, including 1897 non-integration pytest tests.

Roadmap row 3 remains open for the broader project-skill-state ownership cleanup.
