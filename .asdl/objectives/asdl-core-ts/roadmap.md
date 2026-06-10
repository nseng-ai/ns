# Roadmap

## Work

- [ ] Create the `asdl-core` workspace package seeded with the exact-duplicate utilities.
      Decide the npm name (`@asdl/core` vs `asdl-core`), wire workspace/tsconfig/exports, and move in the byte-identical `primitives.ts`, `isDirectCliInvocation`, and `ParseResult`/`parseFlagValue`/`parseFormat` helpers with all four CLIs consuming them. Single-source `brmem-cli.ts` here and point `planned-branch` and `pi-extension-runtime` at it.
      Evidence: duplicate files deleted; grep shows one definition of each helper in the workspace.
- [ ] Extract the unified subprocess exec runtime.
      Union of `asdl-dev/src/command-runner.ts` and `plans/src/command-runtime.ts` capabilities (AbortSignal, streaming callbacks, configurable timeout/kill-grace, exit codes 124/127); migrate all four CLIs' injection seams onto one abstraction, including timeout support for `pr-address`'s bare `ProcessRunner` and the duplicated `ExecResult`/`PiExecResultLike` types in `pi-extension-runtime`.
- [ ] Extract the shared git gateway with real and in-memory implementations.
      One interface replacing the planned-branch/plans/asdl-dev gateways and the git methods in `pr-address/src/gateways.ts`; unify `sourceBranch`/`currentBranch` naming and delete `plans-git-adapter.ts`; consolidate the per-package in-memory git fakes.
- [ ] Establish the canonical Result type and clinkr tri-state machine envelope.
      One discriminated Result shape and the `{exit_code: 0|1|2, data?, message?, error_type?}` envelope in asdl-core; migrate `plans`, `planned-branch`, and `asdl-dev` machine output off their `success:` variants and update all in-repo consumers (planned-branch `machine-envelope` parsing, pi-extension-runtime equivalents, skills that parse CLI JSON).
      Evidence: envelope schema defined once; consumer scenario tests pass against the new shape.
- [ ] Build the CLI scaffolding layer and migrate all four CLIs onto it.
      Command/flag parsing, help and version handling, entry-point detection, exit-code emission, and error-printing conventions — sized to what the four existing CLIs need, no speculative API. Coordinate with the `pr-address-ts-thermo-review-followups` argv-parser row so pr-address consolidates onto asdl-core rather than a package-local parser.
- [ ] Extract the shared scenario-test harness.
      `runWithFakes`-style CLI runner, async temp-dir fixture, and node-runtime smoke-test helper under a testing subpath export; replace the quadruplicated node-runtime test and tripled temp-dir fixture. Coordinate with the pr-address test-scaffolding consolidation row.
- [ ] Adopt Zod boundary validation in `plans`, `planned-branch`, and `asdl-dev`.
      Replace hand-rolled extractors (`requiredStringField`, `extractPlannedBranchEvidence`, `validateCheckpointMessage`, session-entry extraction) with Zod schemas; generalize `pr-address/src/json-input.ts` into asdl-core as the shared stdin/file/option JSON loader.
- [ ] Give `asdl-dev` a declared public surface and end deep imports.
      Add `index.ts` plus an `exports` field sized to what `ccc`/`pi-extensions` actually consume, then migrate their `asdl-dev/src/*` deep imports (15+ files) onto it.
- [ ] Reconcile the umbrella Objective with the shipped foundation.
      Update `port-asdl-toolkit-to-typescript`'s "minimal TS migration scaffold" and "clinkr foundation" rows to reference this record, resolve its parked clinkr package-identity item, and capture the foundation conventions in the porting playbook so the next capability port (`brmem`) starts on asdl-core.

## Parked

- npm publishing and released-package distribution for asdl-core (umbrella scope).
- Unifying domain-specific fakes beyond git (vercel, checkpoint, brmem, legacy pr-address gateways stay per-package).
- The `pi-extensions/planned-branch-extension.ts` workflow reimplementation (pi-only concern).
- Porting Python clinkr features beyond what the four existing CLIs need.
