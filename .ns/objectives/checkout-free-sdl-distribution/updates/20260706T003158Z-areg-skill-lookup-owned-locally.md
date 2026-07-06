# Areg Skill Lookup Owned Locally

## Summary

The `@nseng-ai/areg` public-package blocker from the full qualification preflight was resolved without publishing or depending on private Pi.

Implemented local changes:

- Added `ts/packages/tools/areg/src/skill-lookup.ts` as an areg-owned copy of the existing skill lookup primitive for `skills/`, `.agents/skills/`, and `.claude/skills/` roots.
- Retargeted areg import sites from `@nseng-ai/pi/skills/lookup` to the local `./skill-lookup.ts` / `../skill-lookup.ts` module.
- Removed `@nseng-ai/pi` from `ts/packages/tools/areg/package.json` runtime dependencies and refreshed `ts/pnpm-lock.yaml`.

Validation/evidence gathered:

- `rg "@nseng-ai/pi/skills/lookup" ts/packages/tools/areg ts/packages` returned no matches.
- `rg '"@nseng-ai/pi"' ts/packages/tools/areg/package.json ts/packages/tools/areg` returned no matches.
- `pnpm --dir ts --filter @nseng-ai/areg run check` passed.
- `pnpm --dir ts --filter @nseng-ai/areg run test` passed: 22 test files, 197 tests.
- `pnpm --dir ts run release:qualify-public -- --all` passed and ended with `Public package qualification completed without registry writes.`

No `npm publish` or registry write occurred; the qualification command used dry-run publish checks only.

## Objective Impact

This records the boundary decision: `@nseng-ai/areg` owns the skill lookup primitive it needs for standalone publication instead of retaining a runtime dependency on private/excluded `@nseng-ai/pi`. That keeps Pi private while preserving areg's skill root behavior and allows the complete intended public package set to pass local full qualification.

The Objective remains open. Full dry-run qualification is now green, but completion still requires registry-backed publication/verification for every intended public package and the release automation/CI row.

## Follow-Ups

- Keep the stale Pi `skills/lookup` export as-is for now; consider later cleanup only if no host consumers remain and the host API/context cleanup is intentionally scoped.
- Treat the repeated npm dry-run warnings about source `bin` entries being auto-corrected as separate release-polish evidence, not a blocker for this areg dependency boundary slice.
- Proceed separately with registry-backed publication/verification and release automation/CI for the intended public package set.
