# Roadmap

## Work

- [x] Establish the initial migration ledger for active first-party capabilities.
  - Initial ledger recorded in `objective.md` with unstarted, TS-default, parked-pending-evidence, reference-source, and out-of-scope statuses.
  - Evidence: package metadata, first-party skill inventory, existing TS workspace packages, Graphite parent `master`, and PR #1148 for the umbrella Objective creation branch.
- [x] Create the `pr-address` capability subobjective as the first production vertical slice.
  - The umbrella Objective should name `pr-address` only as the proving slice; detailed operation design belongs in the subobjective.
  - Evidence: active subobjective `.asdl/objectives/pr-address-typescript-port/` now tracks the detailed `pr-address` TypeScript port contract inventory, migration boundary, cutover, and Python retirement work.
- [~] Define the minimal TS migration scaffold.
  - Capture package/layout conventions, command-runtime conventions, gateway interface conventions, golden-test conventions, and an initial porting checklist.
  - Standardize on the current TS workspace defaults: pnpm, Node ESM, strict TypeScript, and Vitest unless evidence forces a change.
  - Evidence: realized by the `ts-cli-foundation` subobjective (consolidated 2026-06-10 from `asdl-core-ts` + `ts-clinkr-commander`). `@asdl/core` shipped with `primitives`, the unified `exec` runtime (adopted by 7 packages), and `brmem-cli`; remaining scaffold work (shared git gateway, Zod boundary validation, test-harness consolidation) is tracked there.
- [~] Begin the internal JS/TS clinkr foundation incrementally.
  - Start with the smallest command runtime needed by the first vertical slice.
  - Grow toward a shared framework only when repeated capability ports prove stable API needs.
  - Evidence: realized by the `ts-cli-foundation` subobjective (consolidated 2026-06-10 from `asdl-core-ts` + `ts-clinkr-commander`). `@asdl/clinkr` v1 is built and `@asdl/plans` is migrated; the remaining migrations (`planned-branch`, `asdl-dev`, the `pr-address` shell) are tracked there. Package identity resolved: `@asdl/clinkr` + `@asdl/core` (formerly parked here as "Exact public API shape and package identity for JS/TS clinkr").
- [x] Complete the `pr-address` TypeScript cutover and Python retirement through its subobjective.
  - Evidence: `.asdl/objectives/pr-address-typescript-port/updates/2026-06-13T130734Z-plugin-retirement-and-python-deletion.md` records plugin retirement, deletion of `packages/asdl-pr-address`, golden-corpus relocation, external PyPI `0.1.1` rollback, standalone TS CLI as the sole active surface, and full-repo validation.
- [x] Refine a reusable porting playbook from the first full cutover.
  - Evidence: [`porting-playbook.md`](porting-playbook.md) promotes `pr-address` lessons into reusable guidance for later capability subobjectives, including inventory-first planning, vertical slices, local-before-shared seams, fake/parity evidence, intentional fallback retirement, distribution decisions, Semantic Updates, and Objective boundaries.
- [x] Select the next capability by the persisted capability order and fresh integration-leverage evidence.
  - Selected `brmem` as the second capability, holding the persisted order. Integration-leverage evidence confirmed rather than changed the default: TypeScript code already depended on `brmem` (the `@asdl/core/brmem-cli.ts` shell-out launcher and `branch-context/brmem-gateway.ts` consumer), so a native TS implementation had immediate reuse value while the actual capability was still Python-backed.
  - Evidence: active subobjective `.asdl/objectives/brmem-typescript-port/` now tracks the detailed `brmem` TypeScript port contract inventory, git-ref storage parity, operation ports, run-from-source distribution, and Python retirement work, modeled on `pr-address-typescript-port` and `porting-playbook.md`.
  - Remaining order after `brmem`: `handoff`, `objective`, `asdl-dispatcher`, roaster, `slot`, `vibechk`, then `aretro` last. Revisit only when new evidence materially changes usage, dependency, or strategic value.
- [ ] Repeat the capability subobjective pattern until all active first-party user-facing capabilities are TS-default.
  - Preserve stable CLI/skill contracts during takeover.
  - Add cleaner TS-native APIs behind or alongside those contracts where useful.
  - Keep Python only for a short explicit retirement phase after TS default, then delete or archive it when callers, docs, and tests no longer depend on it.
  - Evidence: `brmem` completed as the second TS-default capability and fed git-ref storage parity, package-local plumbing, run-from-source shim, and post-deletion reference lessons back into [`porting-playbook.md`](porting-playbook.md), the migration ledger, and Semantic Update `updates/2026-06-14T172101Z-brmem-cutover-playbook-lessons.md`.
  - Next planned capability remains `handoff` unless new evidence changes the order.
- [ ] Burn down the end-of-migration debt ledger (`migration-debt.md`).
  - Each entry is a transitional compromise (legacy machine-output shapes, snake_case schema keys, Python-parity envelope) accepted to keep the port moving; every entry must be killed or deliberately recommitted before the umbrella closes.
  - New compromises of this type made during capability subobjectives must be appended to `migration-debt.md` when they are accepted.
- [ ] Complete final migration cleanup.
  - Ensure public skills, wrappers, docs, package distribution, and migration ledger agree on the TS-default toolkit state.
  - Mark any remaining Python as deleted, archived, retired, or explicitly out of scope.

## Parked

- Detailed `pr-address` operation inventory, module design, and cutover mechanics.
- Direct browser-compatible execution for capabilities whose domains depend on local git, shell, filesystem, or authenticated system state.
- Porting inactive, vendored, experimental, or unclear-value Python code before evidence justifies it.
- Broad TypeScript rewrites of Python `asdl-core` concepts that have not yet appeared as repeated seams in vertical slices.
