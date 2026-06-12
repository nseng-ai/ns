# Roadmap

## Work

- [x] Migrate `@asdl/planned-branch` to clinkr.
      Command tree built through `@asdl/clinkr` with a hidden `exec` subgroup; the hand-rolled argv loop and help template literals are deleted. `--format json` success/failure bytes preserved via `legacyMachine`; divergences pinned in the scenario suite (commander help/usage-error bytes, inline-equals acceptance, include-flags relaxation outside `--format json`). No clinkr changes were needed. Evidence: local branch diff against master; package suite, full TS workspace check/test, and the full `just` gate passed.
- [x] Migrate `asdl-dev` to clinkr.
      The four flat commands (`preview-url`, `cp`, `submit`, `pr-regen`) and the root command now build through `@asdl/clinkr`; the hand-rolled argv dispatch/help path is deleted. `preview-url --json`, checkpoint output, submit streaming/confirmation, timeout exit 124, and arbitrary `gt` exit-code passthrough are preserved via the isolated `@asdl/clinkr/raw` hatch; clinkr surface divergences are pinned in scenario tests. The pi-ai question is resolved: generation is buffered, while `submit` needed raw exit codes and handler-owned I/O rather than renderer-contract changes. Evidence: submitted Graphite stack PRs #1278–#1281; full TS workspace check/test and the full `just` gate passed; completion grep found no remaining hand-rolled asdl-dev argv/help patterns.
- [x] Transfer `@asdl/pr-address` consumer adoption ownership to `pr-address-typescript-port`.
      Decided 2026-06-12: this record owns the reusable clinkr/core provider layer, not package-specific pr-address migration work. The `pr-address` CLI shell migration, legacy-Python fallback preservation, package-specific git adoption, payload/reference policy, schema routes, distribution cutover, plugin retirement, and Python deletion are owned by `pr-address-typescript-port`. Groundwork already landed here remains provenance: pr-address depends on `@asdl/clinkr`, its local `clinkr-envelope.ts` duplicate is deleted, and call sites use the canonical envelope plus `@asdl/core/cli-entry`.
- [x] Extract the shared git gateway into `@asdl/core` with real and in-memory implementations.
      `@asdl/core/git` and `@asdl/core/git/testing` now replace the planned-branch, plans, and asdl-dev gateways and in-memory fakes. Naming is unified on `currentBranch`; `plans-git-adapter.ts` and the backwards planned-branch-to-plans git type dependency are deleted. `trunkBranch` uses the Python-parity origin/HEAD probe with local verification/fallback. asdl-dev adopts the core error contract, including the accepted preview-url detached-head JSON divergence. Evidence: local Graphite stack diff against `core-git-gateway-consolidation`; per-phase TS workspace check/test passed. `pr-address` adoption is no longer remaining work in this row; reusable core additions requested by that consumer should be justified from `pr-address-typescript-port`.
- [x] Decide the payload/JSON-input home.
      Decided 2026-06-12: `loadOperationPayload` and pr-address payload/reference policy stay package-local in `pr-address-typescript-port`. `@asdl/clinkr` should not grow first-class payload/reference support until a second consumer proves the seam. This row records the ownership boundary only; implementation belongs to the pr-address Objective.
- [x] Adopt Zod boundary validation in `plans`, `planned-branch`, and `asdl-dev`.
      Private Zod schemas now validate `@asdl/plans` saved-plan session evidence, `@asdl/planned-branch` output evidence, and `asdl-dev` checkpoint messages. Object-boundary schemas accept and strip unknown metadata; checkpoint validation keeps the public result shape while projecting Zod custom issues into project-owned repair-feedback issues. Evidence: local working-tree diff on branch `zod-boundary-validation-cli-packages`; targeted checks/tests for all three packages passed; full TS workspace check/test and the full `just` gate passed.
- [ ] Give `asdl-dev` a declared public surface and end deep imports.
      Add `index.ts` plus an `exports` field sized to what `ccc`/`pi-extensions` actually consume, then migrate their `asdl-dev/src/*` deep imports (15+ files) onto it.
- [ ] Consolidate shared scenario-test scaffolding into `@asdl/clinkr/testing` plus a `@asdl/core` testing export.
      Shell-level helpers stay in `@asdl/clinkr/testing`; non-shell fixtures (async temp-dir fixture, node-runtime CLI smoke helper) get a `@asdl/core` testing export. Replace the non-pr-address quadruplicated node-runtime test and tripled temp-dir fixture. `pr-address` package-specific harness/layout consolidation remains owned by `pr-address-typescript-port`; extract only helpers that prove reusable across packages.
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
