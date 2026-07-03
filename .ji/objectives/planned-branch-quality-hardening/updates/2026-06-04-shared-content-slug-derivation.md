# Shared Content-Slug Derivation Implemented

## Summary

The shared content-slug derivation slice is implemented for the Pi planned-branch integration. Planned-branch creation and saved-plan filename generation now route through one shared `content-slug-derivation.ts` helper for Pi slug-model invocation, prompt common rules, normalization, validation, content truncation, and failure formatting.

## Objective Impact

This completes the roadmap row, "Shared content-slug derivation." The implementation preserves the two user-visible slugging contracts while removing the near-duplicate derivation paths:

- `derivePlanContentSlug` remains the `/planned-branch:create` wrapper that reads the selected plan file and uses planned-branch-specific prompt and no-fallback text;
- `deriveSavedPlanContentSlug` remains the `write_source_branch_plan_file` wrapper that accepts final plan content in memory and uses saved-plan filename-specific prompt and no-fallback text;
- semantic differences are now data on the variant config: slug kind, prompt intro lines, invalid-output message, failure header, and no-fallback sentence;
- shared behavior now lives in one helper: `deriveSlugWithModel` invocation, `normalizePlanContentSlugOutput`, `truncatePlanContentForSlug`, `validatePlanSlug`, and stdout failure formatting.

Evidence considered: working-tree diff on `shared-content-slug-derivation-planned-branch` with Graphite parent `planned-branch-cli-type-contract-cleanup`, with changes limited to `ts/packages/pi-extensions/src/planned-branch/plan-content-slug.ts`, `ts/packages/pi-extensions/src/planned-branch/saved-plan-content-slug.ts`, new `ts/packages/pi-extensions/src/planned-branch/content-slug-derivation.ts`, `ts/packages/pi-extensions/test/plan-content-slug.test.ts`, and this Objective update. PR evidence was unavailable and not required; local branch/worktree evidence was sufficient.

Verification: `cd ts/packages/pi-extensions && bun test`, `cd ts/packages/pi-extensions && bun run check`, `just ts-check`, and `just ts-test` passed.

## Follow-Ups

Continue with the remaining hardening rows: semantic gateway boundaries and public skills/docs accuracy. This slice does not close the Objective because those roadmap rows remain active.
