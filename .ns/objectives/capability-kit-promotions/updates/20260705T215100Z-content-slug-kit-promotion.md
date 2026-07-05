# Content Slug Kit Promotion

## Summary

The second-wave content-slug row now has a kit-owned `@nseng-ai/capability-kit/content-slug` surface exported from `capability-kit/package.json`. The new module owns prompt assembly, model invocation through `deriveSlugWithModel`, first non-empty/code-fenced output extraction, kebab normalization, useful suffix stripping, word capping, truncation, model evidence, and no-fallback failure wrapping behind a variant config.

Plans now preserves its existing `@nseng-ai/plans` public API as compatibility wrappers over the kit helper, so branch-context consumers continue importing plan slug helpers from plans. Handoffs now defines a handoff-specific variant over the kit helper while retaining `validateHandoffContentSlug`, generic-only word rejection, handoff prompt wording, and handoff no-fallback failure text locally.

## Objective Impact

The content-slug Work row is `[x]`: the previous parallel model invocation, prompt/truncation, first-line/code-fence, normalization, and failure-flow copies in plans and handoffs have been collapsed to the kit helper without migrating branch-context off the plans API. Kit content-slug behavior is covered by new unit tests, and the package consumers passed targeted tests.

Validation evidence:

- `pnpm --dir ts --filter @nseng-ai/capability-kit test`
- `pnpm --dir ts --filter @nseng-ai/plans test`
- `pnpm --dir ts --filter @nseng-ai/handoffs test`
- `pnpm --dir ts --filter @nseng-ai/branch-context test`
- `pnpm --dir ts run fmt:check`
- `pnpm --dir ts run lint`
- `pnpm --dir ts run check`
- `just ts-test-typescript-style-guard`
- `just`
- grep verification showed `deriveSlugWithModel` remains only in the kit helper for the touched plans/handoffs content-slug path; plans/handoffs keep only compatibility/public wrappers for their old helper names.

## Follow-Ups

The remaining second-wave Work row is GitHub REST comment mechanics extraction into kit `github` with real/fake parity. Parked Tier 2/3 rows remain unchanged.
