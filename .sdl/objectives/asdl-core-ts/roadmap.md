# Roadmap

## Work

- [~] Create the `asdl-core` workspace package seeded with the exact-duplicate utilities.
  Primitive-only seed has landed: package name is scoped `@asdl/core`, `ts/packages/asdl-core` exists with root and `./primitives` exports, and the byte-identical `plans`/`planned-branch` `primitives.ts` pair (`isRecord`/`formatErrorMessage` only) is single-sourced there. `plans` and `planned-branch` consume `@asdl/core/primitives`, and the duplicate local primitive files are gone. CLI entrypoint/parsing helpers (`isDirectCliInvocation`, `ParseResult`, `parseFlagValue`, `parseFormat`) remain package-local by deliberate branch scope and should move with the CLI scaffolding row rather than this primitive seed. `brmem-cli.ts` remains deliberately excluded until after the exec-runtime row.
  Evidence: grep shows no `./primitives.ts` imports in `plans`/`planned-branch`, primitive definitions live only in `ts/packages/asdl-core/src/primitives.ts`, targeted checks/tests for `asdl-core`, `plans`, and `planned-branch` pass, and the full TS test suite passes. Full TS check is currently blocked in untouched `@asdl/pr-address` test code (`outsideCheckout` vs `isOutsideCheckout`), not by the primitive extraction.
- [x] Extract the unified subprocess exec runtime.
      `@asdl/core/exec` now owns the compact `ExecResult` contract, `CommandExecApi`, `NodeCommandExecApi`, `runCommand`, exec-result normalization, command display/output-tail formatting, timeout/startup conventions, AbortSignal propagation, env/cwd support, streaming callbacks, and configurable timeout kill grace. `plans`, `planned-branch`, `asdl-dev`, `pr-address`, `ccc`, `pi-extension-runtime`, and `pi-extensions` consume the core exec surface directly; obsolete package-local runtime implementations and pi-extension shims are gone. `pr-address` now routes real git/gh process calls through the shared runner with command timeouts. Evidence: old runtime import searches are empty; `pnpm --dir ts run test` and `pnpm --dir ts run check` pass.
- [x] Single-source `brmem-cli.ts` onto the unified exec runtime.
      `@asdl/core/brmem-cli` now hosts the brmem command-candidate resolver and first-available runner on top of `@asdl/core/exec`. `planned-branch` and `ccc` consume that core surface directly, and the former `planned-branch`, `pi-extension-runtime`, and `pi-extensions` brmem shim/duplicate files are removed. Evidence: one brmem-cli implementation remains in the TS workspace; old brmem import/file searches are empty; `pnpm --dir ts run test` and `pnpm --dir ts run check` pass.
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
