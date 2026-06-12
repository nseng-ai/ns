# Roadmap

## Work

- [x] Migrate `@asdl/planned-branch` to clinkr.
      Command tree built through `@asdl/clinkr` with a hidden `exec` subgroup; the hand-rolled argv loop and help template literals are deleted. `--format json` success/failure bytes preserved via `legacyMachine`; divergences pinned in the scenario suite (commander help/usage-error bytes, inline-equals acceptance, include-flags relaxation outside `--format json`). No clinkr changes were needed. Evidence: local branch diff against master; package suite, full TS workspace check/test, and the full `just` gate passed.
- [x] Migrate `asdl-dev` to clinkr.
      The four flat commands (`preview-url`, `cp`, `submit`, `pr-regen`) and the root command now build through `@asdl/clinkr`; the hand-rolled argv dispatch/help path is deleted. `preview-url --json`, checkpoint output, submit streaming/confirmation, timeout exit 124, and arbitrary `gt` exit-code passthrough are preserved via the isolated `@asdl/clinkr/raw` hatch; clinkr surface divergences are pinned in scenario tests. The pi-ai question is resolved: generation is buffered, while `submit` needed raw exit codes and handler-owned I/O rather than renderer-contract changes. Evidence: submitted Graphite stack PRs #1278–#1281; full TS workspace check/test and the full `just` gate passed; completion grep found no remaining hand-rolled asdl-dev argv/help patterns.
- [ ] Migrate the `@asdl/pr-address` CLI shell to clinkr, preserving legacy-Python fallback dispatch.
      Coordinate with `pr-address-typescript-port`; this record owns only the CLI shell, not operation semantics or Python retirement. Sequenced last among the migrations, after that record's payload-spec rows.
      Groundwork landed 2026-06-11: pr-address depends on `@asdl/clinkr` directly, its local `clinkr-envelope.ts` duplicate is deleted, and all call sites use the canonical envelope (`ok`/`negative`/`failure`/`emitExit`) plus `@asdl/core/cli-entry`. The shell itself (command tree, argv parsing, help) is still hand-rolled — that is the remaining work of this row.
- [~] Extract the shared git gateway into `@asdl/core` with real and in-memory implementations.
  `@asdl/core/git` and `@asdl/core/git/testing` now replace the planned-branch, plans, and asdl-dev gateways and in-memory fakes. Naming is unified on `currentBranch`; `plans-git-adapter.ts` and the backwards planned-branch-to-plans git type dependency are deleted. `trunkBranch` uses the Python-parity origin/HEAD probe with local verification/fallback. asdl-dev adopts the core error contract, including the accepted preview-url detached-head JSON divergence. Evidence: local Graphite stack diff against `core-git-gateway-consolidation`; per-phase TS workspace check/test passed. Remaining: pr-address git methods fold in during its shell migration.
- [ ] Decide and implement the payload/JSON-input home (clinkr first-class vs package-local).
      Recommendation: clinkr-first-class payload/reference support with pr-address as the proving consumer. Coordinate with `pr-address-typescript-port`'s payload-spec rows; final ownership of `loadOperationPayload` is this decision.
- [ ] Adopt Zod boundary validation in `plans`, `planned-branch`, and `asdl-dev`.
      Replace hand-rolled extractors (`requiredStringField`, `extractPlannedBranchEvidence`, `validateCheckpointMessage`, session-entry extraction) with Zod schemas.
- [ ] Give `asdl-dev` a declared public surface and end deep imports.
      Add `index.ts` plus an `exports` field sized to what `ccc`/`pi-extensions` actually consume, then migrate their `asdl-dev/src/*` deep imports (15+ files) onto it.
- [ ] Consolidate scenario-test scaffolding into `@asdl/clinkr/testing` plus a `@asdl/core` testing export.
      Shell-level helpers stay in `@asdl/clinkr/testing`; non-shell fixtures (async temp-dir fixture, node-runtime CLI smoke helper) get a `@asdl/core` testing export. Replace the quadruplicated node-runtime test and tripled temp-dir fixture. Coordinate with `pr-address-typescript-port`'s test-scaffolding row.
- [x] Reconcile the umbrella `port-asdl-toolkit-to-typescript`.
      Verified satisfied 2026-06-10: the umbrella's scaffold and clinkr rows already cite `ts-cli-foundation` as their realization, and its records show the package-identity question resolved as `@asdl/clinkr` + `@asdl/core`. No umbrella edits were required.

## Parked

- Uniform envelope adoption, per-command negative/failure classification, raw-exit hatch burn-down, and the Result-type migration — end-of-migration debt owned by the umbrella (`port-asdl-toolkit-to-typescript/migration-debt.md`), not work for this record.
- TS-native machine envelope redesign (umbrella `migration-debt.md` entry 3 governs revisit timing).
- npm publication and public API commitment for `@asdl/clinkr` and `@asdl/core`.
- Python clinkr features without a current TS consumer: markdown renderers, command aliases, `Ensure`/`NonIdealState` idioms, context-factory machinery beyond what the four CLIs need.
- Unifying domain-specific fakes beyond git (vercel, checkpoint, brmem, legacy pr-address gateways stay per-package).
- The `pi-extensions/planned-branch-extension.ts` workflow reimplementation (pi-only concern).
- Clinkr adoption in future capability ports (`brmem`, `handoff`, `objective`, …) — sequencing belongs to the umbrella objective.
