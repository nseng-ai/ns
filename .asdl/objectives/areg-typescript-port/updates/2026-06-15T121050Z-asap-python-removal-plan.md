# ASAP Python removal plan selected

## Summary

A parity check found that the TypeScript `@asdl/areg` implementation now covers the active `areg` feature surfaces, while the repo-local Python entry point is still the active `uv run areg` path.

Evidence inspected before this update:

- TypeScript CLI surface exposes `init`, `check`, `update-skills`, `skill list|show|apply`, and hidden `exec skillx parse|list|fetch|cleanup`.
- `node ts/packages/areg/src/cli.ts --runtime` reports `runtime: typescript`.
- `uv run areg --runtime` still reports `runtime: python`, proving cutover/removal has not happened yet.
- `node ts/packages/areg/src/cli.ts check --path .` and `uv run areg check --path .` both report `All skills OK.` against the current checkout.
- Focused TypeScript validation passed: `pnpm --dir ts/packages/areg run check` and `pnpm --dir ts/packages/areg run test`.
- Full TypeScript workspace validation passed: `pnpm --dir ts run check` and `pnpm --dir ts run test`.

This means the remaining work should be treated as cutover/removal, not feature porting.

## Objective Impact

The Objective now prioritizes removing the Python implementation as quickly as safely possible.

The previous post-kind review consolidation row remains acknowledged but is narrowed to blocker triage: only consolidation issues that directly threaten safe TS-default cutover or Python deletion should block removal. Broader architecture cleanup is parked so it does not keep `packages/areg` alive after parity is evidenced.

The immediate distribution decision is repo-local TypeScript invocation from the `ts/` workspace. External installed-use decisions such as npm-style package execution or generated shims are follow-up distribution work, not prerequisites for deleting the Python implementation from this repo.

The roadmap now sequences the remaining work as:

1. Triage post-kind review consolidation for Python-removal blockers only.
2. Cut over repo-local callers to TypeScript `areg` (`justfile`, CI, docs, skills, and hidden `exec skillx` JSON-envelope guidance).
3. Remove `packages/areg` and its uv/ruff/ty/pytest workspace wiring.
4. Record external distribution follow-up after repo-local cutover.
5. Feed reusable lessons back into the parent TypeScript migration Objective.

## Follow-Ups

- Start the next implementation session by replacing repo-local `uv run areg` callers with the TypeScript source/workspace invocation path and proving `just areg-check` runs TS-backed `areg`.
- Delete Python `packages/areg` only after caller migration and rollback/reference evidence are present in the same cutover branch.
- Update `skills/skillx/SKILL.md` for TypeScript `exec skillx` Clinkr JSON envelopes during the caller-docs cutover.
- Keep any non-blocking review-consolidation ideas as post-removal cleanup or feed them into the parent migration lessons rather than treating them as a prerequisite for Python deletion.
