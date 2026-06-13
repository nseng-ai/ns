# Roadmap

## Work

- [x] Deepen classification into one module tested through one interface
      `classification.ts` now owns schemas, manifest-view construction, validation, planning, and template building behind the public validate/plan/template surface. The former `classification-shared`, `-validation`, `-planning`, and `-template` leaf modules are deleted; the private artifact pipeline is no longer exported. Evidence: local branch diff against Graphite parent `add-pr-address-ts-architecture-review`; `pnpm --dir ts run check` and `pnpm --dir ts run test` passed.
- [x] Consolidate stack-feedback prep/plan and unify discussion-triage
      `stack-feedback-triage.ts` now owns discussion-triage markers, schemas, types, hint classification, and summary building. Prep imports that owner, plan builds a local triage index instead of nested reach-through classification checks, and diff-current consumes producer-owned prep/plan schemas from focused contract modules. `stack-feedback-contracts.ts` is reduced to explicit named compatibility re-exports while prep and plan contracts live with their producing concepts. Evidence: local working-tree diff on top of Graphite parent `deepen-pr-address-classification-one-module`; `pnpm --dir ts run check`, `pnpm --dir ts run test`, and `git diff --check` passed.
- [x] Fold the payload store behind a filesystem seam
      `payload-store.ts` now owns the payload store/factory contract, the node-backed implementation, the in-memory implementation, JSON artifact lookup/pointer resolution, and payload manifest builders. `PrAddressContext` carries the high-level payload store factory, production uses the node factory, and tests can inject the in-memory factory through scenario support. `payload-lookup.ts` and `payload-manifest.ts` are deleted. Evidence: local working-tree diff on top of Graphite parent `stack-feedback-triage-contracts-plan-diff-current`; full `pnpm --dir ts run check`, full `pnpm --dir ts run test`, and `git diff --check` passed.
- [x] Absorb the shallow pass-throughs
      The pass-through modules `array-values.ts`, `operation-support.ts`, `string-values.ts`, and `reply-formatting.ts` are deleted. Their behavior is either local to the owning operation/domain modules or folded into `exec-operation.ts` where the concept belongs to exec command handling. Golden tests still cover byte-sensitive string/reply formatting after the move. Evidence: full `pnpm --dir ts run check`, full `pnpm --dir ts run test`, and `git diff --check` passed.
- [x] Collapse the dual schema definitions into one source of truth
      Resolved as still gated rather than forced. `@asdl/pr-address` operation specs currently do not provide clinkr `resultSchema` values, so clinkr-derived documents would emit empty output schemas and fail structural parity against the existing fixtures. The pinned `operation-schemas/` mirror remains intentionally in place until result schemas can be supplied and parity can pass without changing the schema surface.

## Parked

- [x] Decompose the stack-feedback `contracts.ts` hub (286 LOC mixing wire schemas, result types, and operation field specs) if Candidate 3 does not already dissolve it.
      Resolved by the stack-feedback prep/plan triage slice: focused prep and plan contract modules now own producer schemas/types, triage owns discussion classification, and the old hub remains only as an explicit named compatibility seam.
