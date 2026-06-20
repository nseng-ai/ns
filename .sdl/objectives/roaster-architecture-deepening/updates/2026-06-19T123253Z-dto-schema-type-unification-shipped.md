# DTO Schema/Type Unification Shipped

## Summary

Candidate 2 now has branch-local shipped evidence. The `roaster-dto-schema-type-unification` branch makes `ts/packages/roaster/src/models.ts` the canonical source for `ReviewDefinition`, `ReviewApplicability`, `DiffFile`, and `DiffChangeKind` by deriving the TypeScript DTO types from Zod schemas. The behavior modules now import those canonical model types: `review-definition.ts` keeps parsing/error semantics and adds a final `reviewDefinitionSchema` invariant assertion, `review-applicability.ts` keeps applicability matching, and `diff-parsing.ts` keeps unified-diff parsing.

Evidence considered: Graphite parent `roaster-findings-publication-workflow`; current working-tree diff for candidate 2; field-by-field shape comparison before deleting duplicate DTO owners; stale-term checks for old DTO ownership; targeted roaster tests; full TypeScript format, lint, check, and test gates.

## Objective Impact

The roadmap marks candidate 2 complete. The Objective narrative now treats DTO schema/type unification as shipped depth rather than the next recommendation. The module-placement question is resolved for this slice: `models.ts` remains the canonical model/schema module, and no dedicated schema module was needed.

The schema/type drift risk is de-risked by the pre-delete shape comparison, the final parser schema assertion, canonical diff change-kind values, and validation coverage. The next substantive Objective slice is candidate 3, binding the execution environment into the roaster context.

## Follow-Ups

- Continue with candidate 3: bind `cwd`/`env` once at `runCli`, decide the cancellation story, and flatten the `RoasterCliContext` / `RoasterContext` double hop.
- Candidate 4 remains speculative until repository evidence confirms whether `RoasterFailure` structured fields should be shrunk or consumed.
