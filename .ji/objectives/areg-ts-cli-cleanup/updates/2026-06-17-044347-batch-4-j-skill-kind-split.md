# Batch 4 J Skill-Kind Split Complete

## Summary

Batch 4 finding J is complete. `ts/packages/areg/src/operations/skill-kind.ts` now owns the CLI-facing shell: Clinkr request/result schemas, command group construction, command handlers, human renderers, and project resolution orchestration.

The extracted internals now live in focused modules:

- `skill-kind-inference.ts` owns skill invocation-kind constants/types, frontmatter inspection, record building, inference statuses, notes, and inspectable-skill validation.
- `skill-kind-apply-plan.ts` owns apply-plan types, pure planning helpers, sidecar and Pi settings planning, deletion prompts, mutation plan extraction, and operation status mapping.
- `skill-kind-frontmatter.ts` owns skill-kind-specific frontmatter desired state and frontmatter edit planning.

Repo-local internal consumers were updated to the focused inference module instead of preserving compatibility exports from the CLI shell. Scenario tests that exercise `runSkillKindApply` still import from `skill-kind.ts`, because that handler remains part of the CLI shell.

## Design Decision

The frontmatter parse/rewrite split is intentionally preserved. `skill-kind-frontmatter.ts` documents the rationale near `planFrontmatterOperation`: inference needs normalized key/value facts, while apply planning rewrites source text and must preserve delimiter bounds, line endings, unrelated keys, and body text. The low-level primitives remain in `frontmatter.ts`; the new module is only the skill-kind-specific policy wrapper.

## Objective Impact

Batch 4 is now complete. Remaining Objective work is Batch 5: shim rendering safety (G) and version source-of-truth cleanup/deferral (K). The Objective remains open.

## Verification

- `pnpm --dir ts run check` passed.
- `pnpm --dir ts run test -- ts/packages/areg/test/unit/skill-kind-inference.test.ts ts/packages/areg/test/scenario/skill-kind-list-show-cli.test.ts ts/packages/areg/test/scenario/skill-apply-cli.test.ts` passed; the workspace Vitest configuration observed 240 files / 2476 tests passing.
- Stale-symbol/import greps confirmed inference consumers now import `skill-kind-inference.ts`, the new modules do not import the CLI shell, and the remaining `skill-kind.ts` test import is for `runSkillKindApply`.

## Follow-Ups

Continue Batch 5 with shim rendering safety (G), then evaluate whether the version source-of-truth row (K) can be fixed cleanly or should be explicitly deferred with rationale.
