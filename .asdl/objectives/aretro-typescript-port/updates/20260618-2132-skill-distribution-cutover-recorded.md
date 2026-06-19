# Skill Distribution Cutover Recorded

## Summary

The `aretro-ts/skill-distribution-cutover` branch makes TypeScript `@asdl/aretro` the repo-local default for the `branch-retro` evidence runner and active docs while preserving Python/prod fallbacks for the later retirement decision.

Changes:

- `skills/branch-retro/scripts/aretro-run` now detects `ts/packages/aretro/src/cli.ts` in an asdl checkout and runs the TypeScript CLI by default.
- `ASDL_ARETRO_MODE=local` still forces the Python repo-local command and `ASDL_ARETRO_MODE=prod` still uses the existing `uvx --from aretro==0.1.0` fallback.
- `just install-aretro` installs an opt-in TypeScript source shim; it was deliberately not added to broad `install-tools` because the audit found no active installed-tool consumer requiring it.
- Active docs-site install/tool pages now describe `aretro` as a TypeScript source-shim tool and no longer use Python `uv tool install aretro` or stale `asdl aretro` default examples.

Audit evidence:

- No active `uv tool install aretro` references remain outside Objective history.
- The only active `asdl aretro` reference outside Objective history is intentional negative guidance in `skills/branch-retro/SKILL.md`.
- `ASDL_ARETRO_MODE` and `uvx --from aretro` remain only in the runner fallback outside Objective history.
- No required checkout-free/prod consumer was found, so no external registry package or new distribution path was introduced.

Verification:

- `./skills/branch-retro/scripts/aretro-run --runtime` reported TypeScript.
- `./skills/branch-retro/scripts/aretro-run exec collect-evidence --help` displayed TypeScript CLI help.
- `ASDL_ARETRO_MODE=local ./skills/branch-retro/scripts/aretro-run --runtime` reported Python.
- `dprint check docs-site/src/content/docs/tools/aretro.md docs-site/src/content/docs/start/installation.md` passed.
- `just --summary` includes `install-aretro`.
- Active-reference grep after edits matched the classification above.

## Objective Impact

The roadmap row for branch-retro skill runner and active-docs cutover is complete in landed-state terms. The TypeScript implementation is now the default path for in-checkout skill use, with the old Python/prod path preserved only as an explicit fallback until retirement.

The Objective remains open for Python retirement, root workspace/build/lock cleanup, stale-reference sweep, rollback/reference evidence, and umbrella TypeScript migration Objective/playbook updates.

## Follow-Ups

- Continue with `aretro-ts-retire-python` only after preserving rollback/reference evidence for the Python implementation.
- During retirement, remove the preserved `uvx` fallback only after the final stale-reference sweep confirms no required checkout-free consumer needs it.
- Update `.asdl/objectives/port-asdl-toolkit-to-typescript/` and the porting playbook after Python retirement completes.
