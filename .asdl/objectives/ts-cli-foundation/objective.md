# TS CLI Foundation (@asdl/clinkr + @asdl/core)

## Thesis

One record owns the shared TypeScript layer beneath the four core TS CLIs: the `@asdl/clinkr` schema-first command framework, the `@asdl/core` foundation package, and the migration of the four CLIs (`plans` ✅, `planned-branch` ✅, `asdl-dev`, `pr-address`) onto them. Each CLI grew its own argv parsing, exec runtime, gateways, and test scaffolding because no shared layer existed; this record consolidates those seams bottom-up from the proven implementations so future capability ports start on the foundation instead of growing another parallel stack.

This Objective is a subobjective of `port-asdl-toolkit-to-typescript`, realizing its "minimal TS migration scaffold" and "internal JS/TS clinkr foundation" roadmap rows.

Created 2026-06-10 by consolidating `asdl-core-ts` and `ts-clinkr-commander`. Both records claimed the same umbrella row, and their open rows had begun to conflict: asdl-core-ts's planned "CLI scaffolding layer" duplicated what shipped clinkr v1 already is, and its "Result type and tri-state envelope" row contradicted the settled clinkr `legacyMachine` decision that defers uniform envelope adoption to the umbrella's migration-debt burn-down. Both parents' closed records preserve their full history.

## Scope

Remaining live scope carried from both parents:

- Clinkr migrations of the remaining two CLIs (`planned-branch` shipped 2026-06-10): `asdl-dev` (resolving the pi-ai streaming question) and the `pr-address` CLI shell — shell only; operation semantics, cutover, and Python retirement stay with `pr-address-typescript-port`.
- Shared git gateway in `@asdl/core`: one interface with real and in-memory implementations replacing the planned-branch/plans/asdl-dev gateways and the git methods in `pr-address/src/gateways.ts`; unify `sourceBranch`/`currentBranch` naming; delete `plans-git-adapter.ts`; consolidate the per-package in-memory git fakes.
- Zod boundary validation in `plans`, `planned-branch`, and `asdl-dev`, replacing hand-rolled extractors (`requiredStringField`, `extractPlannedBranchEvidence`, `validateCheckpointMessage`, session-entry extraction).
- `asdl-dev` public surface: add `index.ts` plus an `exports` field and migrate `ccc`/`pi-extensions` off `asdl-dev/src/*` deep imports (15+ files in ccc today).
- Scenario-test harness consolidation: shell-level helpers in `@asdl/clinkr/testing` plus a `@asdl/core` testing export for non-shell fixtures (async temp-dir fixture, node-runtime CLI smoke helper); replace the quadruplicated node-runtime test and tripled temp-dir fixture.
- Decide and record the payload/JSON-input home. Recommendation: clinkr-first-class payload/reference support (the planted overlap note in `ts-clinkr-commander` concedes pr-address's reference-backed payload need "is that need"), with pr-address as the proving consumer. This decision row coordinates with `pr-address-typescript-port`'s absorbed payload-spec rows.

Explicit conflict resolutions from the consolidation:

- `@asdl/clinkr` owns everything command-shell-shaped: parsing, help, machine envelope, `--json-schema`, and shell testing helpers. asdl-core-ts's "CLI scaffolding layer" row is superseded by clinkr and is not carried over.
- Envelope/Result adoption: clinkr's Python-parity envelope plus the `legacyMachine` escape hatch stands. Uniform envelope adoption and per-command negative/failure classification remain umbrella debt (`port-asdl-toolkit-to-typescript/migration-debt.md` entries 1–4), not rows here. asdl-core-ts's "Result type and tri-state envelope" row is reframed accordingly: parked, with the migration-debt ledger as the owner.

## Non-Goals

- No npm publication or public API commitment for `@asdl/clinkr` or `@asdl/core` (umbrella scope).
- No Python clinkr feature ports without a current TS consumer (markdown renderers, command aliases, `Ensure`/`NonIdealState` idioms, context-factory machinery beyond what the four CLIs need).
- No ownership of `pr-address` operation semantics, quality remediation, or Python-fallback retirement — those belong to `pr-address-typescript-port`; this record owns only the clinkr shell migration.
- No reimplementation of pi-only workflows (e.g. `pi-extensions/planned-branch-extension.ts`); pi-side changes are limited to import-path and public-API updates.
- No unification of domain-specific fakes beyond the git gateway (vercel, checkpoint, brmem, legacy pr-address gateways stay per-package).
- No user-facing command contract redesign during migrations — existing flags, exit codes, and outputs are preserved unless a divergence is itself the bug being fixed, in which case it is called out explicitly.

## Completion Criteria

- All four CLIs build their command trees through `@asdl/clinkr`; no hand-rolled argv loops or hardcoded help/usage template literals remain under `ts/packages/*/src/`.
- The `pr-address` shell migration preserves its legacy-Python fallback dispatch behavior.
- The shared git gateway is adopted by the four CLIs and `plans-git-adapter.ts` is deleted.
- Boundary validation in `plans`, `planned-branch`, and `asdl-dev` uses Zod schemas rather than hand-rolled extractors.
- `asdl-dev` has a declared public surface and no workspace package deep-imports `asdl-dev/src/*`.
- The known duplicate test scaffolding is gone: the quadruplicated node-runtime CLI test and the tripled temp-dir fixture.
- The payload/JSON-input ownership decision is made and recorded, coordinated with `pr-address-typescript-port`.
- The umbrella's "minimal TS migration scaffold" and "clinkr foundation" rows reference this record's outcome.

## Assumptions and Risks

Assumptions:

- Schema-first parameter generation hardens across the remaining migrations without per-CLI parser shims; partially de-risked by the `plans` migration (first CLI migrated cleanly, and clinkr-side corrections — root version/runtime, compact legacy serialization, bare-group help — are reusable), and further de-risked by the `planned-branch` migration (second consumer exercised required options, an enum with a default, boolean flags, an optional positional, and a file-writing side effect; zero clinkr changes were needed).
- The four CLIs' flag surfaces fit the settled clinkr v1 type vocabulary (string/number/boolean/enum/string-array + optional/default), surveyed against all four CLIs.

Risks:

- Coordination with `pr-address-typescript-port` on the same package: uncoordinated edits could conflict. Mitigation: sequence the pr-address shell migration last, after that record's payload-spec rows, per its sequenced roadmap.
- "New monolith" risk for `@asdl/core`: the package could accrete into the erk failure mode this repo exists to avoid. Mitigation: decoupled subpath-exported modules with no cross-module reach-through; a CLI can adopt one layer without the others. Partially de-risked by the `formatErrorMessage` sweep, which adopted `@asdl/core/primitives` as a narrow leaf dependency across `asdl-dev`, `pr-address`, `ccc`, `pi-extensions`, and `pi-extension-runtime` without pulling those packages onto unrelated core modules.
- Name collision: Python `packages/asdl-core` already exists; the TS package shares the name by design, but tooling, search, and contributor navigation may conflate them.

## Open Questions

- Do `asdl-dev`'s pi-ai-dependent commands need anything beyond the clinkr v1 feature set (streaming output that resists the envelope model)? Stays open until the `asdl-dev` migration; a streaming need gets its own escape hatch rather than reshaping the renderer contract.
- Payload/JSON-input home: clinkr first-class vs package-local in pr-address. Recommendation recorded (clinkr-first-class, pr-address as proving consumer); the decision row in the roadmap finalizes it.
- Does the `@asdl/core` testing export stay a subpath export, or does production/test dependency separation eventually force a sibling package? (Same question was resolved for clinkr — `@asdl/clinkr/testing` subpath — unless helpers grow deps clinkr should not carry.)
