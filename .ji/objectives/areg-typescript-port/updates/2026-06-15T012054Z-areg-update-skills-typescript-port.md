# areg update-skills TypeScript port complete

## Summary

Implemented the visible TypeScript `areg update-skills` command as the curated lockfile-preserving workaround for GitHub-sourced skills.

- Added a visible Clinkr command surface with semantic human output and JSON envelopes.
- Preserved the Python workaround semantics: read `skills-lock.json`, select only `sourceType: "github"` entries, support repeatable `--skill`, `--source`, and `--agent`, skip agent resolution and `npx` checks on no-match, avoid `npx` entirely in `--dry-run`, call `npx skills add` once per selected skill in sorted skill-name order, continue after individual failures, and return a nonzero aggregate result when any update fails.
- Added a dedicated read-only update inspection gateway instead of overloading `check` or `init` project gateways.
- Extracted shared lockfile parsing and project-agent resolution helpers so `check`, `init`, and `update-skills` reuse behavior without changing existing parser/config semantics.

## Objective Impact

This completes the roadmap row `Port areg update-skills as the curated lockfile workaround`.

Evidence added in this slice:

- Source: `ts/packages/areg/src/operations/update-skills.ts`, `cli.ts`, `context.ts`, `gateways.ts`, `fake-gateways.ts`, and `real-gateways.ts`.
- Shared helpers: `operations/lockfile.ts` and `operations/project-agents.ts` preserve existing `check`/`init` behavior while making the update command reuse the same lockfile/config semantics.
- Tests: scenario coverage for sorted one-by-one updates, local-skill skipping, `--skill`/`--source` filters, unknown skill early errors, no-match success without config/npx side effects, dry-run, agent precedence, invalid config, missing/malformed lockfiles, missing `npx`, aggregate partial failures, and success/failure JSON reports; gateway coverage for the update fake and real project inspection.
- Validation passed:
  - `pnpm --dir ts --filter @asdl/areg run check`
  - `pnpm --dir ts --filter @asdl/areg run test`

## Follow-Ups

- Public docs, skill instructions, caller cutover, distribution/install decisions, and Python package retirement remain deferred to the later distribution/cutover roadmap rows.
- The upstream `npx skills update` behavior is still treated as the reason this workaround exists; this slice does not redesign upstream skill-management behavior.
- Continue next with the TypeScript skill invocation profiles row unless Objective sequencing changes deliberately.
