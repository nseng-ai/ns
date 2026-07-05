# Semantic Update: JSON Input Kit Promotion

## Summary

Pulled the parked JSON-input loader promotion into `## Work` and completed it as a third-wave capability-kit promotion.

## Changes

- Added `@nseng-ai/capability-kit/json-input` with:
  - `loadJsonInput` for one-of inline option/file/stdin source loading, non-empty validation, JSON parsing, and Zod validation;
  - `readJsonInputText` for source-loading without schema parsing;
  - `parseJsonInputText` and `parseJsonInputValue` for already-loaded JSON text / unknown values with the same `invalid-json` / `invalid-request` error shape.
- Added the package export `./json-input` under the existing `kit` subpackage; no new `ns.subpackages` entry was added.
- Migrated pr-feedback consumers in `map-branch-prs.ts`, `branch-pr-checks.ts`, and `primitive-commands.ts` to the kit subpath and deleted the local `pr-feedback/src/json-input.ts` duplicate.
- Moved the JSON-input unit coverage to capability-kit and added parse-only coverage.
- Migrated reviews `record-findings` stdin parsing to `parseJsonInputText`; record-findings now surfaces kit-standard `invalid-json` / `invalid-request` failure types.
- Migrated findings-publication's local parse mechanics to kit parse-only helper while preserving its local publication payload error wrapper.
- Deliberately left reviews `findings-comment` machine-state parsing local because malformed legacy/comment state is intentionally non-blocking, and left Claude Code stdout parsing local to preserve the Claude/model boundary diagnostics.

## Validation

- `pnpm --dir ts --filter @nseng-ai/capability-kit test`
- `pnpm --dir ts --filter @nseng-ai/pr-feedback test`
- `pnpm --dir ts --filter @nseng-ai/reviews test`
- `pnpm --dir ts run check`
- `pnpm --dir ts run lint`
- `pnpm --dir ts run fmt:check`
- `just ts-test-typescript-style-guard`
- `just`
- Stale-reference checks for old pr-feedback helper imports and reviews parse sites.
