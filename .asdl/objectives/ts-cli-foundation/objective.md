# TS CLI Foundation (@asdl/clinkr + @asdl/core)

## Thesis

One record owns the shared TypeScript foundation beneath the core TS CLIs: the `@asdl/clinkr` schema-first command framework, the `@asdl/core` foundation package, and the reusable seams proven while migrating `plans`, `planned-branch`, and `asdl-dev`. Each CLI grew its own argv parsing, exec runtime, gateways, and test scaffolding because no shared layer existed; this record consolidates those seams bottom-up so future capability ports start on the foundation instead of growing another parallel stack. Consumer-specific adoption for `pr-address` now belongs to `pr-address-typescript-port`, with this record acting as the framework/core provider.

This Objective is a subobjective of `port-asdl-toolkit-to-typescript`, realizing its "minimal TS migration scaffold" and "internal JS/TS clinkr foundation" roadmap rows.

Created 2026-06-10 by consolidating `asdl-core-ts` and `ts-clinkr-commander`. Both records claimed the same umbrella row, and their open rows had begun to conflict: asdl-core-ts's planned "CLI scaffolding layer" duplicated what shipped clinkr v1 already is, and its "Result type and tri-state envelope" row contradicted the settled clinkr `legacyMachine` decision that defers uniform envelope adoption to the umbrella's migration-debt burn-down. Both parents' closed records preserve their full history.

## Scope

Remaining live scope carried from both parents:

- Framework/core prerequisites for the remaining `pr-address` consumer adoption. The `pr-address` CLI shell migration, operation semantics, cutover, and Python retirement are owned by `pr-address-typescript-port`; this record owns only reusable clinkr/core capabilities requested by that consumer.
- Shared git gateway in `@asdl/core`: one interface with real and in-memory implementations replacing the planned-branch/plans/asdl-dev gateways. Landed for `plans`, `planned-branch`, and `asdl-dev`: `currentBranch` is the shared name, `plans-git-adapter.ts` is deleted, and their in-memory git fakes are consolidated. `pr-address` adoption or any pr-address-specific gateway compatibility work is tracked in `pr-address-typescript-port`; new reusable core methods may still be added here only when that consumer proves a shared seam.
- Boundary-validation cleanup in `plans`, `planned-branch`, and `asdl-dev` is complete: saved-plan session evidence and planned-branch output evidence parse through private Zod object-boundary schemas, while `asdl-dev` checkpoint-message diagnostics stay as direct typed string validation because review confirmed there is no untyped object boundary there. The old hand-rolled object extractors are gone without laundering typed checkpoint issues through Zod.
- `asdl-dev` public surface: add `index.ts` plus an `exports` field and migrate `ccc`/`pi-extensions` off `asdl-dev/src/*` deep imports (15+ files in ccc today).
- Scenario-test harness consolidation: shell-level helpers in `@asdl/clinkr/testing` plus a `@asdl/core` testing export for non-shell fixtures (async temp-dir fixture, node-runtime CLI smoke helper); replace the quadruplicated node-runtime test and tripled temp-dir fixture.
- Record the payload/JSON-input ownership decision: `loadOperationPayload` and pr-address payload/reference policy stay package-local in `pr-address-typescript-port` for now. `@asdl/clinkr` should not grow first-class payload/reference support until at least one second consumer proves the seam.

Explicit conflict resolutions from the consolidation:

- `@asdl/clinkr` owns everything command-shell-shaped: parsing, help, machine envelope, `--json-schema`, and shell testing helpers. asdl-core-ts's "CLI scaffolding layer" row is superseded by clinkr and is not carried over.
- Envelope/Result adoption: clinkr's Python-parity envelope plus the `legacyMachine` escape hatch stands. Uniform envelope adoption, per-command negative/failure classification, and the raw-exit hatch burn-down remain umbrella debt (`port-asdl-toolkit-to-typescript/migration-debt.md`), not rows here. asdl-core-ts's "Result type and tri-state envelope" row is reframed accordingly: parked, with the migration-debt ledger as the owner.

## Non-Goals

- No npm publication or public API commitment for `@asdl/clinkr` or `@asdl/core` (umbrella scope).
- No Python clinkr feature ports without a current TS consumer (markdown renderers, command aliases, `Ensure`/`NonIdealState` idioms, context-factory machinery beyond what the four CLIs need).
- No ownership of `pr-address` operation semantics, quality remediation, or Python-fallback retirement — those belong to `pr-address-typescript-port`; this record owns only the clinkr shell migration.
- No reimplementation of pi-only workflows (e.g. `pi-extensions/planned-branch-extension.ts`); pi-side changes are limited to import-path and public-API updates.
- No unification of domain-specific fakes beyond the git gateway (vercel, checkpoint, brmem, legacy pr-address gateways stay per-package).
- No user-facing command contract redesign during migrations — existing flags, exit codes, and outputs are preserved unless a divergence is itself the bug being fixed, in which case it is called out explicitly.

## Completion Criteria

- `plans`, `planned-branch`, and `asdl-dev` build their command trees through `@asdl/clinkr`; no hand-rolled argv loops or hardcoded help/usage template literals remain for those migrated consumers.
- `pr-address` consumer adoption is explicitly owned by `pr-address-typescript-port`, with this record providing reusable clinkr/core prerequisites and recording any shared-framework follow-ups that consumer proves.
- The shared git gateway exists as isolated `@asdl/core/git` and `@asdl/core/git/testing` subpath exports, is adopted by `plans`, `planned-branch`, and `asdl-dev`, and `plans-git-adapter.ts` is deleted.
- Boundary validation in `plans` and `planned-branch` uses private Zod schemas rather than hand-rolled object extractors; `asdl-dev` checkpoint-message validation uses direct typed issue collection because that seam is already typed string input rather than an external object boundary.
- `asdl-dev` has a declared public surface and no workspace package deep-imports `asdl-dev/src/*`.
- The known duplicate non-pr-address test scaffolding is gone: the quadruplicated node-runtime CLI test and the tripled temp-dir fixture, with pr-address package-specific test consolidation owned by `pr-address-typescript-port`.
- The payload/JSON-input ownership decision is made and recorded: package-local in `pr-address-typescript-port` unless a later second consumer justifies clinkr extraction.
- The umbrella's "minimal TS migration scaffold" and "clinkr foundation" rows reference this record's outcome and the `pr-address-typescript-port` dependency.

## Assumptions and Risks

Assumptions:

- Schema-first parameter generation hardens across the remaining migrations without per-CLI parser shims; partially de-risked by the `plans` migration (first CLI migrated cleanly, and clinkr-side corrections — root version/runtime, compact legacy serialization, bare-group help — are reusable), further de-risked by the `planned-branch` migration (second consumer exercised required options, an enum with a default, boolean flags, an optional positional, and a file-writing side effect; zero clinkr changes were needed), and now exercised by the `asdl-dev` migration (third consumer moved all four flat commands and root dispatch onto clinkr; command-contract divergences are pinned in scenario tests).
- The four CLIs' flag surfaces fit the settled clinkr v1 type vocabulary (string/number/boolean/enum/string-array + optional/default), surveyed against all four CLIs. Revised 2026-06-11: `asdl-dev submit` showed that flag vocabulary was sufficient, but handler-owned output and raw process exit-code passthrough needed a deliberately isolated clinkr raw-exit hatch.

Risks:

- Coordination with `pr-address-typescript-port` on the same package: uncoordinated edits could conflict. Mitigation: sequence the pr-address shell migration last, after that record's payload-spec rows, per its sequenced roadmap.
- "New monolith" risk for `@asdl/core`: the package could accrete into the erk failure mode this repo exists to avoid. Mitigation: decoupled subpath-exported modules with no cross-module reach-through; a CLI can adopt one layer without the others. Partially de-risked by the `formatErrorMessage` sweep, which adopted `@asdl/core/primitives` as a narrow leaf dependency across `asdl-dev`, `pr-address`, `ccc`, `pi-extensions`, and `pi-extension-runtime` without pulling those packages onto unrelated core modules. Holding as of 2026-06-11: the legacy machine-contract plumbing, raw-exit hatch, entrypoint detection, and shared git gateway all shipped as isolated subpath exports (`@asdl/clinkr/legacy`, `@asdl/clinkr/raw`, `@asdl/core/cli-entry`, `@asdl/core/git`, and `@asdl/core/git/testing`) rather than accreting into package roots.
- Name collision: Python `packages/asdl-core` already exists; the TS package shares the name by design, but tooling, search, and contributor navigation may conflate them.

## Open Questions

Resolved:

- Resolved 2026-06-11: `asdl-dev`'s pi-ai generation path is buffered; the actual clinkr gap was `submit`'s handler-owned live subprocess output, interactive restack confirmation, timeout exit 124, and arbitrary `gt` exit-code passthrough. The isolated `@asdl/clinkr/raw` hatch satisfies that need without reshaping the normal `ClinkrExit` renderer contract.
- Resolved 2026-06-12: payload/JSON-input home is package-local in `pr-address-typescript-port` for now. `@asdl/clinkr` should not grow first-class payload/reference support until a second consumer proves the seam.

Still open:

- Does the `@asdl/core` testing export stay a subpath export, or does production/test dependency separation eventually force a sibling package? (Same question was resolved for clinkr — `@asdl/clinkr/testing` subpath — unless helpers grow deps clinkr should not carry.)
