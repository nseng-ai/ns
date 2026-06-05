# External boundary host environment gateway slice

## Summary

The host-tool and Git-root portion of the external-boundary remediation has landed in branch evidence via commit `0470dc19` ("[cp] Add environment gateway preconditions"). The change adds an injectable `AregEnvironment` gateway with real and fake implementations for `gh`/`npx` availability checks and Git-root discovery.

`AregContext` now carries the environment gateway alongside `GhCli` and `NpxSkills`. `preconditions.py` no longer calls global `shutil.which`; commands require host tools through `ctx.environment`. `init_project.py` no longer shells out to Git directly; Git-root discovery is delegated to `ctx.environment.require_git_root(...)` while the root-equality policy remains in init business logic.

Scenario precondition/init/skillx/update-skills tests now inject `FakeAregEnvironment` instead of patching global process state or running `git init` during scenario setup. Real gateway sanity tests cover missing `gh`, missing `npx`, missing `git`, Git command failure, empty Git root output, and successful Git-root discovery.

Evidence basis: local committed branch diff against Graphite parent `safer-areg-init-preflight`; no current-branch PR was available or required. Verification: targeted areg gateway/scenario suite passed; ruff check/format passed; `ty` passed; full `just` passed.

## Objective Impact

- Roadmap Work item #3 moved from `[ ]` to `[~]` because host-tool checks and Git-root discovery now have coherent injectable ownership, but broader project skill-state ownership and the `NpxSkills` fake/store boundary remain open.
- The open question about where tool availability and Git-root discovery should live is resolved for this slice: they are methods on the injectable `AregEnvironment` carried by `AregContext`.
- The gateway/fake cleanup risk is partially de-risked: scenario tests for init/preconditions/skillx/update-skills no longer depend on unrelated global process patching for host-tool or Git-root behavior. The risk remains active for installed skill trees versus project filesystem state.

## Follow-Ups

- Continue the remainder of roadmap Work item #3 by clarifying project skill-state ownership and deciding whether `NpxSkills.add` should keep side-effectful filesystem writes in the default fake or return an installed skill tree for a separate store to apply.
- Continue with typed lockfile validation, migrated skill docs/template reconciliation, and the final strict-review rerun rows.
